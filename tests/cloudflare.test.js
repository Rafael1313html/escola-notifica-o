const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function funcao() {
  const codigo = await fs.readFile(path.join(__dirname, '../functions/api/[[path]].js'), 'utf8');
  return (await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`)).onRequest;
}

test('proxy Cloudflare rejeita origem ausente ou insegura', async () => {
  const onRequest = await funcao();
  for (const API_ORIGIN of [undefined, 'http://backend.example.com', 'https://usuario:senha@backend.example.com', 'https://backend.example.com/pasta']) {
    const r = await onRequest({ request: new Request('https://site.example.com/api/escolas'), env: { API_ORIGIN } });
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});

test('proxy encaminha configuração ADM e autorização sem cookies; preserva falhas do backend', async (t) => {
  const onRequest = await funcao();
  t.mock.method(globalThis, 'fetch', async (url, opcoes) => {
    assert.equal(String(url), 'https://backend.example.com/api/admin/whatsapp');
    assert.equal(opcoes.method, 'PUT');
    assert.equal(opcoes.redirect, 'manual');
    assert.equal(opcoes.headers.get('Authorization'), 'Bearer segredo');
    assert.equal(opcoes.headers.get('Cookie'), null);
    const corpo = await new Response(opcoes.body).text();
    assert.equal(corpo, '{"destinatarios":[]}');
    return new Response('{"erros":["Informe os seis destinatários."]}', { status: 400,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'nao=vazar' } });
  });
  const resposta = await onRequest({ env: { API_ORIGIN: 'https://backend.example.com' },
    request: new Request('https://site.example.com/api/admin/whatsapp', { method: 'PUT',
      headers: { Authorization: 'Bearer segredo', Cookie: 'privado', 'Content-Type': 'application/json' }, body: '{"destinatarios":[]}' }) });
  assert.equal(resposta.status, 400);
  assert.equal(resposta.headers.get('Set-Cookie'), null);
  assert.match(await resposta.text(), /seis destinatários/);
});

test('proxy não segue redirecionamento para outro serviço', async (t) => {
  const onRequest = await funcao();
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { Location: 'https://outro.example.com' } }));
  const resposta = await onRequest({ env: { API_ORIGIN: 'https://backend.example.com' }, request: new Request('https://site.example.com/api/escolas') });
  assert.equal(resposta.status, 502);
});
