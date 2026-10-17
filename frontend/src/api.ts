import type { Escola, Gravidade, Indicadores, ItemRelatorio, NovaOcorrencia, Ocorrencia, ResultadoRegistro } from './types';
import { criarOcorrenciaDemo, escolasDemo, listarIndicadoresDemo, listarOcorrenciasDemo, listarRelatorioDemo } from './demo';
import { arquivoDemo } from './arquivos-demo';
import { cabecalhoAcesso, encerrarAcesso, versaoAcesso } from './acesso';

export const modoDemo = import.meta.env.VITE_DEMO_MODE === 'true';

export class ApiError extends Error {
  readonly erros: string[];
  constructor(erros: string[]) {
    super(erros.join(' '));
    this.erros = erros;
  }
}

async function pedir<T>(url: string, opcoes?: RequestInit): Promise<T> {
  const versao = versaoAcesso();
  const privado = url !== '/api/escolas' && (opcoes?.method || 'GET') === 'GET';
  let resp: Response;
  try {
    resp = await fetch(url, { ...opcoes, headers: { ...opcoes?.headers, ...cabecalhoAcesso() }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  } catch (erro) {
    throw new ApiError([erro instanceof DOMException && erro.name === 'TimeoutError'
      ? 'O servidor demorou para responder. Tente novamente.'
      : 'Sem conexão com o servidor. Verifique a conexão e tente novamente.']);
  }
  const corpo: unknown = await resp.json().catch(() => null);
  if (privado && versao !== versaoAcesso()) throw new ApiError(['O acesso foi encerrado.']);
  if (!resp.ok) {
    if (privado && [401, 403].includes(resp.status)) encerrarAcesso();
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

export async function buscarOcorrencia(id: number): Promise<Ocorrencia> {
  if (!modoDemo) return pedir<Ocorrencia>(`/api/ocorrencias/${id}`);
  const registro = (await listarOcorrenciasDemo('')).find((o) => o.id === id);
  if (!registro) throw new ApiError(['Ocorrência não encontrada neste navegador de demonstração.']);
  return registro;
}

export const listarIndicadores = (): Promise<Indicadores> =>
  modoDemo ? listarIndicadoresDemo() : pedir<Indicadores>('/api/indicadores');

export const criarOcorrencia = (dados: NovaOcorrencia): Promise<ResultadoRegistro> =>
  modoDemo ? criarOcorrenciaDemo(dados) : pedir<ResultadoRegistro>('/api/ocorrencias', {
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
    const versao = versaoAcesso();
    const resposta = await fetch(`/api/ocorrencias/${id}/anexo`, { headers: cabecalhoAcesso(), signal: AbortSignal.timeout(30000), cache: 'no-store' });
    if (!resposta.ok) throw new Error('Não foi possível baixar o PDF desta ocorrência. Tente novamente.');
    arquivo = await resposta.blob();
    if (versao !== versaoAcesso()) throw new Error('O acesso foi encerrado.');
  }
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url; link.download = nome;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
