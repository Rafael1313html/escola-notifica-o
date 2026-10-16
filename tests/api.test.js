const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { criarApp } = require('../src/app');
const { hojeISO, dataValida, validarOcorrencia } = require('../src/validacao');

const dadosValidos = {
  escola_id: 1, data_ocorrencia: '2024-02-29', gravidade: 'AMARELO',
  registrado_por: 'DIRETOR', tipo: '  Ameaça  ', descricao: 'Descrição de teste.',
};

async function servidorTeste(t, query = async () => { throw new Error('Consulta inesperada'); }) {
  const servidor = criarApp({ query }).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  t.after(() => new Promise((resolve) => {
    servidor.closeAllConnections();
    servidor.close(resolve);
  }));
  return `http://127.0.0.1:${servidor.address().port}`;
}

test('valida calendário real, ano bissexto e proíbe datas futuras', () => {
  assert.equal(dataValida('2024-02-29'), true);
  for (const data of ['2025-02-29', '2024-04-31', '9999-12-31', '0999-01-01', {}, '2024-1-01']) {
    assert.equal(dataValida(data), false);
  }
  assert.equal(dataValida(hojeISO()), true);
});

test('recusa IDs inválidos, tipos de campos inesperados e textos extensos', () => {
  for (const id of [null, '', 0, -1, 1.5, true, {}, [], '1 OR 1=1', '1e2']) {
    assert.ok(validarOcorrencia({ ...dadosValidos, escola_id: id }).erros.length);
  }
  for (const campo of ['tipo', 'descricao', 'registrado_por_outro']) {
    assert.ok(validarOcorrencia({ ...dadosValidos, [campo]: {} }).erros.length);
  }
  assert.ok(validarOcorrencia({ ...dadosValidos, descricao: 'a'.repeat(2001) }).erros.length);
  assert.ok(validarOcorrencia({ ...dadosValidos, registrado_por: 'OUTROS' }).erros.length);
  assert.ok(validarOcorrencia([]).erros.length);
});

test('cria ocorrência com parâmetros SQL e normaliza campos opcionais', async (t) => {
  let insercoes = 0;
  const base = await servidorTeste(t, async (sql, valores) => {
    insercoes++;
    assert.match(sql, /VALUES \(\?, \?, \?, \?, \?, \?, \?\)/);
    assert.deepEqual(valores, [1, '2024-02-29', 'Ameaça', 'Descrição de teste.', 'AMARELO', 'DIRETOR', null]);
    return [{ insertId: 42 }];
  });
  const resposta = await fetch(`${base}/api/ocorrencias`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dadosValidos) });
  assert.equal(resposta.status, 201);
  assert.deepEqual(await resposta.json(), { id: 42 });
  assert.equal(insercoes, 1);
});

test('campos inválidos retornam 400 antes de consultar o banco', async (t) => {
  const base = await servidorTeste(t);
  const resposta = await fetch(`${base}/api/ocorrencias`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...dadosValidos, tipo: {} }) });
  assert.equal(resposta.status, 400);
  assert.match((await resposta.json()).erros.join(' '), /deve ser um texto/);
});

test('trata JSON malformado e limite do corpo da requisição', async (t) => {
  const base = await servidorTeste(t);
  const opcoes = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  const invalida = await fetch(`${base}/api/ocorrencias`, { ...opcoes, body: '{invalido' });
  assert.equal(invalida.status, 400);
  const grande = await fetch(`${base}/api/ocorrencias`, { ...opcoes, body: JSON.stringify({ descricao: 'a'.repeat(40000) }) });
  assert.equal(grande.status, 413);
});

test('filtros inválidos retornam 400 e filtros válidos usam parâmetros', async (t) => {
  const base = await servidorTeste(t, async (sql, valores) => {
    assert.match(sql, /o.gravidade = \?/);
    assert.match(sql, /o.escola_id = \?/);
    assert.deepEqual(valores, ['VERMELHO', 2]);
    return [[]];
  });
  for (const filtro of ['gravidade=AZUL', 'escola_id=0', 'escola_id[]=1', 'gravidade[]=AMARELO']) {
    assert.equal((await fetch(`${base}/api/ocorrencias?${filtro}`)).status, 400);
  }
  assert.equal((await fetch(`${base}/api/ocorrencias?gravidade=VERMELHO&escola_id=2`)).status, 200);
});

test('indicadores usam agregados completos e convertem números do MySQL', async (t) => {
  const base = await servidorTeste(t, async (sql) => {
    assert.doesNotMatch(sql, /LIMIT 200/);
    return /DATE_FORMAT/.test(sql)
      ? [[{ mes: '2026-10', total: '3', vermelhas: '1', amarelas: '2' }]]
      : [[{ total_ocorrencias: '350', total_vermelhas: '100', total_amarelas: '250', escolas_com_registros: '40', total_escolas: '103' }]];
  });
  const resposta = await fetch(`${base}/api/indicadores`);
  assert.equal(resposta.status, 200);
  const corpo = await resposta.json();
  assert.equal(corpo.total_ocorrencias, 350);
  assert.deepEqual(corpo.meses[0], { mes: '2026-10', total: 3, vermelhas: 1, amarelas: 2 });
});

test('escola inexistente retorna mensagem pública sem expor detalhes do banco', async (t) => {
  const base = await servidorTeste(t, async () => { throw Object.assign(new Error('detalhes internos'), { code: 'ER_NO_REFERENCED_ROW_2' }); });
  const resposta = await fetch(`${base}/api/ocorrencias`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dadosValidos) });
  assert.equal(resposta.status, 400);
  assert.deepEqual(await resposta.json(), { erros: ['Escolha uma escola cadastrada.'] });
});

test('rotas da API desconhecidas retornam JSON e respostas não permitem cache', async (t) => {
  const base = await servidorTeste(t);
  const resposta = await fetch(`${base}/api/inexistente`);
  assert.equal(resposta.status, 404);
  assert.match(resposta.headers.get('content-type'), /application\/json/);
  assert.equal(resposta.headers.get('cache-control'), 'no-store');
  assert.equal(resposta.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(resposta.headers.get('x-powered-by'), null);
});
