const { timingSafeEqual } = require('node:crypto');

const DESTINATARIOS = [
  { id: 'marcela', nome: 'Marcela', cargo: 'Dirigente' },
  { id: 'alexandra', nome: 'Alexandra', cargo: 'Supervisora' },
  { id: 'susana', nome: 'Susana', cargo: 'Supervisora' },
  { id: 'mercia', nome: 'Mercia', cargo: 'PEC · ADM' },
  { id: 'monica', nome: 'Monica', cargo: 'PEC' },
  { id: 'camila', nome: 'Camila', cargo: 'CEC' },
];

function validarDestinatarios(corpo) {
  const itens = corpo?.destinatarios;
  if (!Array.isArray(itens) || itens.length !== 6 || new Set(itens.map((i) => i?.id)).size !== 6) {
    return { erros: ['Informe os seis destinatários.'] };
  }
  const dados = [];
  const erros = [];
  for (const pessoa of DESTINATARIOS) {
    const item = itens.find((i) => i?.id === pessoa.id);
    if (!item || typeof item.numero !== 'string' || item.numero.length > 30 || /[^\d+()\s-]/.test(item.numero)) {
      erros.push(`Número inválido para ${pessoa.nome}.`);
      continue;
    }
    const numero = item.numero.replace(/\D/g, '');
    if (numero && !/^[1-9]\d{7,14}$/.test(numero)) erros.push(`Informe DDI e DDD para ${pessoa.nome}.`);
    dados.push({ id: pessoa.id, numero });
  }
  const preenchidos = dados.map((i) => i.numero).filter(Boolean);
  if (new Set(preenchidos).size !== preenchidos.length) erros.push('Use um número diferente para cada destinatário.');
  return { erros, dados };
}

function criarMensageria(pool, env = process.env, enviar = fetch) {
  function linkOcorrencia(id) {
    try {
      const url = new URL(env.APP_PUBLIC_URL);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
      url.hash = `ocorrencias/${id}`;
      return url.href;
    } catch { return null; }
  }
  const pronto = () => env.WHATSAPP_ENABLED === 'true'
    && Boolean(env.WHATSAPP_TOKEN && /^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID || '')
      && /^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION || '') && env.WHATSAPP_TEMPLATE && linkOcorrencia(1));

  function proteger(req, res, next) {
    const chave = env.ADMIN_WHATSAPP_KEY || '';
    if (chave.length < 32) return res.status(503).json({ erros: ['O acesso ADM ainda não foi configurado no servidor.'] });
    const recebido = Buffer.from(req.get('Authorization') || '');
    const esperado = Buffer.from(`Bearer ${chave}`);
    if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
      return res.status(401).json({ erros: ['Chave ADM inválida.'] });
    }
    next();
  }

  async function configuracao() {
    const [rows] = await pool.query('SELECT id, numero FROM whatsapp_destinatarios');
    const [envios] = await pool.query(`SELECT id, ocorrencia_id, destinatario_id, status, atualizado_em
      FROM whatsapp_envios ORDER BY id DESC LIMIT 30`);
    return { ativo: pronto(), destinatarios: DESTINATARIOS.map((p) => ({ ...p,
      numero: rows.find((r) => r.id === p.id)?.numero || '' })), envios };
  }

  async function salvar(dados) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      for (const item of dados) {
        await conexao.query(`INSERT INTO whatsapp_destinatarios (id, numero) VALUES (?, ?)
          ON DUPLICATE KEY UPDATE numero = VALUES(numero)`, [item.id, item.numero]);
      }
      await conexao.commit();
    } catch (erro) { await conexao.rollback(); throw erro; }
    finally { conexao.release(); }
  }

  async function enfileirar(conexao, id) {
    if (!pronto()) return { status: 'NAO_CONFIGURADO', total: 0 };
    const [resultado] = await conexao.query(`INSERT INTO whatsapp_envios (ocorrencia_id, destinatario_id, numero)
      SELECT ?, id, numero FROM whatsapp_destinatarios WHERE numero <> ''`, [id]);
    return { status: resultado.affectedRows ? 'PENDENTE' : 'SEM_DESTINATARIOS', total: resultado.affectedRows };
  }

  let executando = false;
  async function processar() {
    if (!pronto() || executando) return;
    executando = true;
    try {
      // Uma interrupção após o envio pode deixar o resultado desconhecido. Não reenviar automaticamente.
      await pool.query(`UPDATE whatsapp_envios SET status = 'INCERTO'
        WHERE status = 'PROCESSANDO' AND atualizado_em < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`);
      const [pendentes] = await pool.query(`SELECT w.id, w.numero, w.ocorrencia_id, e.nome AS escola,
        o.data_ocorrencia, o.gravidade FROM whatsapp_envios w
        JOIN ocorrencias o ON o.id = w.ocorrencia_id JOIN escolas e ON e.id = o.escola_id
        WHERE w.status = 'PENDENTE' ORDER BY w.id LIMIT 6`);
      await Promise.all(pendentes.map(async (item) => {
        const [claim] = await pool.query(`UPDATE whatsapp_envios SET status = 'PROCESSANDO'
          WHERE id = ? AND status = 'PENDENTE'`, [item.id]);
        if (!claim.affectedRows) return;
        let status = 'INCERTO';
        let mensagemId = null;
        try {
          const resposta = await enviar(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
            method: 'POST', signal: AbortSignal.timeout(10000),
            headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: item.numero, type: 'template',
              template: { name: env.WHATSAPP_TEMPLATE, language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR' },
                components: [{ type: 'body', parameters: [String(item.ocorrencia_id), item.escola,
                  item.data_ocorrencia, item.gravidade, linkOcorrencia(item.ocorrencia_id)].map((text) => ({ type: 'text', text })) }] } }),
          });
          if (resposta.ok) {
            const corpo = await resposta.json();
            mensagemId = corpo.messages?.[0]?.id || null;
            status = mensagemId ? 'ACEITO' : 'INCERTO';
          } else status = 'FALHOU';
        } catch { /* Timeout ou conexão interrompida: não é possível garantir se o provedor recebeu. */ }
        await pool.query('UPDATE whatsapp_envios SET status = ?, mensagem_id = ? WHERE id = ?', [status, mensagemId, item.id]);
      }));
    } finally { executando = false; }
  }

  function iniciar() {
    const executar = () => processar().catch((erro) => console.error('Falha na fila WhatsApp:', erro.code || erro.name));
    const timer = setInterval(executar, 5000);
    timer.unref();
    executar();
    return () => clearInterval(timer);
  }
  return { proteger, configuracao, salvar, enfileirar, processar, iniciar };
}

module.exports = { criarMensageria, validarDestinatarios, DESTINATARIOS };
