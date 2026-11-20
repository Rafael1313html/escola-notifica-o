import type { Ocorrencia } from './types';
import { formatarData, hojeISO, normalizar, numero, protocolo } from './utils';

function elemento<K extends keyof HTMLElementTagNameMap>(tag: K, classe = '', texto = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = classe;
  node.textContent = texto;
  return node;
}

/** Consulta local da lista autorizada. Não infere presença ou ausência de ocorrências fora dela. */
export function iniciarAcompanhamento(opcoes: {
  detalhes: (registro: Ocorrencia) => void;
  consultarEscola: (escola: string) => void;
  selo: (gravidade: Ocorrencia['gravidade']) => HTMLElement;
}) {
  const q = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const escola = q<HTMLSelectElement>('painel-escola');
  const busca = q<HTMLInputElement>('painel-busca');
  const gravidade = q<HTMLSelectElement>('painel-gravidade');
  const dias = q<HTMLDivElement>('calendario-dias');
  const hoje = hojeISO();
  let mes = hoje.slice(0, 7);
  let dia = '';
  let registros: Ocorrencia[] | null = null;
  const dataMes = () => new Date(`${mes}-01T12:00:00Z`);
  const nomesDias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  function desenharCalendario(): void {
    const data = dataMes();
    q('calendario-mes').textContent = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    q<HTMLButtonElement>('mes-proximo').disabled = mes >= hoje.slice(0, 7);
    q<HTMLButtonElement>('mes-anterior').disabled = mes <= '0001-01';
    const total = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0)).getUTCDate();
    const contagens = new Map<string, number>();
    for (const registro of registros || []) {
      if (escola.value && registro.escola !== escola.value) continue;
      const chave = registro.data_ocorrencia.slice(0, 10);
      contagens.set(chave, (contagens.get(chave) || 0) + 1);
    }
    dias.replaceChildren();
    const foco = dia || (mes === hoje.slice(0, 7) ? hoje : `${mes}-01`);
    for (let i = 1; i <= total; i++) {
      const iso = `${mes}-${String(i).padStart(2, '0')}`;
      const quantidade = contagens.get(iso) || 0;
      const botao = elemento('button', `calendario-dia${quantidade ? ' com-registro' : ''}`);
      botao.type = 'button';
      botao.dataset.date = iso;
      botao.disabled = iso > hoje || registros === null;
      botao.tabIndex = iso === foco ? 0 : -1;
      botao.setAttribute('aria-pressed', String(iso === dia));
      if (iso === hoje) botao.setAttribute('aria-current', 'date');
      botao.setAttribute('aria-label', `${formatarData(iso)}: ${registros === null ? 'consulta indisponível' : `${quantidade} ${quantidade === 1 ? 'registro' : 'registros'} na consulta`}`);
      const semana = new Date(`${iso}T12:00:00Z`).getUTCDay();
      botao.append(elemento('span', 'dia-semana', nomesDias[semana]), elemento('strong', '', String(i).padStart(2, '0')),
        elemento('span', 'dia-sinal', quantidade ? '•' : '–'));
      botao.addEventListener('click', () => {
        dia = dia === iso ? '' : iso;
        desenhar();
        const alvo = dias.querySelector<HTMLButtonElement>(`[data-date="${iso}"]`)!;
        dias.querySelectorAll<HTMLButtonElement>('button').forEach((b) => { b.tabIndex = b === alvo ? 0 : -1; });
        alvo.focus({ preventScroll: true });
      });
      dias.append(botao);
    }
  }

  dias.addEventListener('keydown', (evento) => {
    if (!(evento.target instanceof HTMLButtonElement)) return;
    const botoes = Array.from(dias.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const indice = botoes.indexOf(evento.target);
    const destino = evento.key === 'ArrowRight' ? indice + 1 : evento.key === 'ArrowLeft' ? indice - 1 : evento.key === 'Home' ? 0 : evento.key === 'End' ? botoes.length - 1 : -1;
    if (destino < 0 || destino >= botoes.length) return;
    evento.preventDefault();
    botoes.forEach((b, i) => { b.tabIndex = i === destino ? 0 : -1; });
    botoes[destino].focus();
  });

  function desenharMural(): void {
    const termo = normalizar(busca.value);
    const itens = (registros || []).filter((o) =>
      (!escola.value || o.escola === escola.value) && (!dia || o.data_ocorrencia.slice(0, 10) === dia) &&
      (!gravidade.value || o.gravidade === gravidade.value) &&
      (!termo || normalizar(`${protocolo(o.id)} ${o.escola} ${o.tipo || ''}`).includes(termo)));
    const filtrando = Boolean(escola.value || dia || gravidade.value || busca.value);
    q('mural-contexto').textContent = dia ? `Ocorrências de ${formatarData(dia)}` : 'Últimos registros da rede de ensino';
    q('mural-limpar').hidden = !filtrando;
    q('mural-status').textContent = registros === null ? 'Consulta indisponível.' : `${itens.length} registros encontrados. Exibindo até 5.`;
    const lista = q('recentes-lista');
    lista.replaceChildren();
    if (!itens.length) {
      const vazio = elemento('div', 'mural-vazio');
      vazio.append(elemento('h3', '', registros === null ? 'Consulta indisponível' : 'Nenhum registro encontrado'),
        elemento('p', '', registros === null ? 'Use Atualizar para tentar novamente.' : filtrando ? 'Limpe os filtros ou selecione outro dia.' : 'As novas ocorrências aparecerão aqui.'));
      lista.append(vazio);
    }
    for (const registro of itens.slice(0, 5)) {
      const cartao = elemento('article', 'ocorrencia-cartao');
      const avatar = elemento('span', 'escola-avatar', iniciais(registro.escola));
      avatar.setAttribute('aria-hidden', 'true');
      const corpo = elemento('div', 'ocorrencia-corpo');
      const abrir = elemento('button', 'ocorrencia-abrir', registro.escola);
      abrir.type = 'button';
      abrir.setAttribute('aria-label', `Ver detalhes do registro ${protocolo(registro.id)}`);
      abrir.addEventListener('click', () => opcoes.detalhes(registro));
      corpo.append(elemento('span', 'ocorrencia-protocolo', `Ocorrência ${protocolo(registro.id)}`), abrir,
        elemento('p', 'ocorrencia-tipo', registro.tipo || 'Tipo não informado'));
      const resumo = elemento('div', 'ocorrencia-metadados');
      const data = elemento('time', '', formatarData(registro.data_ocorrencia));
      data.dateTime = registro.data_ocorrencia.slice(0, 10);
      resumo.append(opcoes.selo(registro.gravidade), data, elemento('span', 'ocorrencia-situacao', registro.status === 'ABERTA' ? 'Aberta' : registro.status));
      corpo.append(resumo);
      cartao.append(avatar, corpo);
      lista.append(cartao);
    }
  }

  function iniciais(nome: string): string { return nome.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join(''); }

  function desenharEscolas(): void {
    const contagens = new Map<string, number>();
    for (const registro of registros || []) contagens.set(registro.escola, (contagens.get(registro.escola) || 0) + 1);
    const lista = q('escolas-destaque');
    lista.replaceChildren();
    for (const [nome, total] of [...contagens].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 6)) {
      const botao = elemento('button', 'escola-atalho');
      botao.type = 'button';
      botao.setAttribute('aria-label', `Consultar ${nome}: ${numero(total)} registros`);
      const avatar = elemento('span', 'escola-avatar', iniciais(nome));
      avatar.setAttribute('aria-hidden', 'true');
      botao.append(avatar, elemento('span', 'escola-atalho-nome', nome), elemento('small', '', `${numero(total)} ${total === 1 ? 'registro' : 'registros'}`));
      botao.addEventListener('click', () => opcoes.consultarEscola(nome));
      lista.append(botao);
    }
    if (!contagens.size) lista.append(elemento('p', 'escolas-vazio', registros === null ? 'Consulta indisponível.' : 'Nenhuma escola com registros na consulta.'));
  }

  function desenhar(): void { desenharCalendario(); desenharMural(); }
  escola.addEventListener('change', desenhar);
  busca.addEventListener('input', desenharMural);
  gravidade.addEventListener('change', desenharMural);
  q('mural-limpar').addEventListener('click', () => {
    dia = ''; escola.value = ''; busca.value = ''; gravidade.value = '';
    desenhar(); busca.focus();
  });
  for (const [id, passo] of [['mes-anterior', -1], ['mes-proximo', 1]] as const) {
    q(id).addEventListener('click', () => {
      const data = dataMes(); data.setUTCMonth(data.getUTCMonth() + passo);
      mes = data.toISOString().slice(0, 7); dia = ''; desenhar();
    });
  }
  q('calendario-hoje').addEventListener('click', () => { mes = hoje.slice(0, 7); dia = hoje; desenhar(); });

  return {
    atualizarEscolas(nomes: string[]) {
      const anterior = escola.value;
      escola.replaceChildren(new Option('Todas as escolas da rede', ''), ...nomes.map((n) => new Option(n, n)));
      escola.value = nomes.includes(anterior) ? anterior : '';
    },
    atualizar(dados: Ocorrencia[] | null) { registros = dados; desenhar(); desenharEscolas(); },
  };
}
