const { test } = require('node:test');
const assert = require('node:assert/strict');
const { admValido, criarToken, lerToken, criarLink } = require('../src/acesso');
const env = { ADMIN_WHATSAPP_KEY: 'segredo-de-teste-com-pelo-menos-32-caracteres', APP_PUBLIC_URL: 'https://escola.example.com/' };

test('links assinados expiram em sete dias e não expõem senha ou telefone', () => {
  const token = criarToken(env, 42, 'marcela', 3);
  const corpo = lerToken(token, env);
  assert.equal(corpo.o, 42); assert.equal(corpo.d, 'marcela'); assert.equal(corpo.r, 3);
  assert.ok(!token.includes(env.ADMIN_WHATSAPP_KEY));
  assert.equal(lerToken(token, env, Date.now() + 8 * 86400000), null);
  assert.equal(lerToken(token, { ...env, ADMIN_WHATSAPP_KEY: 'outro-segredo-com-pelo-menos-32-caracteres' }), null);
  const partes = token.split('.');
  const alterado = Buffer.from(JSON.stringify({ ...corpo, o: 43 })).toString('base64url') + '.' + partes[1];
  assert.equal(lerToken(alterado, env), null);
  assert.equal(lerToken(token + '.extra', env), null);
  assert.equal(lerToken('invalido', env), null);
  assert.equal(admValido(`Link ${token}`, env), false);
  assert.equal(admValido(`Bearer ${env.ADMIN_WHATSAPP_KEY}`, env), true);
  const link = new URL(criarLink(env, 42, 'marcela', 3));
  assert.equal(link.search, '');
  assert.ok(link.hash.startsWith('#ocorrencias/42?acesso='));
});
