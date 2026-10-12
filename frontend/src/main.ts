import './styles.css';
import { ApiError, criarOcorrencia, listarEscolas, listarOcorrencias, listarRelatorio } from './api';
import type { Escola, Gravidade, ItemRelatorio, NovaOcorrencia, Ocorrencia, Registrante } from './types';

/* ---------- utilidades ---------- */

function q<T extends HTMLElement>(seletor: string, raiz: ParentNode = document): T {
  const elemento = raiz.querySelector<T>(seletor);
  if (!elemento) throw new Error(`Elemento não encontrado: ${seletor}`);
  return elemento;
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const ROTULO_REGISTRANTE: Record<Registrante, string> = {
  DIRETOR: 'Diretor',
  VICE_DIRETOR: 'Vice-diretor',
  OUTROS: 'Outros',
};

const ROTULO_GRAVIDADE: Record<Gravidade, string> = {
  AMARELO: 'Amarelo',
  VERMELHO: 'Vermelho',
};

/* ---------- estado ---------- */

type Painel = 'registrar' | 'ocorrencias' | 'relatorio';

const estado = {
  escolas: new Map<string, number>(), // nome normalizado -> id
  ocorrencias: [] as Ocorrencia[],
  relatorio: [] as ItemRelatorio[],
  filtroGravidade: '' as Gravidade | '',
  busca: '',
  mostrarZeradas: false,
};

const CHAVE_REGISTRANTE = 'escola-notificacao:registrado_por';

function lerPreferencia(): string | null {
  try {
    return localStorage.getItem(CHAVE_REGISTRANTE);
  } catch {
    return null;
  }
}

function salvarPreferencia(valor: string): void {
  try {
    localStorage.setItem(CHAVE_REGISTRANTE, valor);
  } catch {
    /* sem armazenamento: segue sem lembrar */
  }
}

/* ---------- elementos ---------- */

const form = q<HTMLFormElement>('#form');
const campoEscola = q<HTMLInputElement>('#escola');
const campoData = q<HTMLInputElement>('#data');
const campoTipo = q<HTMLInputElement>('#tipo');
const campoDescricao = q<HTMLTextAreaElement>('#descricao');
const campoOutro = q<HTMLInputElement>('#outro');
const blocoOutro = q<HTMLDivElement>('#outro-campo');
const botaoEnviar = q<HTMLButtonElement>('#enviar');
const erroGeral = q<HTMLParagraphElement>('#erro-geral');
const contador = q<HTMLParagraphElement>('#contador');
const aviso = q<HTMLDivElement>('#aviso');

/* ---------- abas ---------- */

const abas = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const paineis: Record<Painel, HTMLElement> = {
  registrar: q('#painel-registrar'),
  ocorrencias: q('#painel-ocorrencias'),
  relatorio: q('#painel-relatorio'),
};
const telaLarga = window.matchMedia('(min-width: 960px)');
let painelAtivo: Painel = 'registrar';

function ativar(painel: Painel, moverFoco = false): void {
  // Em telas largas o formulário fica sempre visível ao lado.
  if (telaLarga.matches && painel === 'registrar') painel = 'ocorrencias';
  painelAtivo = painel;
  (Object.keys(paineis) as Painel[]).forEach((nome) => {
    paineis[nome].hidden = nome !== painel;
  });
  abas.forEach((aba) => {
    const ativa = aba.dataset.painel === painel;
    aba.setAttribute('aria-selected', String(ativa));
    aba.tabIndex = ativa ? 0 : -1;
    if (ativa && moverFoco) aba.focus();
  });
  if (location.hash !== `#${painel}`) history.replaceState(null, '', `#${painel}`);
  if (painel === 'ocorrencias') void carregarOcorrencias();
  if (painel === 'relatorio') void carregarRelatorio();
}

abas.forEach((aba) => {
  aba.addEventListener('click', () => ativar(aba.dataset.painel as Painel));
  aba.addEventListener('keydown', (ev) => {
    const visiveis = abas.filter((a) => a.offsetParent !== null);
    const i = visiveis.indexOf(aba);
    let destino: HTMLButtonElement | undefined;
    if (ev.key === 'ArrowRight') destino = visiveis[(i + 1) % visiveis.length];
    if (ev.key === 'ArrowLeft') destino = visiveis[(i - 1 + visiveis.length) % visiveis.length];
    if (destino) {
      ev.preventDefault();
      ativar(destino.dataset.painel as Painel, true);
    }
  });
});

telaLarga.addEventListener('change', () => ativar(painelAtivo));

function painelDaUrl(): Painel {
  const h = location.hash.replace('#', '');
  return h === 'ocorrencias' || h === 'relatorio' || h === 'registrar' ? h : 'registrar';
}
window.addEventListener('hashchange', () => ativar(painelDaUrl()));

/* ---------- aviso (toast) ---------- */

let temporizadorAviso: number | undefined;
function mostrarAviso(texto: string): void {
  aviso.textContent = texto;
  aviso.classList.add('visivel');
  window.clearTimeout(temporizadorAviso);
  temporizadorAviso = window.setTimeout(() => aviso.classList.remove('visivel'), 4000);
}

/* ---------- formulário ---------- */

type CampoErro = 'escola' | 'data' | 'gravidade' | 'registrado_por' | 'outro';
interface ErroCampo {
  campo: CampoErro;
  mensagem: string;
}

const ALVO_FOCO: Record<CampoErro, string> = {
  escola: 'escola',
  data: 'data',
  gravidade: 'g-amarelo',
  registrado_por: 'r-diretor',
  outro: 'outro',
};

function limparErro(campo: CampoErro): void {
  q<HTMLParagraphElement>(`#erro-${campo}`).textContent = '';
  const alvo = document.getElementById(ALVO_FOCO[campo]);
  alvo?.removeAttribute('aria-invalid');
}

function limparTodosErros(): void {
  (Object.keys(ALVO_FOCO) as CampoErro[]).forEach(limparErro);
  erroGeral.hidden = true;
  erroGeral.textContent = '';
}

function mostrarErro(erro: ErroCampo): void {
  q<HTMLParagraphElement>(`#erro-${erro.campo}`).textContent = erro.mensagem;
  document.getElementById(ALVO_FOCO[erro.campo])?.setAttribute('aria-invalid', 'true');
}

function valorRadio(nome: string): string {
  const marcado = form.querySelector<HTMLInputElement>(`input[name="${nome}"]:checked`);
  return marcado ? marcado.value : '';
}

function validar(): { erros: ErroCampo[]; dados: NovaOcorrencia | null } {
  const erros: ErroCampo[] = [];

  const escolaId = estado.escolas.get(normalizar(campoEscola.value));
  if (escolaId === undefined) {
    erros.push({
      campo: 'escola',
      mensagem: campoEscola.value.trim()
        ? 'Escolha uma escola da lista de sugestões.'
        : 'Escolha a escola.',
    });
  }

  if (!campoData.value) {
    erros.push({ campo: 'data', mensagem: 'Informe a data da ocorrência.' });
  } else if (campoData.value > hojeISO()) {
    erros.push({ campo: 'data', mensagem: 'A data não pode ser no futuro.' });
  }

  const gravidade = valorRadio('gravidade');
  if (gravidade !== 'AMARELO' && gravidade !== 'VERMELHO') {
    erros.push({ campo: 'gravidade', mensagem: 'Escolha amarelo ou vermelho.' });
  }

  const registrante = valorRadio('registrado_por');
  if (registrante !== 'DIRETOR' && registrante !== 'VICE_DIRETOR' && registrante !== 'OUTROS') {
    erros.push({ campo: 'registrado_por', mensagem: 'Escolha quem registrou.' });
  } else if (registrante === 'OUTROS' && !campoOutro.value.trim()) {
    erros.push({ campo: 'outro', mensagem: 'Informe o nome ou cargo de quem registrou.' });
  }

  if (erros.length > 0 || escolaId === undefined) return { erros, dados: null };

  return {
    erros,
    dados: {
      escola_id: escolaId,
      data_ocorrencia: campoData.value,
      tipo: campoTipo.value.trim(),
      descricao: campoDescricao.value.trim(),
      gravidade: gravidade as Gravidade,
      registrado_por: registrante as Registrante,
      registrado_por_outro: campoOutro.value.trim(),
    },
  };
}

// Some o erro assim que a pessoa corrige o campo.
campoEscola.addEventListener('input', () => limparErro('escola'));
campoData.addEventListener('input', () => limparErro('data'));
campoOutro.addEventListener('input', () => limparErro('outro'));
form.querySelectorAll<HTMLInputElement>('input[name="gravidade"]').forEach((r) =>
  r.addEventListener('change', () => limparErro('gravidade'))
);
form.querySelectorAll<HTMLInputElement>('input[name="registrado_por"]').forEach((r) =>
  r.addEventListener('change', () => {
    limparErro('registrado_por');
    const outros = r.value === 'OUTROS' && r.checked;
    blocoOutro.hidden = !outros;
    if (outros) campoOutro.focus();
    else {
      campoOutro.value = '';
      limparErro('outro');
    }
  })
);

campoDescricao.addEventListener('input', () => {
  contador.textContent = `${campoDescricao.value.length} / 2000`;
});

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  limparTodosErros();
  const { erros, dados } = validar();
  if (!dados) {
    erros.forEach(mostrarErro);
    document.getElementById(ALVO_FOCO[erros[0].campo])?.focus();
    return;
  }

  botaoEnviar.disabled = true;
  botaoEnviar.textContent = 'Registrando…';
  try {
    await criarOcorrencia(dados);
    salvarPreferencia(dados.registrado_por);
    mostrarAviso('Ocorrência registrada.');
    reiniciarFormulario(dados.registrado_por);
    // Atualiza só o que está na tela; as outras seções recarregam ao abrir.
    if (painelAtivo === 'ocorrencias') void carregarOcorrencias();
    if (painelAtivo === 'relatorio') void carregarRelatorio();
    campoEscola.focus();
  } catch (erro) {
    const mensagens = erro instanceof ApiError ? erro.erros : ['Não foi possível registrar. Tente novamente.'];
    erroGeral.textContent = mensagens.join(' ');
    erroGeral.hidden = false;
    erroGeral.focus();
  } finally {
    botaoEnviar.disabled = false;
    botaoEnviar.textContent = 'Registrar ocorrência';
  }
});

function reiniciarFormulario(registrante: Registrante): void {
  campoEscola.value = '';
  campoTipo.value = '';
  campoDescricao.value = '';
  contador.textContent = '0 / 2000';
  form.querySelectorAll<HTMLInputElement>('input[name="gravidade"]').forEach((r) => (r.checked = false));
  // Mantém a data e quem registrou: costuma ser a mesma pessoa em várias ocorrências.
  const mantido = form.querySelector<HTMLInputElement>(`input[name="registrado_por"][value="${registrante}"]`);
  if (mantido) mantido.checked = true;
  if (registrante !== 'OUTROS') {
    campoOutro.value = '';
    blocoOutro.hidden = true;
  }
}

/* ---------- escolas ---------- */

async function carregarEscolas(): Promise<void> {
  try {
    const escolas: Escola[] = await listarEscolas();
    const lista = q<HTMLDataListElement>('#lista-escolas');
    escolas.forEach((e) => {
      estado.escolas.set(normalizar(e.nome), e.id);
      const opcao = document.createElement('option');
      opcao.value = e.nome;
      lista.appendChild(opcao);
    });
  } catch (erro) {
    erroGeral.textContent =
      erro instanceof ApiError ? erro.erros.join(' ') : 'Não foi possível carregar as escolas.';
    erroGeral.hidden = false;
  }
}

/* ---------- lista de ocorrências ---------- */

const listaEl = q<HTMLDivElement>('#lista');
const listaStatus = q<HTMLParagraphElement>('#lista-status');

function criarCartao(o: Ocorrencia): HTMLElement {
  const cartao = document.createElement('article');
  cartao.className = `cartao ${o.gravidade.toLowerCase()}`;

  const topo = document.createElement('div');
  topo.className = 'cartao-topo';
  const selo = document.createElement('span');
  selo.className = `selo ${o.gravidade.toLowerCase()}`;
  selo.textContent = ROTULO_GRAVIDADE[o.gravidade];
  const data = document.createElement('time');
  data.dateTime = o.data_ocorrencia.slice(0, 10);
  data.textContent = formatarData(o.data_ocorrencia);
  topo.append(selo, data);

  const titulo = document.createElement('h3');
  titulo.textContent = o.escola;

  const meta = document.createElement('p');
  meta.className = 'meta';
  const quem = o.registrado_por === 'OUTROS' && o.registrado_por_outro
    ? o.registrado_por_outro
    : ROTULO_REGISTRANTE[o.registrado_por];
  meta.textContent = [o.tipo, `Registrado por ${quem}`].filter(Boolean).join(' · ');

  cartao.append(topo, titulo, meta);

  if (o.descricao) {
    const detalhes = document.createElement('details');
    const resumo = document.createElement('summary');
    resumo.textContent = 'Ver descrição';
    const texto = document.createElement('p');
    texto.textContent = o.descricao;
    detalhes.append(resumo, texto);
    cartao.appendChild(detalhes);
  }
  return cartao;
}

function desenharLista(): void {
  const termo = normalizar(estado.busca);
  const itens = estado.ocorrencias.filter((o) => !termo || normalizar(o.escola).includes(termo));
  listaEl.replaceChildren(...itens.map(criarCartao));

  if (itens.length === 0) {
    listaStatus.replaceChildren();
    const texto = document.createElement('span');
    const filtrando = Boolean(termo) || estado.filtroGravidade !== '';
    texto.textContent = filtrando
      ? 'Nenhuma ocorrência encontrada com esse filtro. '
      : 'Nenhuma ocorrência registrada ainda. ';
    listaStatus.appendChild(texto);
    if (!filtrando) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'link';
      botao.textContent = 'Registrar a primeira';
      botao.addEventListener('click', () => ativar('registrar'));
      listaStatus.appendChild(botao);
    }
  } else {
    listaStatus.textContent = `${itens.length} ${itens.length === 1 ? 'ocorrência' : 'ocorrências'}`;
  }
}

async function carregarOcorrencias(): Promise<void> {
  listaStatus.textContent = 'Carregando…';
  try {
    estado.ocorrencias = await listarOcorrencias(estado.filtroGravidade);
    desenharLista();
  } catch (erro) {
    listaEl.replaceChildren();
    listaStatus.replaceChildren();
    const msg = document.createElement('span');
    msg.className = 'erro-texto';
    msg.textContent = (erro instanceof ApiError ? erro.erros.join(' ') : 'Erro ao carregar.') + ' ';
    const tentar = document.createElement('button');
    tentar.type = 'button';
    tentar.className = 'link';
    tentar.textContent = 'Tentar de novo';
    tentar.addEventListener('click', () => void carregarOcorrencias());
    listaStatus.append(msg, tentar);
  }
}

q<HTMLInputElement>('#busca').addEventListener('input', (ev) => {
  estado.busca = (ev.target as HTMLInputElement).value;
  desenharLista();
});

const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.chip'));
chips.forEach((chip) =>
  chip.addEventListener('click', () => {
    chips.forEach((c) => c.setAttribute('aria-checked', String(c === chip)));
    estado.filtroGravidade = (chip.dataset.grav ?? '') as Gravidade | '';
    void carregarOcorrencias();
  })
);

/* ---------- relatório ---------- */

const rankingEl = q<HTMLOListElement>('#relatorio');
const resumoEl = q<HTMLParagraphElement>('#resumo');
const relStatus = q<HTMLParagraphElement>('#rel-status');

function desenharRelatorio(): void {
  const comVermelha = estado.relatorio.filter((i) => i.total_vermelhas > 0);
  const total = comVermelha.reduce((soma, i) => soma + i.total_vermelhas, 0);
  resumoEl.textContent = total === 0
    ? 'Nenhuma ocorrência vermelha registrada.'
    : `${total} ${total === 1 ? 'ocorrência vermelha' : 'ocorrências vermelhas'} em ${comVermelha.length} ${comVermelha.length === 1 ? 'escola' : 'escolas'}.`;

  const itens = estado.mostrarZeradas ? estado.relatorio : comVermelha;
  const maior = Math.max(1, ...estado.relatorio.map((i) => i.total_vermelhas));

  rankingEl.replaceChildren(
    ...itens.map((i) => {
      const li = document.createElement('li');
      const nome = document.createElement('span');
      nome.className = 'rank-nome';
      nome.textContent = i.escola;
      const numero = document.createElement('strong');
      numero.className = 'rank-num';
      numero.textContent = String(i.total_vermelhas);
      const barra = document.createElement('span');
      barra.className = 'rank-barra';
      barra.style.setProperty('--largura', `${(i.total_vermelhas / maior) * 100}%`);
      barra.setAttribute('aria-hidden', 'true');
      li.append(nome, numero, barra);
      return li;
    })
  );
  relStatus.textContent = itens.length === 0 ? 'Nada para mostrar.' : '';
}

async function carregarRelatorio(): Promise<void> {
  relStatus.textContent = 'Carregando…';
  try {
    estado.relatorio = await listarRelatorio();
    desenharRelatorio();
  } catch (erro) {
    rankingEl.replaceChildren();
    relStatus.textContent = erro instanceof ApiError ? erro.erros.join(' ') : 'Erro ao carregar.';
  }
}

q<HTMLInputElement>('#mostrar-zeradas').addEventListener('change', (ev) => {
  estado.mostrarZeradas = (ev.target as HTMLInputElement).checked;
  desenharRelatorio();
});

/* ---------- início ---------- */

campoData.value = hojeISO();
campoData.max = hojeISO();
const preferido = lerPreferencia();
if (preferido === 'DIRETOR' || preferido === 'VICE_DIRETOR') {
  const r = form.querySelector<HTMLInputElement>(`input[name="registrado_por"][value="${preferido}"]`);
  if (r) r.checked = true;
}
void carregarEscolas();
ativar(painelDaUrl());
