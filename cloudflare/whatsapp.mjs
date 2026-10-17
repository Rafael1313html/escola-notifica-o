import mensageria from '../src/whatsapp.js';
import acesso from '../src/acesso.js';

export const { DESTINATARIOS, validarDestinatarios } = mensageria;

export function linkOcorrencia(env, id) {
  try {
    const url = new URL(env.APP_PUBLIC_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    url.hash = `ocorrencias/${id}`;
    return url.href;
  } catch { return null; }
}

export function pronto(env) {
  return env.WHATSAPP_ENABLED === 'true' && Boolean(env.WHATSAPP_TOKEN
    && /^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID || '') && /^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION || '')
    && env.WHATSAPP_TEMPLATE && (env.ADMIN_WHATSAPP_KEY || '').length >= 32 && linkOcorrencia(env, 1));
}

// O cron retoma a fila persistente, mesmo quando não há visitantes no site.
// A tomada condicional de cada aviso impede dois Workers de enviarem o mesmo item.
export async function processarAvisos(env, enviar = fetch) {
  if (!pronto(env)) return;
  const db = env.DB;
  await db.prepare(`UPDATE whatsapp_envios SET status = 'INCERTO', atualizado_em = CURRENT_TIMESTAMP
    WHERE status = 'PROCESSANDO' AND atualizado_em < datetime('now', '-10 minutes')`).run();
  const { results } = await db.prepare(`SELECT w.id, w.numero, w.ocorrencia_id, w.destinatario_id, w.acesso_versao, e.nome AS escola,
    o.data_ocorrencia, o.gravidade FROM whatsapp_envios w JOIN ocorrencias o ON o.id = w.ocorrencia_id
    JOIN escolas e ON e.id = o.escola_id WHERE w.status = 'PENDENTE' ORDER BY w.id LIMIT 6`).all();
  await Promise.all(results.map(async (item) => {
    const claim = await db.prepare(`UPDATE whatsapp_envios SET status = 'PROCESSANDO', atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'PENDENTE'`).bind(item.id).run();
    if (!claim.meta.changes) return;
    const pessoa = await db.prepare('SELECT numero, acesso_versao FROM whatsapp_destinatarios WHERE id = ?').bind(item.destinatario_id).first();
    if (!pessoa?.numero || pessoa.numero !== item.numero || pessoa.acesso_versao !== item.acesso_versao) {
      await db.prepare("UPDATE whatsapp_envios SET status = 'FALHOU', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").bind(item.id).run();
      return;
    }
    let status = 'INCERTO';
    let mensagemId = null;
    try {
      const resposta = await enviar(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: item.numero, type: 'template',
          template: { name: env.WHATSAPP_TEMPLATE, language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR' },
            components: [{ type: 'body', parameters: [String(item.ocorrencia_id), item.escola,
              item.data_ocorrencia, item.gravidade, acesso.criarLink(env, item.ocorrencia_id, item.destinatario_id, item.acesso_versao)].map((text) => ({ type: 'text', text })) }] } }),
      });
      if (resposta.ok) {
        mensagemId = (await resposta.json()).messages?.[0]?.id || null;
        status = mensagemId ? 'ACEITO' : 'INCERTO';
      } else status = 'FALHOU';
    } catch { /* Não repetir um envio cujo recebimento pela Meta é desconhecido. */ }
    await db.prepare('UPDATE whatsapp_envios SET status = ?, mensagem_id = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(status, mensagemId, item.id).run();
  }));
}
