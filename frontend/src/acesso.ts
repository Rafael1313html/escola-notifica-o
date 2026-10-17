export type Perfil = 'ESCOLA' | 'ADM' | 'RESPONSAVEL';
let perfil: Perfil = 'ESCOLA';
let credencial = '';
let tipo = '';
let versao = 0;
export const perfilAtual = (): Perfil => perfil;
export const versaoAcesso = (): number => versao;
export const podeConsultar = (): boolean => perfil !== 'ESCOLA';
export const cabecalhoAcesso = (): Record<string, string> => credencial ? { Authorization: `${tipo} ${credencial}` } : {};
function atualizar(novo: Perfil, segredo = '', esquema = ''): void {
  perfil = novo; credencial = segredo; tipo = esquema; versao++;
  window.dispatchEvent(new Event('conviva:acesso'));
}
export const liberarADM = (senha: string): void => atualizar('ADM', senha, 'Bearer');
export const encerrarAcesso = (): void => atualizar('ESCOLA');

export async function entrarPeloLink(token: string): Promise<void> {
  const inicio = versao;
  const r = await fetch('/api/acesso', { headers: { Authorization: `Link ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const corpo = await r.json();
  if (inicio !== versao) throw new Error('O acesso foi encerrado.');
  if (!r.ok || corpo.perfil !== 'RESPONSAVEL') throw new Error('Link inválido, expirado ou revogado. Solicite outro ao ADM.');
  atualizar('RESPONSAVEL', token, 'Link');
}
