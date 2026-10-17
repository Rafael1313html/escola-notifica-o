const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

// SQLite executa o SQL real das migrações. O adaptador reproduz o batch transacional do D1.
function ambiente() {
  const sqlite = new DatabaseSync(':memory:');
  for (const nome of ['0001_inicial.sql', '0002_escolas.sql']) sqlite.exec(fs.readFileSync(`cloudflare/migrations/${nome}`, 'utf8'));
  const DB = {
    prepare(sql) {
      let valores = [];
      const comando = {
        bind(...args) { valores = args.map((v) => v instanceof ArrayBuffer ? new Uint8Array(v) : v); return comando; },
        async all() {
          const stmt = sqlite.prepare(sql);
          const results = stmt.columns().length ? stmt.all(...valores).map((r) => ({ ...r })) : (stmt.run(...valores), []);
          return { results, meta: { changes: Number(sqlite.prepare('SELECT changes() AS n').get().n) } };
        },
        async first() { return (await comando.all()).results[0] || null; },
        run() { return comando.all(); },
      };
      return comando;
    },
    async batch(comandos) {
      sqlite.exec('BEGIN');
      try { const saida = []; for (const comando of comandos) saida.push(await comando.all()); sqlite.exec('COMMIT'); return saida; }
      catch (erro) { sqlite.exec('ROLLBACK'); throw erro; }
    },
  };
  return { DB, sqlite, ADMIN_WHATSAPP_KEY: 'senha-de-teste-adm-com-32-caracteres', APP_PUBLIC_URL: 'https://escola.example.com/' };
}
const dados = { escola_id: 1, data_ocorrencia: '2026-01-10', tipo: 'Teste', descricao: 'Registro de teste', gravidade: 'VERMELHO', registrado_por: 'DIRETOR' };
async function pedir(env, caminho, method = 'GET', body, senha) {
  const { atenderAPI } = await import('../cloudflare/api.mjs');
  return atenderAPI(new Request(`https://escola.example.com/api/${caminho}`, { method,
    headers: { 'Content-Type': 'application/json', ...(senha ? { Authorization: `Bearer ${senha}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
}

test('D1: acesso comum compartilha registros, detalhes, filtros e indicadores', async () => {
  const env = ambiente();
  assert.equal((await (await pedir(env, 'escolas')).json()).length, 103);
  const resposta = await pedir(env, 'ocorrencias', 'POST', dados);
  assert.equal(resposta.status, 201);
  const registro = await resposta.json();
  assert.equal(registro.whatsapp.status, 'NAO_CONFIGURADO');
  const consulta = await (await pedir(env, `ocorrencias/${registro.id}`)).json();
  assert.equal(consulta.escola, 'ABEL DOS REIS');
  assert.equal(consulta.descricao, dados.descricao);
  assert.equal((await (await pedir(env, 'ocorrencias?gravidade=AMARELO')).json()).length, 0);
  assert.equal((await (await pedir(env, 'ocorrencias?escola_id=1')).json()).length, 1);
  const indicadores = await (await pedir(env, 'indicadores')).json();
  assert.equal(indicadores.total_ocorrencias, 1);
  assert.equal(indicadores.total_escolas, 103);
  assert.equal((await (await pedir(env, 'relatorios/vermelhas-por-escola')).json())[0].total_vermelhas, 1);
});

test('D1: somente ADM com senha consulta e altera os seis números', async () => {
  const env = ambiente();
  for (const senha of [undefined, 'incorreta']) {
    assert.equal((await pedir(env, 'admin/whatsapp', 'GET', undefined, senha)).status, 401);
    assert.equal((await pedir(env, 'admin/whatsapp', 'PUT', {}, senha)).status, 401);
  }
  const config = await (await pedir(env, 'admin/whatsapp', 'GET', undefined, env.ADMIN_WHATSAPP_KEY)).json();
  assert.equal(config.destinatarios.length, 6);
  config.destinatarios.forEach((p, i) => p.numero = `+55 (11) 99999-000${i}`);
  assert.equal((await pedir(env, 'admin/whatsapp', 'PUT', config, env.ADMIN_WHATSAPP_KEY)).status, 200);
  const salvo = await (await pedir(env, 'admin/whatsapp', 'GET', undefined, env.ADMIN_WHATSAPP_KEY)).json();
  assert.equal(salvo.destinatarios[0].numero, '5511999990000');
  config.destinatarios[1].numero = config.destinatarios[0].numero;
  assert.equal((await pedir(env, 'admin/whatsapp', 'PUT', config, env.ADMIN_WHATSAPP_KEY)).status, 400);
  assert.equal((await pedir({ ...env, ADMIN_WHATSAPP_KEY: '' }, 'admin/whatsapp')).status, 503);
  const publico = await (await pedir(env, 'ocorrencias')).text();
  assert.ok(!publico.includes('5511999990000'));
});

test('D1: PDF de 5 MB é salvo em partes e baixado sem alterações; falha desfaz o registro', async () => {
  const env = ambiente();
  const pdf = Buffer.alloc(5 * 1024 * 1024, 32); pdf.write('%PDF-1.7\n');
  const anexo = { tipo: 'PDF', nome: 'registro.pdf', conteudo: pdf.toString('base64') };
  const resposta = await pedir(env, 'ocorrencias', 'POST', { ...dados, anexo });
  assert.equal(resposta.status, 201);
  const { id } = await resposta.json();
  const download = await pedir(env, `ocorrencias/${id}/anexo`);
  assert.equal(download.headers.get('Content-Type'), 'application/pdf');
  const hash = (b) => createHash('sha256').update(b).digest('hex');
  assert.equal(hash(Buffer.from(await download.arrayBuffer())), hash(pdf));
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM anexo_partes').get().n, 10);
  assert.equal((await pedir(env, 'ocorrencias', 'POST', { ...dados, escola_id: 9999, anexo })).status, 400);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM ocorrencias').get().n, 1);
  assert.equal((await pedir(env, 'ocorrencias', 'POST', { ...dados, anexo: { ...anexo, conteudo: 'bmFvLXBlZg==' } })).status, 400);
});

test('D1: fila grava junto à ocorrência, cron envia link e não duplica ao concorrer', async () => {
  const env = { ...ambiente(), WHATSAPP_ENABLED: 'true', WHATSAPP_TOKEN: 'teste', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_API_VERSION: 'v25.0', WHATSAPP_TEMPLATE: 'ocorrencia' };
  env.sqlite.exec("UPDATE whatsapp_destinatarios SET numero = '5511999990000' WHERE id = 'marcela'");
  const { processarAvisos } = await import('../cloudflare/whatsapp.mjs');
  const resposta = await (await pedir(env, 'ocorrencias', 'POST', dados)).json();
  assert.deepEqual(resposta.whatsapp, { status: 'PENDENTE', total: 1 });
  let chamadas = 0;
  const enviar = async (_url, opcoes) => {
    chamadas++;
    const corpo = JSON.parse(opcoes.body);
    assert.equal(corpo.to, '5511999990000');
    assert.equal(corpo.template.components[0].parameters[4].text, `https://escola.example.com/#ocorrencias/${resposta.id}`);
    return Response.json({ messages: [{ id: 'wamid.teste' }] });
  };
  await Promise.all([processarAvisos(env, enviar), processarAvisos(env, enviar)]);
  assert.equal(chamadas, 1);
  assert.equal(env.sqlite.prepare('SELECT status FROM whatsapp_envios').get().status, 'ACEITO');
  await processarAvisos(env, enviar);
  assert.equal(chamadas, 1);
});

test('D1: falha, timeout e processo interrompido não repetem envio automaticamente', async () => {
  const env = { ...ambiente(), WHATSAPP_ENABLED: 'true', WHATSAPP_TOKEN: 'teste', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_API_VERSION: 'v25.0', WHATSAPP_TEMPLATE: 'ocorrencia' };
  env.sqlite.exec("UPDATE whatsapp_destinatarios SET numero = '5511999990000' WHERE id = 'marcela'");
  const { processarAvisos } = await import('../cloudflare/whatsapp.mjs');
  await pedir(env, 'ocorrencias', 'POST', dados);
  await processarAvisos(env, async () => new Response('{}', { status: 400 }));
  await pedir(env, 'ocorrencias', 'POST', dados);
  await processarAvisos(env, async () => { throw new Error('Timeout'); });
  await pedir(env, 'ocorrencias', 'POST', dados);
  env.sqlite.exec("UPDATE whatsapp_envios SET status = 'PROCESSANDO', atualizado_em = datetime('now', '-20 minutes') WHERE status = 'PENDENTE'");
  await processarAvisos(env, () => { assert.fail('Não deve reenviar'); });
  assert.deepEqual(env.sqlite.prepare('SELECT status FROM whatsapp_envios ORDER BY id').all().map((r) => r.status), ['FALHOU', 'INCERTO', 'INCERTO']);
});
