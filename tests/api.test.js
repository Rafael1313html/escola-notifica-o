const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { criarApp } = require('../src/app');
const { hojeISO, dataValida, validarOcorrencia } = require('../src/validacao');
const { LIMITE_PDF, validarAnexo } = require('../src/anexos');

const dadosValidos = {
  escola_id: 1, data_ocorrencia: '2024-02-29', gravidade: 'AMARELO',
  registrado_por: 'DIRETOR', tipo: '  Ameaça  ', descricao: 'Descrição de teste.',
};

async function servidorTeste(t, query = async () => { throw new Error('Consulta inesperada'); }) {
  const servidor = criarApp(typeof query === 'function' ? { query } : query).listen(0, '127.0.0.1');
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
  assert.equal(validarOcorrencia({ ...dadosValidos, descricao: 'a'.repeat(5000) }).erros.length, 0);
  assert.ok(validarOcorrencia({ ...dadosValidos, descricao: 'a'.repeat(5001) }).erros.length);
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
  const grande = await fetch(`${base}/api/ocorrencias`, { ...opcoes, body: JSON.stringify({ descricao: 'a'.repeat(8 * 1024 * 1024) }) });
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

test('valida PDF, base64, limite de tamanho e links seguros antes da persistência', () => {
  const pdf = { tipo: 'PDF', nome: 'relatório.pdf', conteudo: Buffer.from('%PDF-1.7\n%%EOF').toString('base64') };
  assert.equal(validarAnexo(pdf).anexo.arquivo.toString(), '%PDF-1.7\n%%EOF');
  assert.equal(validarAnexo({ tipo: 'LINK', url: ' https://example.org/relatorio.pdf ' }).anexo.url, 'https://example.org/relatorio.pdf');
  for (const url of ['javascript:alert(1)', 'data:text/html,teste', 'file:///teste', 'https://user:pass@example.org', 'sem-endereco', 'https://example.org/' + 'a'.repeat(2048)]) {
    assert.ok(validarAnexo({ tipo: 'LINK', url }).erros.length);
  }
  for (const anexo of [[], 'pdf', { ...pdf, nome: '../teste.pdf' }, { ...pdf, nome: 'teste.exe' },
    { ...pdf, conteudo: 'invalido!' }, { ...pdf, conteudo: Buffer.from('não é PDF').toString('base64') },
    { ...pdf, conteudo: Buffer.alloc(LIMITE_PDF + 1).toString('base64') }]) {
    assert.ok(validarAnexo(anexo).erros.length);
  }
  const maximo = Buffer.alloc(LIMITE_PDF); maximo.write('%PDF-1.7');
  assert.equal(validarAnexo({ ...pdf, conteudo: maximo.toString('base64') }).anexo.tamanho, LIMITE_PDF);
});

test('salva PDF ou link na mesma transação da ocorrência e desfaz falhas', async (t) => {
  for (const tipo of ['PDF', 'LINK', 'FALHA']) {
    const passos = [];
    const conexao = {
      beginTransaction: async () => passos.push('iniciar'),
      commit: async () => passos.push('confirmar'),
      rollback: async () => passos.push('desfazer'),
      release: () => passos.push('liberar'),
      query: async (sql, valores) => {
        if (/INSERT INTO ocorrencias\s/.test(sql)) { passos.push('ocorrencia'); return [{ insertId: 77 }]; }
        assert.match(sql, /INSERT INTO ocorrencia_anexos/);
        assert.equal(valores[0], 77);
        passos.push('anexo');
        if (tipo === 'FALHA') throw Object.assign(new Error('Falha simulada'), { code: 'TESTE' });
        if (tipo === 'PDF') assert.equal(valores[5].toString(), '%PDF-1.7\n%%EOF');
        else assert.equal(valores[3], 'https://example.org/documento');
        return [{}];
      },
    };
    const base = await servidorTeste(t, { getConnection: async () => conexao });
    const anexo = tipo === 'PDF' ? { tipo, nome: 'apoio.pdf', conteudo: Buffer.from('%PDF-1.7\n%%EOF').toString('base64') }
      : { tipo: 'LINK', url: 'https://example.org/documento' };
    const resposta = await fetch(`${base}/api/ocorrencias`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...dadosValidos, anexo }) });
    assert.equal(resposta.status, tipo === 'FALHA' ? 500 : 201);
    assert.deepEqual(passos, ['iniciar', 'ocorrencia', 'anexo', tipo === 'FALHA' ? 'desfazer' : 'confirmar', 'liberar']);
  }
});

test('anexo inválido não cria ocorrência e download respeita o vínculo do registro', async (t) => {
  const pdf = Buffer.from('%PDF-1.7\n%%EOF');
  let consultas = 0;
  const base = await servidorTeste(t, async (sql, valores) => {
    consultas++;
    assert.match(sql, /ocorrencia_id = \? AND tipo = \?/);
    return [valores[0] === 42 ? [{ nome: 'relatório.pdf', arquivo: pdf }] : []];
  });
  const invalida = await fetch(`${base}/api/ocorrencias`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...dadosValidos, anexo: { tipo: 'LINK', url: 'javascript:alert(1)' } }) });
  assert.equal(invalida.status, 400); assert.equal(consultas, 0);
  assert.equal((await fetch(`${base}/api/ocorrencias/0/anexo`)).status, 400);
  assert.equal((await fetch(`${base}/api/ocorrencias/99/anexo`)).status, 404);
  const resposta = await fetch(`${base}/api/ocorrencias/42/anexo`);
  assert.equal(resposta.headers.get('content-type'), 'application/pdf');
  assert.match(resposta.headers.get('content-disposition'), /attachment/);
  assert.equal(resposta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await resposta.arrayBuffer()), pdf);
});

test('listagem retorna metadados do anexo sem carregar o conteúdo do PDF', async (t) => {
  const base = await servidorTeste(t, async (sql) => {
    assert.doesNotMatch(sql, /a\.arquivo/);
    return [[{ id: 42, anexo_tipo: 'PDF', anexo_nome: 'apoio.pdf', anexo_url: null, anexo_tamanho: 25 },
      { id: 43, anexo_tipo: null }]];
  });
  const itens = await (await fetch(`${base}/api/ocorrencias`)).json();
  assert.deepEqual(itens[0].anexo, { tipo: 'PDF', nome: 'apoio.pdf', url: null, tamanho: 25 });
  assert.equal(itens[1].anexo, null);
});

test('link direto consulta ocorrência pelo ID sem limitar aos 200 recentes ou carregar PDF', async (t) => {
  const base = await servidorTeste(t, async (sql, valores) => {
    assert.match(sql, /WHERE o\.id = \?/);
    assert.doesNotMatch(sql, /LIMIT 200|a\.arquivo/);
    assert.deepEqual(valores, [42]);
    return [[{ id: 42, escola: 'Escola de teste', descricao: 'Registro completo',
      anexo_tipo: 'LINK', anexo_url: 'https://example.org/documento' }]];
  });
  const r = await fetch(`${base}/api/ocorrencias/42`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const registro = await r.json();
  assert.equal(registro.id, 42);
  assert.equal(registro.descricao, 'Registro completo');
  assert.equal(registro.anexo.url, 'https://example.org/documento');
});

test('link direto rejeita ID inválido e informa ocorrência inexistente', async (t) => {
  let consultas = 0;
  const base = await servidorTeste(t, async () => { consultas++; return [[]]; });
  for (const id of ['0', '-1', '1e2', 'abc', '9007199254740992']) {
    assert.equal((await fetch(`${base}/api/ocorrencias/${id}`)).status, 400);
  }
  assert.equal(consultas, 0);
  const r = await fetch(`${base}/api/ocorrencias/99`);
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { erros: ['Ocorrência não encontrada.'] });
});
