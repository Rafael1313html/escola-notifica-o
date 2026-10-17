const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

// SQLite executa o SQL real das migrações. O adaptador reproduz o batch transacional do D1.
function ambiente() {
  const sqlite = new DatabaseSync(':memory:');
  for (const nome of fs.readdirSync('cloudflare/migrations').filter((f) => f.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(`cloudflare/migrations/${nome}`, 'utf8'));
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
    headers: { 'Content-Type': 'application/json', ...(senha ? { Authorization: senha.startsWith('Link ') ? senha : `Bearer ${senha}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
}

test('D1: acesso comum registra; somente ADM consulta histórico, filtros e indicadores', async () => {
  const env = ambiente();
  assert.equal((await (await pedir(env, 'escolas')).json()).length, 103);
  const resposta = await pedir(env, 'ocorrencias', 'POST', dados);
  assert.equal(resposta.status, 201);
  const registro = await resposta.json();
  assert.equal(registro.whatsapp.status, 'NAO_CONFIGURADO');
  assert.equal((await pedir(env, `ocorrencias/${registro.id}`)).status, 401);
  const consulta = await (await pedir(env, `ocorrencias/${registro.id}`, 'GET', undefined, env.ADMIN_WHATSAPP_KEY)).json();
  assert.equal(consulta.escola, 'ABEL DOS REIS');
  assert.equal(consulta.descricao, dados.descricao);
  assert.equal((await (await pedir(env, 'ocorrencias?gravidade=AMARELO', 'GET', undefined, env.ADMIN_WHATSAPP_KEY)).json()).length, 0);
  assert.equal((await (await pedir(env, 'ocorrencias?escola_id=1', 'GET', undefined, env.ADMIN_WHATSAPP_KEY)).json()).length, 1);
  const indicadores = await (await pedir(env, 'indicadores', 'GET', undefined, env.ADMIN_WHATSAPP_KEY)).json();
  assert.equal(indicadores.total_ocorrencias, 1);
  assert.equal(indicadores.total_escolas, 103);
  assert.equal((await (await pedir(env, 'relatorios/vermelhas-por-escola', 'GET', undefined, env.ADMIN_WHATSAPP_KEY)).json())[0].total_vermelhas, 1);
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
  const download = await pedir(env, `ocorrencias/${id}/anexo`, 'GET', undefined, env.ADMIN_WHATSAPP_KEY);
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
    const { lerToken } = require('../src/acesso');
    const link = new URL(corpo.template.components[0].parameters[4].text);
    assert.equal(lerToken(new URLSearchParams(link.hash.split('?')[1]).get('acesso'), env).o, resposta.id);
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

test('D1: escola não acessa registros, documentos, relatórios ou indicadores por nenhuma URL', async () => {
  const env = ambiente();
  await pedir(env, 'ocorrencias', 'POST', dados);
  for (const rota of ['ocorrencias', 'ocorrencias?escola_id=1', 'ocorrencias/1', 'ocorrencias/1/anexo', 'indicadores', 'relatorios/vermelhas-por-escola', 'acesso']) {
    for (const metodo of ['GET', 'HEAD']) {
      const r = await pedir(env, rota, metodo);
      assert.equal(r.status, 401, `${metodo} ${rota}`);
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.ok(!(await r.text()).includes(dados.descricao));
    }
  }
});

test('D1: responsavel cadastrado consulta todos os registros e relatorios sem acesso ADM', async () => {
  const env = ambiente();
  const { criarToken } = require('../src/acesso');
  const primeiro = await (await pedir(env, 'ocorrencias', 'POST', dados)).json();
  const segundo = await (await pedir(env, 'ocorrencias', 'POST', { ...dados, escola_id: 2, descricao: 'Registro secreto de outra escola' })).json();
  env.sqlite.exec("UPDATE whatsapp_destinatarios SET numero = '5511999990000' WHERE id = 'marcela'");
  const token = 'Link ' + criarToken(env, primeiro.id, 'marcela', 0);
  assert.equal((await pedir(env, `ocorrencias/${primeiro.id}`, 'GET', undefined, token)).status, 200);
  assert.equal((await pedir(env, `ocorrencias/${segundo.id}`, 'GET', undefined, token)).status, 200);
  assert.equal((await pedir(env, `ocorrencias/${segundo.id}/anexo`, 'GET', undefined, token)).status, 404);
  const lista = await (await pedir(env, 'ocorrencias', 'GET', undefined, token)).json();
  assert.deepEqual(lista.map((r) => r.id), [segundo.id, primeiro.id]);
  assert.equal((await (await pedir(env, 'ocorrencias?escola_id=2', 'GET', undefined, token)).json()).length, 1);
  const resumo = await (await pedir(env, 'indicadores', 'GET', undefined, token)).json();
  assert.equal(resumo.total_ocorrencias, 2);
  const relatorio = await (await pedir(env, 'relatorios/vermelhas-por-escola', 'GET', undefined, token)).json();
  assert.equal(relatorio.length, 103);
  assert.equal(relatorio.reduce((total, r) => total + r.total_vermelhas, 0), 2);
  assert.equal((await pedir(env, 'admin/whatsapp', 'GET', undefined, token)).status, 401);
  assert.equal((await pedir(env, `admin/ocorrencias/${primeiro.id}/links`, 'POST', {}, token)).status, 401);
  const adm = await (await pedir(env, 'ocorrencias', 'GET', undefined, env.ADMIN_WHATSAPP_KEY)).json();
  assert.equal(adm.length, 2);
});

test('D1: links exigem número cadastrado, expiram e são revogados ao trocar ou remover o número', async () => {
  const env = ambiente();
  const { criarToken } = require('../src/acesso');
  await pedir(env, 'ocorrencias', 'POST', dados);
  const token = 'Link ' + criarToken(env, 1, 'marcela', 0);
  assert.equal((await pedir(env, 'ocorrencias/1', 'GET', undefined, token)).status, 401);
  const vazio = await (await pedir(env, 'admin/ocorrencias/1/links', 'POST', {}, env.ADMIN_WHATSAPP_KEY)).json();
  assert.deepEqual(vazio.links, []);
  env.sqlite.exec("UPDATE whatsapp_destinatarios SET numero = '5511999990000' WHERE id = 'marcela'");
  assert.equal((await pedir(env, 'ocorrencias/1', 'GET', undefined, token)).status, 200);
  const gerado = await (await pedir(env, 'admin/ocorrencias/1/links', 'POST', {}, env.ADMIN_WHATSAPP_KEY)).json();
  assert.equal(gerado.links.length, 1);
  const expirado = 'Link ' + criarToken(env, 1, 'marcela', 0, Date.now() - 8 * 86400000);
  assert.equal((await pedir(env, 'ocorrencias/1', 'GET', undefined, expirado)).status, 401);
  const config = await (await pedir(env, 'admin/whatsapp', 'GET', undefined, env.ADMIN_WHATSAPP_KEY)).json();
  config.destinatarios[0].numero = '5511999999999';
  assert.equal((await pedir(env, 'admin/whatsapp', 'PUT', config, env.ADMIN_WHATSAPP_KEY)).status, 200);
  assert.equal((await pedir(env, 'ocorrencias/1', 'GET', undefined, token)).status, 401);
  const novo = 'Link ' + criarToken(env, 1, 'marcela', 1);
  assert.equal((await pedir(env, 'ocorrencias/1', 'GET', undefined, novo)).status, 200);
  config.destinatarios[0].numero = '';
  await pedir(env, 'admin/whatsapp', 'PUT', config, env.ADMIN_WHATSAPP_KEY);
  assert.equal((await pedir(env, 'ocorrencias/1', 'GET', undefined, novo)).status, 401);
});

test('D1: somente ADM altera e exclui; responsável e escola não mudam registros nem anexos', async () => {
  const env = ambiente();
  const { criarToken } = require('../src/acesso');
  const criado = await (await pedir(env, 'ocorrencias', 'POST', { ...dados, anexo: { tipo: 'PDF', nome: 'registro.pdf', conteudo: Buffer.from('%PDF-1.7\n%%EOF').toString('base64') } })).json();
  env.sqlite.exec("UPDATE whatsapp_destinatarios SET numero = '5511999990000' WHERE id = 'marcela'");
  const token = 'Link ' + criarToken(env, criado.id, 'marcela', 0);
  for (const senha of [undefined, token, 'senha-incorreta']) {
    assert.equal((await pedir(env, `admin/ocorrencias/${criado.id}`, 'PATCH', { ...dados, descricao: 'Alteração indevida' }, senha)).status, 401);
    assert.equal((await pedir(env, `admin/ocorrencias/${criado.id}`, 'DELETE', undefined, senha)).status, 401);
  }
  const alterado = { ...dados, descricao: 'Revisado pelo ADM', gravidade: 'AMARELO' };
  assert.equal((await pedir(env, `admin/ocorrencias/${criado.id}`, 'PATCH', alterado, env.ADMIN_WHATSAPP_KEY)).status, 200);
  const consulta = await (await pedir(env, `ocorrencias/${criado.id}`, 'GET', undefined, token)).json();
  assert.equal(consulta.descricao, alterado.descricao);
  assert.equal(consulta.anexo.tipo, 'PDF');
  assert.equal((await pedir(env, `admin/ocorrencias/${criado.id}`, 'PATCH', { ...dados, escola_id: 99999 }, env.ADMIN_WHATSAPP_KEY)).status, 400);
  assert.equal((await pedir(env, `admin/ocorrencias/${criado.id}`, 'DELETE', undefined, env.ADMIN_WHATSAPP_KEY)).status, 200);
  assert.equal((await pedir(env, `ocorrencias/${criado.id}`, 'GET', undefined, token)).status, 404);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM anexo_partes').get().n, 0);
  assert.equal((await pedir(env, `admin/ocorrencias/${criado.id}`, 'DELETE', undefined, env.ADMIN_WHATSAPP_KEY)).status, 404);
});
