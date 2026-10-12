require('dotenv').config();
const path = require('path');
const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());
// Serve o front-end compilado (frontend/dist). Se ainda não foi gerado, usa a página simples em public/.
const fs = require('fs');
const pastaFront = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(fs.existsSync(pastaFront) ? pastaFront : path.join(__dirname, '..', 'public')));

const GRAVIDADES = ['AMARELO', 'VERMELHO'];
const REGISTRANTES = ['DIRETOR', 'VICE_DIRETOR', 'OUTROS'];

// Lista de escolas (para o campo de selecao)
app.get('/api/escolas', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, nome FROM escolas ORDER BY nome');
    res.json(rows);
  } catch (erro) {
    next(erro);
  }
});

// Registra uma ocorrencia
app.post('/api/ocorrencias', async (req, res, next) => {
  try {
    const {
      escola_id, data_ocorrencia, tipo, descricao,
      gravidade, registrado_por, registrado_por_outro,
    } = req.body;

    const erros = [];
    if (!Number.isInteger(Number(escola_id))) erros.push('Escolha a escola.');
    if (!data_ocorrencia) erros.push('Informe a data da ocorrência.');
    if (!GRAVIDADES.includes(gravidade)) erros.push('Escolha a gravidade: amarelo ou vermelho.');
    if (!REGISTRANTES.includes(registrado_por)) erros.push('Escolha quem registrou.');
    const outro = (registrado_por_outro || '').trim();
    if (registrado_por === 'OUTROS' && !outro) erros.push('Informe quem registrou.');
    if (erros.length) return res.status(400).json({ erros });

    const [resultado] = await pool.query(
      `INSERT INTO ocorrencias
         (escola_id, data_ocorrencia, tipo, descricao, gravidade, registrado_por, registrado_por_outro)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(escola_id), data_ocorrencia, (tipo || '').trim() || null,
        (descricao || '').trim() || null, gravidade, registrado_por,
        registrado_por === 'OUTROS' ? outro : null,
      ]
    );
    res.status(201).json({ id: resultado.insertId });
  } catch (erro) {
    next(erro);
  }
});

// Lista ocorrencias (filtros opcionais: gravidade, escola_id)
app.get('/api/ocorrencias', async (req, res, next) => {
  try {
    const filtros = [];
    const valores = [];
    if (GRAVIDADES.includes(req.query.gravidade)) {
      valores.push(req.query.gravidade);
      filtros.push('o.gravidade = ?');
    }
    if (Number.isInteger(Number(req.query.escola_id)) && req.query.escola_id) {
      valores.push(Number(req.query.escola_id));
      filtros.push('o.escola_id = ?');
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT o.id, e.nome AS escola, o.data_ocorrencia, o.tipo, o.descricao,
              o.gravidade, o.registrado_por, o.registrado_por_outro, o.status, o.criado_em
         FROM ocorrencias o
         JOIN escolas e ON e.id = o.escola_id
         ${where}
        ORDER BY o.data_ocorrencia DESC, o.id DESC
        LIMIT 200`,
      valores
    );
    res.json(rows);
  } catch (erro) {
    next(erro);
  }
});

// Ocorrencias vermelhas por escola (inclui escolas com zero)
app.get('/api/relatorios/vermelhas-por-escola', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.nome AS escola, COUNT(o.id) AS total_vermelhas
         FROM escolas e
         LEFT JOIN ocorrencias o
                ON o.escola_id = e.id AND o.gravidade = 'VERMELHO'
        GROUP BY e.id, e.nome
        ORDER BY total_vermelhas DESC, e.nome`
    );
    res.json(rows.map((r) => ({ escola: r.escola, total_vermelhas: Number(r.total_vermelhas) })));
  } catch (erro) {
    next(erro);
  }
});

app.use((erro, req, res, next) => {
  console.error(erro);
  res.status(500).json({ erros: ['Erro interno. Tente novamente.'] });
});

const porta = process.env.PORT || 3000;
app.listen(porta, () => console.log(`Servidor em http://localhost:${porta}`));
