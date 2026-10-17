const { createHmac, timingSafeEqual } = require('node:crypto');

const DESTINATARIOS_IDS = ['marcela', 'alexandra', 'susana', 'mercia', 'monica', 'camila'];
const DURACAO_LINK = 7 * 24 * 60 * 60;
function iguais(a, b) {
  const primeiro = Buffer.from(a || '');
  const segundo = Buffer.from(b || '');
  return primeiro.length === segundo.length && timingSafeEqual(primeiro, segundo);
}
function admValido(autorizacao, env) {
  return (env.ADMIN_WHATSAPP_KEY || '').length >= 32 && iguais(autorizacao, `Bearer ${env.ADMIN_WHATSAPP_KEY}`);
}
function assinar(corpo, env) {
  return createHmac('sha256', env.ADMIN_WHATSAPP_KEY).update(`conviva-link-v1:${corpo}`).digest('base64url');
}
function criarToken(env, ocorrencia, destinatario, versao = 0, agora = Date.now()) {
  if ((env.ADMIN_WHATSAPP_KEY || '').length < 32 || !DESTINATARIOS_IDS.includes(destinatario)) throw new Error('Acesso não configurado');
  const corpo = Buffer.from(JSON.stringify({ v: 1, p: 'RESPONSAVEL_REDE', o: ocorrencia, d: destinatario, r: versao,
    e: Math.floor(agora / 1000) + DURACAO_LINK })).toString('base64url');
  return `${corpo}.${assinar(corpo, env)}`;
}
function lerToken(token, env, agora = Date.now()) {
  if (typeof token !== 'string' || token.length > 1024 || (env.ADMIN_WHATSAPP_KEY || '').length < 32) return null;
  const partes = token.split('.');
  if (partes.length !== 2 || !iguais(partes[1], assinar(partes[0], env))) return null;
  try {
    const p = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'));
    const segundos = Math.floor(agora / 1000);
    return p.v === 1 && p.p === 'RESPONSAVEL_REDE' && Number.isSafeInteger(p.o) && p.o > 0 && DESTINATARIOS_IDS.includes(p.d)
      && Number.isSafeInteger(p.r) && p.r >= 0 && Number.isSafeInteger(p.e)
      && p.e > segundos && p.e <= segundos + DURACAO_LINK ? p : null;
  } catch { return null; }
}
function criarLink(env, ocorrencia, destinatario, versao = 0) {
  const url = new URL(env.APP_PUBLIC_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Endereço público inválido');
  url.hash = `ocorrencias/${ocorrencia}?acesso=${criarToken(env, ocorrencia, destinatario, versao)}`;
  return url.href;
}
module.exports = { admValido, criarToken, lerToken, criarLink, DURACAO_LINK };
