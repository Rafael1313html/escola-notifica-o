export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

export function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : 'Não informada';
}

export function protocolo(id: number): string {
  return `EN-${String(id).padStart(6, '0')}`;
}

export function numero(valor: number): string {
  return new Intl.NumberFormat('pt-BR').format(valor);
}

export function gerarCSV(linhas: (string | number)[][]): string {
  return '\uFEFF' + linhas.map((linha) => linha.map((valor) => {
    const texto = String(valor);
    // Impede que textos de registros sejam interpretados como fórmulas em planilhas.
    const seguro = /^[\s\u0000-\u001f]*[=+@-]/.test(texto) ? `'${texto}` : texto;
    return `"${seguro.replace(/"/g, '""')}"`;
  }).join(';')).join('\r\n');
}

export function baixarCSV(nome: string, linhas: (string | number)[][]): void {
  const url = URL.createObjectURL(new Blob([gerarCSV(linhas)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
