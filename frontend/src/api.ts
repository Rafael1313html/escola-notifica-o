import type { Escola, Gravidade, Indicadores, ItemRelatorio, NovaOcorrencia, Ocorrencia } from './types';
import { criarOcorrenciaDemo, escolasDemo, listarIndicadoresDemo, listarOcorrenciasDemo, listarRelatorioDemo } from './demo';
import { arquivoDemo } from './arquivos-demo';

export const modoDemo = import.meta.env.VITE_DEMO_MODE === 'true';

export class ApiError extends Error {
  readonly erros: string[];
  constructor(erros: string[]) {
    super(erros.join(' '));
    this.erros = erros;
  }
}

async function pedir<T>(url: string, opcoes?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  } catch (erro) {
    throw new ApiError([erro instanceof DOMException && erro.name === 'TimeoutError'
      ? 'O servidor demorou para responder. Tente novamente.'
      : 'Sem conexão com o servidor. Verifique a conexão e tente novamente.']);
  }
  const corpo: unknown = await resp.json().catch(() => null);
  if (!resp.ok) {
    const erros = (corpo as { erros?: string[] } | null)?.erros;
    throw new ApiError(Array.isArray(erros) && erros.length && erros.every((erro) => typeof erro === 'string')
      ? erros : ['Não foi possível concluir a operação. Tente novamente.']);
  }
  if (corpo === null) throw new ApiError(['O servidor retornou uma resposta inválida.']);
  return corpo as T;
}

export const listarEscolas = (): Promise<Escola[]> =>
  modoDemo ? Promise.resolve(escolasDemo) : pedir<Escola[]>('/api/escolas');

export const listarOcorrencias = (gravidade: Gravidade | ''): Promise<Ocorrencia[]> =>
  modoDemo
    ? listarOcorrenciasDemo(gravidade)
    : pedir<Ocorrencia[]>('/api/ocorrencias' + (gravidade ? `?gravidade=${gravidade}` : ''));

export const listarRelatorio = (): Promise<ItemRelatorio[]> =>
  modoDemo ? listarRelatorioDemo() : pedir<ItemRelatorio[]>('/api/relatorios/vermelhas-por-escola');

export const listarIndicadores = (): Promise<Indicadores> =>
  modoDemo ? listarIndicadoresDemo() : pedir<Indicadores>('/api/indicadores');

export const criarOcorrencia = (dados: NovaOcorrencia): Promise<{ id: number }> =>
  modoDemo ? criarOcorrenciaDemo(dados) : pedir<{ id: number }>('/api/ocorrencias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });

export async function baixarAnexo(id: number, nome: string): Promise<void> {
  let arquivo: Blob;
  if (modoDemo) {
    const conteudo = await arquivoDemo(id, 'ler');
    if (!conteudo) throw new Error('PDF não encontrado neste navegador.');
    arquivo = new Blob([Uint8Array.from(atob(conteudo), (letra) => letra.charCodeAt(0))], { type: 'application/pdf' });
  } else {
    const resposta = await fetch(`/api/ocorrencias/${id}/anexo`, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
    if (!resposta.ok) throw new Error('Não foi possível baixar o PDF desta ocorrência. Tente novamente.');
    arquivo = await resposta.blob();
  }
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url; link.download = nome;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
