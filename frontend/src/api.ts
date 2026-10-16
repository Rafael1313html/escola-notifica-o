import type { Escola, Gravidade, Indicadores, ItemRelatorio, NovaOcorrencia, Ocorrencia } from './types';
import { criarOcorrenciaDemo, escolasDemo, listarIndicadoresDemo, listarOcorrenciasDemo, listarRelatorioDemo } from './demo';

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
