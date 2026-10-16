const path = require('path');
const fs = require('fs');
const express = require('express');
const { GRAVIDADES, hojeISO, idValido, validarOcorrencia } = require('./validacao');

function criarApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (req, res) => res.status(200).send('ok'));
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
      const [resultado] = await pool.query(
        `INSERT INTO ocorrencias
           (escola_id, data_ocorrencia, tipo, descricao, gravidade, registrado_por, registrado_por_outro)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [dados.escola_id, dados.data_ocorrencia, dados.tipo, dados.descricao,
          dados.gravidade, dados.registrado_por, dados.registrado_por_outro]
      );
      res.status(201).json({ id: resultado.insertId });
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
                o.gravidade, o.registrado_por, o.registrado_por_outro, o.status, o.criado_em
           FROM ocorrencias o JOIN escolas e ON e.id = o.escola_id
           ${where} ORDER BY o.data_ocorrencia DESC, o.id DESC LIMIT 200`, valores
      );
      res.json(rows);
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
