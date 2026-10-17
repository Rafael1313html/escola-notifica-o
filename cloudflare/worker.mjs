import { atenderAPI } from './api.mjs';
import { processarAvisos } from './whatsapp.mjs';

export default {
  async fetch(request, env) {
    const caminho = new URL(request.url).pathname;
    if (caminho.startsWith('/api/')) return atenderAPI(request, env);
    if (caminho === '/health') return new Response('ok');
    return env.ASSETS.fetch(request);
  },
  scheduled(_event, env, contexto) {
    contexto.waitUntil(processarAvisos(env));
  },
};
