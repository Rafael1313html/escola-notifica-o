const LIMITE_PDF = 5 * 1024 * 1024;

function validarAnexo(valor) {
  if (valor == null) return { anexo: null, erros: [] };
  const falha = (mensagem) => ({ anexo: null, erros: [mensagem] });
  if (typeof valor !== 'object' || Array.isArray(valor)) return falha('Anexo inválido.');
  if (valor.tipo === 'LINK') {
    if (typeof valor.url !== 'string' || valor.url.length > 2048) return falha('O link deve ter até 2048 caracteres.');
    try {
      const url = new URL(valor.url.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      return { anexo: { tipo: 'LINK', url: url.href }, erros: [] };
    } catch {
      return falha('Informe um link válido começando com http:// ou https://, sem credenciais.');
    }
  }
  if (valor.tipo !== 'PDF') return falha('Escolha PDF ou link para o anexo.');
  if (typeof valor.nome !== 'string' || valor.nome.length > 180 ||
      !/^[^\\/\x00-\x1f\x7f]+\.pdf$/i.test(valor.nome.trim())) return falha('Informe um nome de arquivo PDF válido, com até 180 caracteres.');
  if (typeof valor.conteudo !== 'string' || valor.conteudo.length > Math.ceil(LIMITE_PDF / 3) * 4) return falha('O PDF deve ter até 5 MB.');
  if (valor.conteudo.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(valor.conteudo)) return falha('O conteúdo do PDF é inválido.');
  const arquivo = Buffer.from(valor.conteudo, 'base64');
  if (arquivo.toString('base64') !== valor.conteudo) return falha('O conteúdo do PDF é inválido.');
  if (!arquivo.length || arquivo.length > LIMITE_PDF) return falha('O PDF deve ter até 5 MB.');
  if (arquivo.subarray(0, 5).toString('ascii') !== '%PDF-') return falha('O arquivo enviado não é um PDF válido.');
  return { anexo: { tipo: 'PDF', nome: valor.nome.trim(), arquivo, tamanho: arquivo.length }, erros: [] };
}

module.exports = { LIMITE_PDF, validarAnexo };
