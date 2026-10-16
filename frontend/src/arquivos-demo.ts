function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open('escola-notificacao:anexos', 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore('pdfs');
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(new Error('Não foi possível acessar os PDFs neste navegador.'));
  });
}

export async function arquivoDemo(id: number, operacao: 'ler' | 'gravar' | 'excluir', conteudo?: string): Promise<string | undefined> {
  const banco = await abrirBanco();
  try {
    return await new Promise((resolve, reject) => {
      const transacao = banco.transaction('pdfs', operacao === 'ler' ? 'readonly' : 'readwrite');
      const store = transacao.objectStore('pdfs');
      const pedido = operacao === 'ler' ? store.get(id) : operacao === 'gravar' ? store.put(conteudo, id) : store.delete(id);
      transacao.oncomplete = () => resolve(operacao === 'ler' ? pedido.result : undefined);
      transacao.onabort = () => reject(new Error('Não foi possível armazenar o PDF. Verifique o espaço do navegador.'));
      transacao.onerror = () => reject(new Error('Não foi possível armazenar o PDF. Verifique o espaço do navegador.'));
    });
  } finally { banco.close(); }
}
