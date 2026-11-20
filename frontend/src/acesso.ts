export type Perfil = 'ESCOLA' | 'ADM';
let perfil: Perfil = 'ESCOLA';
let credencial = '';
let tipo = '';
let versao = 0;
export const perfilAtual = (): Perfil => perfil;
export const versaoAcesso = (): number => versao;
export const podeConsultar = (): boolean => perfil === 'ADM';
export const cabecalhoAcesso = (): Record<string, string> => credencial ? { Authorization: `${tipo} ${credencial}` } : {};
function atualizar(novo: Perfil, segredo = '', esquema = ''): void {
  perfil = novo; credencial = segredo; tipo = esquema; versao++;
  window.dispatchEvent(new Event('conviva:acesso'));
}
export const liberarADM = (senha: string): void => atualizar('ADM', senha, 'Bearer');
export const encerrarAcesso = (): void => atualizar('ESCOLA');
