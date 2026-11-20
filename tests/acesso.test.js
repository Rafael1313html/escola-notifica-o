const { test } = require('node:test');
const assert = require('node:assert/strict');
const { admValido, linkPainelADM } = require('../src/acesso');

const env = {
  ADMIN_WHATSAPP_KEY: 'segredo-de-teste-com-pelo-menos-32-caracteres',
  APP_PUBLIC_URL: 'https://escola.example.com/',
};

test('somente chave Bearer do ADM autentica consultas', () => {
  assert.equal(admValido(`Bearer ${env.ADMIN_WHATSAPP_KEY}`, env), true);
  assert.equal(admValido('Link token-legado', env), false);
  assert.equal(admValido('', env), false);
  assert.equal(admValido(`Bearer ${env.ADMIN_WHATSAPP_KEY}x`, env), false);
  assert.equal(admValido(`Bearer ${env.ADMIN_WHATSAPP_KEY}`, { ADMIN_WHATSAPP_KEY: 'curta' }), false);
});

test('avisos apontam ao painel e exigem autenticação ADM', () => {
  assert.equal(linkPainelADM(env), 'https://escola.example.com/#visao-geral');
  assert.equal(linkPainelADM({ APP_PUBLIC_URL: 'http://escola.example.com/' }), null);
  assert.equal(linkPainelADM({ APP_PUBLIC_URL: 'https://user:pass@example.com/' }), null);
});
