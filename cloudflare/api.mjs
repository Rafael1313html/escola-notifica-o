import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import validacao from '../src/validacao.js';
import anexos from '../src/anexos.js';
import acesso from '../src/acesso.js';
import { DESTINATARIOS, validarDestinatarios, pronto } from './whatsapp.mjs';

const { GRAVIDADES, hojeISO, idValido, validarOcorrencia } = validacao;
const { validarAnexo } = anexos;
const { admValido, lerToken, criarLink } = acesso;
const cabecalhos = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' };
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: cabecalhos });
const falha = (mensagem, status) => json({ erros: [mensagem] }, status);
const consulta = `SELECT o.id, e.nome AS escola, o.data_ocorrencia, o.tipo, o.descricao,
  o.gravidade, o.registrado_por, o.registrado_por_outro, o.status, o.criado_em,
  a.tipo AS anexo_tipo, a.nome AS anexo_nome, a.url AS anexo_url, a.tamanho AS anexo_tamanho
  FROM ocorrencias o JOIN escolas e ON e.id = o.escola_id
  LEFT JOIN ocorrencia_anexos a ON a.ocorrencia_id = o.id`;
function comAnexo({ anexo_tipo, anexo_nome, anexo_url, anexo_tamanho, ...ocorrencia }) {
  return { ...ocorrencia, anexo: anexo_tipo
    ? { tipo: anexo_tipo, nome: anexo_nome, url: anexo_url, tamanho: anexo_tamanho } : null };
}

async function lerJSON(request, limite) {
  if (Number(request.headers.get('content-length')) > limite) throw { status: 413 };
  const leitor = request.body?.getReader();
  if (!leitor) throw { status: 400 };
  const partes = [];
  let tamanho = 0;
  while (true) {
    const { value, done } = await leitor.read();
    if (done) break;
    tamanho += value.byteLength;
    if (tamanho > limite) { await leitor.cancel(); throw { status: 413 }; }
    partes.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(partes).toString('utf8')); }
  catch { throw { status: 400 }; }
}

export async function atenderAPI(request, env) {
  try {
    const url = new URL(request.url);
    const caminho = url.pathname;
    const metodo = request.method;
    const db = env.DB;
    if (!db) return falha('O banco compartilhado ainda não foi configurado no Cloudflare.', 503);

    const autorizacao = request.headers.get('Authorization') || '';
    const adm = admValido(autorizacao, env);
    if (caminho.startsWith('/api/admin/') && (env.ADMIN_WHATSAPP_KEY || '').length < 32) return falha('O acesso ADM ainda não foi configurado no servidor.', 503);
    let origemLink = null;
    const publico = metodo === 'GET' && caminho === '/api/escolas'
      || metodo === 'POST' && caminho === '/api/ocorrencias';
    if (!publico && !adm) {
      const token = autorizacao.startsWith('Link ') ? lerToken(autorizacao.slice(5), env) : null;
      if (token && !caminho.startsWith('/api/admin/')) {
        const pessoa = await db.prepare('SELECT numero, acesso_versao FROM whatsapp_destinatarios WHERE id = ?').bind(token.d).first();
        if (pessoa?.numero && pessoa.acesso_versao === token.r) origemLink = token.o;
      }
      if (!origemLink) return falha('Acesso restrito ao ADM ou ao link recebido pelo responsável.', 401);
    }

    // A autorização acontece no servidor antes de consultar ou alterar números.
    if (caminho.startsWith('/api/admin/')) {
      const senha = env.ADMIN_WHATSAPP_KEY || '';
      if (senha.length < 32) return falha('O acesso ADM ainda não foi configurado no servidor.', 503);
      const recebido = Buffer.from(request.headers.get('Authorization') || '');
      const esperado = Buffer.from(`Bearer ${senha}`);
      if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return falha('Senha ADM inválida.', 401);
    }
    if (caminho === '/api/admin/whatsapp' && metodo === 'GET') {
      const [numeros, envios] = await db.batch([
        db.prepare('SELECT id, numero FROM whatsapp_destinatarios'),
        db.prepare('SELECT id, ocorrencia_id, destinatario_id, status, atualizado_em FROM whatsapp_envios ORDER BY id DESC LIMIT 30'),
      ]);
      return json({ ativo: pronto(env), destinatarios: DESTINATARIOS.map((p) => ({ ...p,
        numero: numeros.results.find((r) => r.id === p.id)?.numero || '' })), envios: envios.results });
    }
    if (caminho === '/api/admin/whatsapp' && metodo === 'PUT') {
      const { erros, dados } = validarDestinatarios(await lerJSON(request, 32768));
      if (erros.length) return json({ erros }, 400);
      await db.batch(dados.map((p) => db.prepare(`INSERT INTO whatsapp_destinatarios (id, numero) VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET acesso_versao = whatsapp_destinatarios.acesso_versao
          + CASE WHEN whatsapp_destinatarios.numero <> excluded.numero THEN 1 ELSE 0 END,
        numero = excluded.numero`).bind(p.id, p.numero)));
      return json({ salvo: true });
    }
    if (caminho === '/api/acesso' && metodo === 'GET') return json({ perfil: adm ? 'ADM' : 'RESPONSAVEL', ocorrencia_id: origemLink, escopo: 'REDE' });
    const gerenciar = caminho.match(/^\/api\/admin\/ocorrencias\/([1-9]\d*)$/);
    if (gerenciar && ['PATCH', 'DELETE'].includes(metodo)) {
      const id = Number(gerenciar[1]);
      if (!idValido(id)) return falha('Registro inválido.', 400);
      if (metodo === 'DELETE') {
        const resultado = await db.prepare('DELETE FROM ocorrencias WHERE id = ?').bind(id).run();
        return resultado.meta.changes ? json({ excluido: true }) : falha('Ocorrência não encontrada.', 404);
      }
      const { erros, dados } = validarOcorrencia(await lerJSON(request, 32768));
      if (erros.length) return json({ erros }, 400);
      const resultado = await db.prepare(`UPDATE ocorrencias SET escola_id = ?, data_ocorrencia = ?, tipo = ?, descricao = ?,
        gravidade = ?, registrado_por = ?, registrado_por_outro = ? WHERE id = ?`).bind(dados.escola_id, dados.data_ocorrencia,
        dados.tipo, dados.descricao, dados.gravidade, dados.registrado_por, dados.registrado_por_outro, id).run();
      return resultado.meta.changes ? json({ alterado: true }) : falha('Ocorrência não encontrada.', 404);
    }
    const links = caminho.match(/^\/api\/admin\/ocorrencias\/([1-9]\d*)\/links$/);
    if (links && metodo === 'POST') {
      const id = Number(links[1]);
      if (!idValido(id)) return falha('Registro inválido.', 400);
      if (!await db.prepare('SELECT id FROM ocorrencias WHERE id = ?').bind(id).first()) return falha('Ocorrência não encontrada.', 404);
      const { results } = await db.prepare("SELECT id, acesso_versao FROM whatsapp_destinatarios WHERE numero <> ''").all();
      return json({ links: results.map((p) => ({ destinatario: p.id, url: criarLink(env, id, p.id, p.acesso_versao) })), validade_dias: 7 });
    }
    if (caminho === '/api/escolas' && metodo === 'GET') {
      return json((await db.prepare('SELECT id, nome FROM escolas ORDER BY nome').all()).results);
    }
    if (caminho === '/api/ocorrencias' && metodo === 'POST') {
      const corpo = await lerJSON(request, 8 * 1024 * 1024);
      const { erros, dados } = validarOcorrencia(corpo);
      if (erros.length) return json({ erros }, 400);
      const validado = validarAnexo(corpo.anexo);
      if (validado.erros.length) return json({ erros: validado.erros }, 400);
      const anexo = validado.anexo;
      // Um identificador privado liga todas as operações dentro do mesmo batch atômico.
      // Não usar last_insert_rowid(): inserir partes do PDF também altera esse valor.
      const pedido = crypto.randomUUID();
      const idSQL = '(SELECT id FROM ocorrencias WHERE pedido = ?)';
      const comandos = [db.prepare(`INSERT INTO ocorrencias
        (pedido, escola_id, data_ocorrencia, tipo, descricao, gravidade, registrado_por, registrado_por_outro)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(pedido, dados.escola_id, dados.data_ocorrencia,
        dados.tipo, dados.descricao, dados.gravidade, dados.registrado_por, dados.registrado_por_outro)];
      if (anexo) {
        comandos.push(db.prepare(`INSERT INTO ocorrencia_anexos (ocorrencia_id, tipo, nome, url, tamanho)
          VALUES (${idSQL}, ?, ?, ?, ?)`).bind(pedido, anexo.tipo, anexo.nome || null, anexo.url || null, anexo.tamanho || null));
        // D1 limita cada BLOB a 2 MB. Partes de 512 KB preservam o limite público de PDF de 5 MB.
        for (let posicao = 0; anexo.arquivo && posicao < anexo.arquivo.length; posicao += 512 * 1024) {
          const parte = anexo.arquivo.subarray(posicao, posicao + 512 * 1024);
          comandos.push(db.prepare(`INSERT INTO anexo_partes (ocorrencia_id, posicao, arquivo)
            VALUES (${idSQL}, ?, ?)`).bind(pedido, posicao, parte.buffer.slice(parte.byteOffset, parte.byteOffset + parte.byteLength)));
        }
      }
      const ativo = pronto(env);
      if (ativo) comandos.push(db.prepare(`INSERT INTO whatsapp_envios (ocorrencia_id, destinatario_id, numero, acesso_versao)
        SELECT ${idSQL}, id, numero, acesso_versao FROM whatsapp_destinatarios WHERE numero <> ''`).bind(pedido));
      const resultados = await db.batch(comandos);
      const id = resultados[0].results[0].id;
      const total = ativo ? resultados.at(-1).meta.changes : 0;
      return json({ id, whatsapp: { status: !ativo ? 'NAO_CONFIGURADO' : total ? 'PENDENTE' : 'SEM_DESTINATARIOS', total } }, 201);
    }
    if (caminho === '/api/ocorrencias' && metodo === 'GET') {
      const filtros = [], valores = [];
      if (url.searchParams.has('gravidade')) {
        const gravidade = url.searchParams.get('gravidade');
        if (!GRAVIDADES.includes(gravidade)) return falha('Gravidade inválida.', 400);
        filtros.push('o.gravidade = ?'); valores.push(gravidade);
      }
      if (url.searchParams.has('escola_id')) {
        const escola = url.searchParams.get('escola_id');
        if (!idValido(escola)) return falha('Escola inválida.', 400);
        filtros.push('o.escola_id = ?'); valores.push(Number(escola));
      }
      const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
      return json((await db.prepare(`${consulta} ${where} ORDER BY o.data_ocorrencia DESC, o.id DESC LIMIT 200`)
        .bind(...valores).all()).results.map(comAnexo));
    }
    const detalhe = caminho.match(/^\/api\/ocorrencias\/([^/]+)(\/anexo)?$/);
    if (detalhe && metodo === 'GET') {
      if (!idValido(detalhe[1])) return falha('Registro inválido.', 400);
      const id = Number(detalhe[1]);
      if (detalhe[2]) {
        const anexo = await db.prepare("SELECT nome FROM ocorrencia_anexos WHERE ocorrencia_id = ? AND tipo = 'PDF'").bind(id).first();
        if (!anexo) return falha('PDF não encontrado para esta ocorrência.', 404);
        const { results } = await db.prepare('SELECT arquivo FROM anexo_partes WHERE ocorrencia_id = ? ORDER BY posicao').bind(id).all();
        return new Response(Buffer.concat(results.map((p) => Buffer.from(p.arquivo))), { headers: {
          ...cabecalhos, 'Content-Type': 'application/pdf', 'Content-Security-Policy': "sandbox; default-src 'none'",
          'Content-Disposition': `attachment; filename="ocorrencia-${id}.pdf"; filename*=UTF-8''${encodeURIComponent(anexo.nome)}`,
        } });
      }
      const linha = await db.prepare(`${consulta} WHERE o.id = ?`).bind(id).first();
      return linha ? json(comAnexo(linha)) : falha('Ocorrência não encontrada.', 404);
    }
    if (caminho === '/api/indicadores' && metodo === 'GET') {
      const hoje = hojeISO();
      const inicio = new Date(`${hoje.slice(0, 7)}-01T12:00:00Z`);
      inicio.setUTCMonth(inicio.getUTCMonth() - 5);
      const [totais, meses] = await db.batch([
        db.prepare(`SELECT COUNT(*) AS total_ocorrencias, COALESCE(SUM(gravidade = 'VERMELHO'), 0) AS total_vermelhas,
          COALESCE(SUM(gravidade = 'AMARELO'), 0) AS total_amarelas, COUNT(DISTINCT escola_id) AS escolas_com_registros,
          (SELECT COUNT(*) FROM escolas) AS total_escolas FROM ocorrencias`),
        db.prepare(`SELECT substr(data_ocorrencia, 1, 7) AS mes, COUNT(*) AS total,
          SUM(gravidade = 'VERMELHO') AS vermelhas, SUM(gravidade = 'AMARELO') AS amarelas FROM ocorrencias
          WHERE data_ocorrencia >= ? AND data_ocorrencia <= ? GROUP BY mes ORDER BY mes`)
          .bind(inicio.toISOString().slice(0, 10), hoje),
      ]);
      return json({ ...totais.results[0], meses: meses.results });
    }
    if (caminho === '/api/relatorios/vermelhas-por-escola' && metodo === 'GET') {
      return json((await db.prepare(`SELECT e.nome AS escola, COUNT(o.id) AS total_vermelhas FROM escolas e
        LEFT JOIN ocorrencias o ON o.escola_id = e.id AND o.gravidade = 'VERMELHO'
        GROUP BY e.id, e.nome ORDER BY total_vermelhas DESC, e.nome`).all()).results);
    }
    return falha('Recurso não encontrado.', 404);
  } catch (erro) {
    if (erro.status === 413) return falha('O conteúdo enviado excede o limite permitido.', 413);
    if (erro.status === 400) return falha('JSON inválido.', 400);
    if (/FOREIGN KEY constraint failed/.test(String(erro.message))) return falha('Escolha uma escola cadastrada.', 400);
    console.error('Falha na API Cloudflare:', erro.name || 'Erro');
    return falha('Não foi possível concluir a operação. Tente novamente.', 500);
  }
}
