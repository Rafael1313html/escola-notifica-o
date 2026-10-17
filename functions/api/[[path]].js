// Cloudflare Pages encaminha a API para o servidor Node.js/MySQL.
// Configure API_ORIGIN como variável do Pages, por exemplo https://seu-backend.example.com.
export async function onRequest({ request, env }) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  let origem;
  try {
    origem = new URL(env.API_ORIGIN);
    if (origem.protocol !== 'https:' || origem.username || origem.password || origem.pathname !== '/' || origem.search || origem.hash) throw new Error();
  } catch {
    return new Response(JSON.stringify({ erros: ['O backend compartilhado ainda não foi configurado no Cloudflare.'] }), { status: 503, headers });
  }
  const url = new URL(request.url);
  const destino = new URL(origem.origin);
  destino.pathname = url.pathname;
  destino.search = url.search;
  const encaminhar = new Headers();
  for (const nome of ['Content-Type', 'Authorization']) {
    if (request.headers.has(nome)) encaminhar.set(nome, request.headers.get(nome));
  }
  try {
    const resposta = await fetch(destino, { method: request.method, headers: encaminhar,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (resposta.status >= 300 && resposta.status < 400) throw new Error();
    const retorno = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const nome of ['Content-Type', 'Content-Disposition', 'Content-Security-Policy']) {
      if (resposta.headers.has(nome)) retorno.set(nome, resposta.headers.get(nome));
    }
    return new Response(resposta.body, { status: resposta.status, headers: retorno });
  } catch {
    return new Response(JSON.stringify({ erros: ['Não foi possível acessar o servidor da aplicação.'] }), { status: 502, headers });
  }
}
