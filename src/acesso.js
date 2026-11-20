const { timingSafeEqual } = require('node:crypto');

function admValido(autorizacao, env) {
  const chave = env.ADMIN_WHATSAPP_KEY || '';
  const recebido = Buffer.from(autorizacao || '');
  const esperado = Buffer.from(`Bearer ${chave}`);
  return chave.length >= 32 && recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

function linkPainelADM(env) {
  try {
    const url = new URL(env.APP_PUBLIC_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    url.hash = 'visao-geral';
    return url.href;
  } catch { return null; }
}

module.exports = { admValido, linkPainelADM };
