import type { Escola, Gravidade, ItemRelatorio, NovaOcorrencia, Ocorrencia } from './types';

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
    resp = await fetch(url, opcoes);
  } catch {
    throw new ApiError(['Sem conexão com o servidor. Verifique se ele está ligado e tente de novo.']);
  }
  const corpo: unknown = await resp.json().catch(() => null);
  if (!resp.ok) {
    const erros = (corpo as { erros?: string[] } | null)?.erros;
    throw new ApiError(erros && erros.length ? erros : ['Algo deu errado. Tente novamente.']);
  }
  return corpo as T;
}

export const listarEscolas = (): Promise<Escola[]> => pedir<Escola[]>('/api/escolas');

export const listarOcorrencias = (gravidade: Gravidade | ''): Promise<Ocorrencia[]> =>
  pedir<Ocorrencia[]>('/api/ocorrencias' + (gravidade ? `?gravidade=${gravidade}` : ''));

export const listarRelatorio = (): Promise<ItemRelatorio[]> =>
  pedir<ItemRelatorio[]>('/api/relatorios/vermelhas-por-escola');

export const criarOcorrencia = (dados: NovaOcorrencia): Promise<{ id: number }> =>
  pedir<{ id: number }>('/api/ocorrencias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
