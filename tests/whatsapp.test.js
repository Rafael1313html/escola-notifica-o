const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { criarApp } = require('../src/app');
const { criarMensageria, validarDestinatarios, DESTINATARIOS } = require('../src/whatsapp');

const env = { ADMIN_WHATSAPP_KEY: 'a'.repeat(40), WHATSAPP_ENABLED: 'true', WHATSAPP_TOKEN: 'token-secreto',
  WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_API_VERSION: 'v99.0', WHATSAPP_TEMPLATE: 'ocorrencia_registrada',
  APP_PUBLIC_URL: 'https://escola.example.com/' };
const numeros = () => DESTINATARIOS.map((p, i) => ({ id: p.id, numero: `+55 (11) 99999-000${i}` }));

async function servidor(t, pool, mensageria) {
  const app = criarApp(pool, { mensageria }).listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => new Promise((resolve) => { app.closeAllConnections(); app.close(resolve); }));
  return `http://127.0.0.1:${app.address().port}`;
}

test('valida os seis números, normaliza e permite desativar destinatários', () => {
  const validacao = validarDestinatarios({ destinatarios: numeros() });
  assert.deepEqual(validacao.erros, []);
  assert.equal(validacao.dados[0].numero, '5511999990000');
  assert.deepEqual(validarDestinatarios({ destinatarios: numeros().map((p) => ({ ...p, numero: '' })) }).erros, []);
  for (const destinatarios of [null, [], numeros().slice(1), numeros().map((p) => ({ ...p, id: 'marcela' })),
    numeros().map((p) => ({ ...p, numero: '5511999990000' })), numeros().map((p) => ({ ...p, numero: 'abc5511999990000' })),
    numeros().map((p) => ({ ...p, numero: '01234567' }))]) {
    assert.ok(validarDestinatarios({ destinatarios }).erros.length);
  }
});

test('ADM nega consulta e alteração sem chave; não consulta banco antes da autenticação', async (t) => {
  let consultas = 0;
  const pool = { query: async () => { consultas++; return [[]]; } };
  const base = await servidor(t, pool, criarMensageria(pool, env));
  for (const method of ['GET', 'PUT']) {
    for (const Authorization of ['', 'Bearer errada']) {
      const r = await fetch(`${base}/api/admin/whatsapp`, { method, headers: { Authorization } });
      assert.equal(r.status, 401);
      assert.equal(r.headers.get('cache-control'), 'no-store');
    }
  }
  assert.equal(consultas, 0);
  const r = await fetch(`${base}/api/admin/whatsapp`, { headers: { Authorization: `Bearer ${env.ADMIN_WHATSAPP_KEY}` } });
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.destinatarios.length, 6);
  assert.equal(corpo.ativo, true);
  assert.equal(JSON.stringify(corpo).includes(env.WHATSAPP_TOKEN), false);
});

test('ADM sem chave configurada falha fechado', async (t) => {
  const pool = { query: async () => { throw new Error('Não deve consultar'); } };
  const base = await servidor(t, pool, criarMensageria(pool, {}));
  assert.equal((await fetch(`${base}/api/admin/whatsapp`)).status, 503);
});

test('salva os seis destinatários atomicamente e rejeita configuração inválida', async (t) => {
  const passos = [];
  const conexao = { beginTransaction: async () => passos.push('begin'), commit: async () => passos.push('commit'),
    rollback: async () => passos.push('rollback'), release: () => passos.push('release'),
    query: async (sql, valores) => { assert.match(sql, /ON DUPLICATE KEY UPDATE/); passos.push(valores); } };
  const pool = { getConnection: async () => conexao };
  const base = await servidor(t, pool, criarMensageria(pool, env));
  const opcoes = { method: 'PUT', headers: { Authorization: `Bearer ${env.ADMIN_WHATSAPP_KEY}`, 'Content-Type': 'application/json' } };
  assert.equal((await fetch(`${base}/api/admin/whatsapp`, { ...opcoes, body: JSON.stringify({ destinatarios: [] }) })).status, 400);
  assert.deepEqual(passos, []);
  assert.equal((await fetch(`${base}/api/admin/whatsapp`, { ...opcoes, body: JSON.stringify({ destinatarios: numeros() }) })).status, 200);
  assert.deepEqual(passos[1], ['marcela', '5511999990000']);
  assert.equal(passos.length, 9);
  assert.deepEqual(passos.slice(-2), ['commit', 'release']);
});

test('cadastro grava ocorrência e fila na mesma transação, sem enviar pela rede', async (t) => {
  const passos = [];
  const conexao = { beginTransaction: async () => passos.push('begin'), commit: async () => passos.push('commit'),
    rollback: async () => passos.push('rollback'), release: () => passos.push('release'),
    query: async (sql, valores) => {
      if (/INSERT INTO ocorrencias/.test(sql)) { passos.push('ocorrencia'); return [{ insertId: 42 }]; }
      assert.match(sql, /INSERT INTO whatsapp_envios/); assert.deepEqual(valores, [42]);
      passos.push('fila'); return [{ affectedRows: 6 }];
    } };
  const pool = { getConnection: async () => conexao };
  const mensageria = criarMensageria(pool, env, () => { throw new Error('Não deve enviar durante o cadastro'); });
  const base = await servidor(t, pool, mensageria);
  const r = await fetch(`${base}/api/ocorrencias`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ escola_id: 1, data_ocorrencia: '2024-02-29', gravidade: 'AMARELO', registrado_por: 'DIRETOR' }) });
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { id: 42, whatsapp: { status: 'PENDENTE', total: 6 } });
  assert.deepEqual(passos, ['begin', 'ocorrencia', 'fila', 'commit', 'release']);
});

test('falha ao persistir avisos desfaz ocorrência e libera a conexão', async (t) => {
  const passos = [];
  const conexao = { beginTransaction: async () => {}, commit: async () => passos.push('commit'),
    rollback: async () => passos.push('rollback'), release: () => passos.push('release'),
    query: async (sql) => { if (/INSERT INTO ocorrencias/.test(sql)) return [{ insertId: 1 }]; throw new Error('Falha simulada'); } };
  const pool = { getConnection: async () => conexao };
  const base = await servidor(t, pool, criarMensageria(pool, env));
  const r = await fetch(`${base}/api/ocorrencias`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ escola_id: 1, data_ocorrencia: '2024-02-29', gravidade: 'AMARELO', registrado_por: 'DIRETOR' }) });
  assert.equal(r.status, 500);
  assert.deepEqual(passos, ['rollback', 'release']);
});

test('sem ativação não enfileira nem envia; sem destinatários informa ausência', async () => {
  const pool = { query: async () => { throw new Error('Não deve consultar'); } };
  const inativo = criarMensageria(pool, {});
  assert.deepEqual(await inativo.enfileirar(pool, 1), { status: 'NAO_CONFIGURADO', total: 0 });
  await inativo.processar();
  const ativo = criarMensageria(pool, env);
  assert.deepEqual(await ativo.enfileirar({ query: async () => [{ affectedRows: 0 }] }, 1), { status: 'SEM_DESTINATARIOS', total: 0 });
});

test('disparo exige endereço público HTTPS válido para o link da ocorrência', async () => {
  const pool = { query: async () => { throw new Error('Não deve enfileirar ou enviar'); } };
  for (const APP_PUBLIC_URL of [undefined, 'http://localhost:3001', 'https://usuario:senha@site.example.com/',
    'https://site.example.com/#whatsapp', 'https://site.example.com/?chave=segredo']) {
    const mensageria = criarMensageria(pool, { ...env, APP_PUBLIC_URL });
    assert.deepEqual(await mensageria.enfileirar(pool, 42), { status: 'NAO_CONFIGURADO', total: 0 });
    await mensageria.processar();
  }
});

test('processador envia modelo aprovado sem descrição, registra aceite, falha e resultado incerto', async () => {
  for (const resultado of ['aceito', 'falha', 'timeout', 'sem-id']) {
    const atualizacoes = [];
    const pool = { query: async (sql, valores) => {
      if (/SELECT numero, acesso_versao/.test(sql)) return [[{ numero: '5511999990000', acesso_versao: 0 }]];
      if (/SELECT w.id/.test(sql)) return [[{ id: 7, ocorrencia_id: 42, destinatario_id: 'marcela', acesso_versao: 0, numero: '5511999990000',
        escola: 'Escola exemplo', data_ocorrencia: '2024-02-29', gravidade: 'VERMELHO', descricao: 'Dado que não deve sair' }]];
      if (/mensagem_id =/.test(sql)) atualizacoes.push(valores);
      return [{ affectedRows: 1 }];
    } };
    const mensageria = criarMensageria(pool, env, async (url, opcoes) => {
      assert.equal(url, 'https://graph.facebook.com/v99.0/123/messages');
      assert.equal(opcoes.headers.Authorization, 'Bearer token-secreto');
      const corpo = JSON.parse(opcoes.body);
      assert.equal(corpo.template.name, 'ocorrencia_registrada');
      const parametros = corpo.template.components[0].parameters.map((p) => p.text);
      assert.deepEqual(parametros.slice(0, 4), ['42', 'Escola exemplo', '2024-02-29', 'VERMELHO']);
      const { lerToken } = require('../src/acesso');
      const token = new URLSearchParams(new URL(parametros[4]).hash.split('?')[1]).get('acesso');
      assert.equal(lerToken(token, env).o, 42);
      assert.equal(lerToken(token, env).d, 'marcela');
      assert.equal(opcoes.body.includes('Dado que não deve sair'), false);
      if (resultado === 'timeout') throw new Error('timeout');
      return { ok: resultado !== 'falha', json: async () => resultado === 'sem-id' ? {} : { messages: [{ id: 'wamid.exemplo' }] } };
    });
    await mensageria.processar();
    assert.deepEqual(atualizacoes, [[resultado === 'aceito' ? 'ACEITO' : resultado === 'falha' ? 'FALHOU' : 'INCERTO',
      resultado === 'aceito' ? 'wamid.exemplo' : null, 7]]);
  }
});

test('processadores concorrentes não enviam aviso já assumido', async () => {
  let envios = 0;
  let assumido = false;
  const pool = { query: async (sql) => {
    if (/SELECT w.id/.test(sql)) return [[{ id: 7, ocorrencia_id: 42, destinatario_id: 'marcela', numero: '5511999990000', acesso_versao: 0 }]];
    if (/SELECT numero, acesso_versao/.test(sql)) return [[{ numero: '5511999990000', acesso_versao: 0 }]];
    if (/SET status = 'PROCESSANDO'/.test(sql)) { const anterior = assumido; assumido = true; return [{ affectedRows: anterior ? 0 : 1 }]; }
    return [{ affectedRows: 1 }];
  } };
  const enviar = async () => { envios++; return { ok: true, json: async () => ({ messages: [{ id: 'wamid.1' }] }) }; };
  await Promise.all([criarMensageria(pool, env, enviar).processar(), criarMensageria(pool, env, enviar).processar()]);
  assert.equal(envios, 1);
});
