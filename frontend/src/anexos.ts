import type { NovoAnexo } from './types';

export const LIMITE_PDF = 5 * 1024 * 1024;

export function linkValido(valor: string): boolean {
  try {
    const url = new URL(valor);
    return valor.length <= 2048 && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export async function lerPDF(arquivo: File): Promise<Extract<NovoAnexo, { tipo: 'PDF' }>> {
  if (!/\.pdf$/i.test(arquivo.name) || arquivo.name.length > 180) throw new Error('Selecione um arquivo .pdf com nome de até 180 caracteres.');
  if (!arquivo.size || arquivo.size > LIMITE_PDF) throw new Error('O PDF deve ter até 5 MB.');
  const assinatura = await arquivo.slice(0, 5).text();
  if (assinatura !== '%PDF-') throw new Error('O arquivo selecionado não é um PDF válido.');
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não foi possível ler o PDF. Selecione o arquivo novamente.'));
    leitor.onload = () => resolve({ tipo: 'PDF', nome: arquivo.name, conteudo: String(leitor.result).split(',')[1] });
    leitor.readAsDataURL(arquivo);
  });
}
