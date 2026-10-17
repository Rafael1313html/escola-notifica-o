const path = require('path');
const fs = require('fs');
const express = require('express');
const { GRAVIDADES, hojeISO, idValido, validarOcorrencia } = require('./validacao');
const { validarAnexo } = require('./anexos');
const { validarDestinatarios } = require('./whatsapp');
const { admValido, lerToken, criarLink } = require('./acesso');

function comAnexo({ anexo_tipo, anexo_nome, anexo_url, anexo_tamanho, ...ocorrencia }) {
  return { ...ocorrencia,
    anexo: anexo_tipo ? { tipo: anexo_tipo, nome: anexo_nome, url: anexo_url, tamanho: anexo_tamanho } : null };
}

function criarApp(pool, { mensageria, env = process.env } = {}) {
  const app = express();
  app.set('case sensitive routing', true);
  app.set('strict routing', true);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/ocorrencias', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (req, res) => res.status(200).send('ok'));
  app.use(async (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || !/^\/api\/(ocorrencias(?:\/|$)|indicadores$|relatorios\/|acesso$)/.test(req.path)) return next();
    const autorizacao = req.get('Authorization') || '';
    if (admValido(autorizacao, env)) { req.perfil = 'ADM'; return next(); }
    const token = autorizacao.startsWith('Link ') ? lerToken(autorizacao.slice(5), env) : null;
    if (token) {
      try {
        const [pessoas] = await pool.query('SELECT numero, acesso_versao FROM whatsapp_destinatarios WHERE id = ?', [token.d]);
        if (pessoas[0]?.numero && pessoas[0].acesso_versao === token.r) {
          req.ocorrenciaInicial = token.o; req.perfil = 'RESPONSAVEL'; return next();
        }
      } catch (erro) { return next(erro); }
    }
    return res.status(401).json({ erros: ['Acesso restrito ao ADM ou ao link recebido pelo responsável.'] });
  });
  app.get('/api/acesso', (req, res) => res.json({ perfil: req.perfil, ocorrencia_id: req.ocorrenciaInicial || null, escopo: 'REDE' }));
  if (mensageria) {
    app.patch('/api/admin/ocorrencias/:id', mensageria.proteger, async (req, res, next) => {
      if (!idValido(req.params.id)) return res.status(400).json({ erros: ['Registro inválido.'] });
      const { erros, dados } = validarOcorrencia(req.body);
      if (erros.length) return res.status(400).json({ erros });
      try {
        const [resultado] = await pool.query(`UPDATE ocorrencias SET escola_id = ?, data_ocorrencia = ?, tipo = ?, descricao = ?,
          gravidade = ?, registrado_por = ?, registrado_por_outro = ? WHERE id = ?`, [dados.escola_id, dados.data_ocorrencia,
          dados.tipo, dados.descricao, dados.gravidade, dados.registrado_por, dados.registrado_por_outro, Number(req.params.id)]);
        if (!resultado.affectedRows) return res.status(404).json({ erros: ['Ocorrência não encontrada.'] });
        res.json({ alterado: true });
      } catch (erro) { next(erro); }
    });
    app.delete('/api/admin/ocorrencias/:id', mensageria.proteger, async (req, res, next) => {
      if (!idValido(req.params.id)) return res.status(400).json({ erros: ['Registro inválido.'] });
      try {
        const [resultado] = await pool.query('DELETE FROM ocorrencias WHERE id = ?', [Number(req.params.id)]);
        if (!resultado.affectedRows) return res.status(404).json({ erros: ['Ocorrência não encontrada.'] });
        res.json({ excluido: true });
      } catch (erro) { next(erro); }
    });
    app.get('/api/admin/whatsapp', mensageria.proteger, async (req, res, next) => {
      try { res.json(await mensageria.configuracao()); } catch (erro) { next(erro); }
    });
    app.put('/api/admin/whatsapp', mensageria.proteger, async (req, res, next) => {
      const { erros, dados } = validarDestinatarios(req.body);
      if (erros.length) return res.status(400).json({ erros });
      try { await mensageria.salvar(dados); res.json({ salvo: true }); } catch (erro) { next(erro); }
    });
    app.post('/api/admin/ocorrencias/:id/links', mensageria.proteger, async (req, res, next) => {
      if (!idValido(req.params.id)) return res.status(400).json({ erros: ['Registro inválido.'] });
      try {
        const [registros] = await pool.query('SELECT id FROM ocorrencias WHERE id = ?', [Number(req.params.id)]);
        if (!registros.length) return res.status(404).json({ erros: ['Ocorrência não encontrada.'] });
        const [pessoas] = await pool.query("SELECT id, acesso_versao FROM whatsapp_destinatarios WHERE numero <> ''");
        res.json({ links: pessoas.map((p) => ({ destinatario: p.id, url: criarLink(env, Number(req.params.id), p.id, p.acesso_versao) })), validade_dias: 7 });
      } catch (erro) { next(erro); }
    });
  }
  // Serve o front-end compilado (frontend/dist). Se ainda não foi gerado, usa a página simples em public/.
  const pastaFront = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(fs.existsSync(pastaFront) ? pastaFront : path.join(__dirname, '..', 'public')));

  // Lista de escolas (para o campo de selecao)
  app.get('/api/escolas', async (req, res, next) => {
    try {
      const [rows] = await pool.query('SELECT id, nome FROM escolas ORDER BY nome');
      res.json(rows);
    } catch (erro) { next(erro); }
  });

  // Registra uma ocorrencia
  app.post('/api/ocorrencias', async (req, res, next) => {
    try {
      const { erros, dados } = validarOcorrencia(req.body);
      if (erros.length) return res.status(400).json({ erros });
      const validacaoAnexo = validarAnexo(req.body.anexo);
      if (validacaoAnexo.erros.length) return res.status(400).json({ erros: validacaoAnexo.erros });
      const anexo = validacaoAnexo.anexo;
      const transacao = Boolean(anexo || mensageria);
      const conexao = transacao ? await pool.getConnection() : pool;
      let resultado;
      let whatsapp;
      try {
        if (transacao) await conexao.beginTransaction();
        [resultado] = await conexao.query(
          `INSERT INTO ocorrencias
             (escola_id, data_ocorrencia, tipo, descricao, gravidade, registrado_por, registrado_por_outro)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [dados.escola_id, dados.data_ocorrencia, dados.tipo, dados.descricao,
            dados.gravidade, dados.registrado_por, dados.registrado_por_outro]
        );
        if (anexo) {
          await conexao.query(`INSERT INTO ocorrencia_anexos
            (ocorrencia_id, tipo, nome, url, tamanho, arquivo) VALUES (?, ?, ?, ?, ?, ?)`,
          [resultado.insertId, anexo.tipo, anexo.nome || null, anexo.url || null, anexo.tamanho || null, anexo.arquivo || null]);
        }
        if (mensageria) whatsapp = await mensageria.enfileirar(conexao, resultado.insertId);
        if (transacao) await conexao.commit();
      } catch (erro) {
        if (transacao) await conexao.rollback();
        throw erro;
      } finally {
        if (transacao) conexao.release();
      }
      res.status(201).json({ id: resultado.insertId, ...(whatsapp ? { whatsapp } : {}) });
    } catch (erro) { next(erro); }
  });

  // Lista ocorrencias (filtros opcionais: gravidade, escola_id)
  app.get('/api/ocorrencias', async (req, res, next) => {
    try {
      const filtros = [];
      const valores = [];
      if (req.query.gravidade !== undefined) {
        if (!GRAVIDADES.includes(req.query.gravidade)) return res.status(400).json({ erros: ['Gravidade inválida.'] });
        valores.push(req.query.gravidade);
        filtros.push('o.gravidade = ?');
      }
      if (req.query.escola_id !== undefined) {
        if (!idValido(req.query.escola_id)) return res.status(400).json({ erros: ['Escola inválida.'] });
        valores.push(Number(req.query.escola_id));
        filtros.push('o.escola_id = ?');
      }
      const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
      const [rows] = await pool.query(
        `SELECT o.id, e.nome AS escola, o.data_ocorrencia, o.tipo, o.descricao,
                o.gravidade, o.registrado_por, o.registrado_por_outro, o.status, o.criado_em,
                a.tipo AS anexo_tipo, a.nome AS anexo_nome, a.url AS anexo_url, a.tamanho AS anexo_tamanho
           FROM ocorrencias o JOIN escolas e ON e.id = o.escola_id
           LEFT JOIN ocorrencia_anexos a ON a.ocorrencia_id = o.id
           ${where} ORDER BY o.data_ocorrencia DESC, o.id DESC LIMIT 200`, valores
      );
      res.json(rows.map(comAnexo));
    } catch (erro) { next(erro); }
  });

  app.get('/api/ocorrencias/:id', async (req, res, next) => {
    if (!idValido(req.params.id)) return res.status(400).json({ erros: ['Registro inválido.'] });
    try {
      const [rows] = await pool.query(`SELECT o.id, e.nome AS escola, o.data_ocorrencia, o.tipo, o.descricao,
        o.gravidade, o.registrado_por, o.registrado_por_outro, o.status, o.criado_em,
        a.tipo AS anexo_tipo, a.nome AS anexo_nome, a.url AS anexo_url, a.tamanho AS anexo_tamanho
        FROM ocorrencias o JOIN escolas e ON e.id = o.escola_id
        LEFT JOIN ocorrencia_anexos a ON a.ocorrencia_id = o.id WHERE o.id = ?`, [Number(req.params.id)]);
      if (!rows.length) return res.status(404).json({ erros: ['Ocorrência não encontrada.'] });
      res.json(comAnexo(rows[0]));
    } catch (erro) { next(erro); }
  });

  app.get('/api/ocorrencias/:id/anexo', async (req, res, next) => {
    if (!idValido(req.params.id)) return res.status(400).json({ erros: ['Registro inválido.'] });
    try {
      const [rows] = await pool.query('SELECT nome, arquivo FROM ocorrencia_anexos WHERE ocorrencia_id = ? AND tipo = ?', [Number(req.params.id), 'PDF']);
      if (!rows.length) return res.status(404).json({ erros: ['PDF não encontrado para esta ocorrência.'] });
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Security-Policy', "sandbox; default-src 'none'");
      res.attachment(rows[0].nome);
      res.send(rows[0].arquivo);
    } catch (erro) { next(erro); }
  });

  app.get('/api/indicadores', async (req, res, next) => {
    try {
      const hoje = hojeISO();
      const inicio = new Date(`${hoje.slice(0, 7)}-01T12:00:00Z`);
      inicio.setUTCMonth(inicio.getUTCMonth() - 5);
      const [[totais], [meses]] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS total_ocorrencias,
          COALESCE(SUM(gravidade = 'VERMELHO'), 0) AS total_vermelhas,
          COALESCE(SUM(gravidade = 'AMARELO'), 0) AS total_amarelas,
          COUNT(DISTINCT escola_id) AS escolas_com_registros,
          (SELECT COUNT(*) FROM escolas) AS total_escolas FROM ocorrencias`),
        pool.query(`SELECT DATE_FORMAT(data_ocorrencia, '%Y-%m') AS mes,
          COUNT(*) AS total, SUM(gravidade = 'VERMELHO') AS vermelhas,
          SUM(gravidade = 'AMARELO') AS amarelas FROM ocorrencias
          WHERE data_ocorrencia >= ? AND data_ocorrencia <= ? GROUP BY mes ORDER BY mes`,
        [inicio.toISOString().slice(0, 10), hoje]),
      ]);
      res.json({
        ...Object.fromEntries(Object.entries(totais[0]).map(([chave, valor]) => [chave, Number(valor)])),
        meses: meses.map((item) => ({ mes: item.mes, total: Number(item.total),
          vermelhas: Number(item.vermelhas), amarelas: Number(item.amarelas) })),
      });
    } catch (erro) { next(erro); }
  });

  // Ocorrencias vermelhas por escola (inclui escolas com zero)
  app.get('/api/relatorios/vermelhas-por-escola', async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT e.nome AS escola, COUNT(o.id) AS total_vermelhas FROM escolas e
         LEFT JOIN ocorrencias o ON o.escola_id = e.id AND o.gravidade = 'VERMELHO'
         GROUP BY e.id, e.nome ORDER BY total_vermelhas DESC, e.nome`
      );
      res.json(rows.map((r) => ({ escola: r.escola, total_vermelhas: Number(r.total_vermelhas) })));
    } catch (erro) { next(erro); }
  });

  app.use('/api', (req, res) => res.status(404).json({ erros: ['Recurso não encontrado.'] }));
  app.use((erro, req, res, next) => {
    if (res.headersSent) return next(erro);
    if (erro.type === 'entity.parse.failed') return res.status(400).json({ erros: ['JSON inválido.'] });
    if (erro.type === 'entity.too.large') return res.status(413).json({ erros: ['O conteúdo enviado excede o limite permitido.'] });
    if (erro.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ erros: ['Escolha uma escola cadastrada.'] });
    console.error('Falha na API:', erro.code || erro.name);
    res.status(500).json({ erros: ['Não foi possível concluir a operação. Tente novamente.'] });
  });
  return app;
}

module.exports = { criarApp };
