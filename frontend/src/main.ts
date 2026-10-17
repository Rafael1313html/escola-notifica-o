import './styles.css';
import './tema.css';
import './tema';
import { iniciarWhatsApp, mensagemWhatsApp } from './whatsapp';
import { cabecalhoAcesso, entrarPeloLink, perfilAtual, podeConsultar, versaoAcesso } from './acesso';
import { ApiError, baixarAnexo, buscarOcorrencia, criarOcorrencia, listarEscolas, listarIndicadores, listarOcorrencias, listarRelatorio, modoDemo } from './api';
import { lerPDF, LIMITE_PDF, linkValido } from './anexos';
import type { Escola, Gravidade, Indicadores, ItemRelatorio, NovaOcorrencia, Ocorrencia, Registrante } from './types';
import { baixarCSV, formatarData, hojeISO, normalizar, numero, protocolo } from './utils';

/* ---------- utilidades ---------- */

function q<T extends HTMLElement>(seletor: string, raiz: ParentNode = document): T {
  const elemento = raiz.querySelector<T>(seletor);
  if (!elemento) throw new Error(`Elemento não encontrado: ${seletor}`);
  return elemento;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe = '', texto?: string): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function icone(nome: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icone');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${nome}`);
  svg.append(use);
  return svg;
}

const ROTULO_REGISTRANTE: Record<Registrante, string> = {
  DIRETOR: 'Diretor', VICE_DIRETOR: 'Vice-diretor', OUTROS: 'Outros',
};
const ROTULO_GRAVIDADE: Record<Gravidade, string> = { AMARELO: 'Amarela', VERMELHO: 'Vermelha' };

function responsavel(o: Ocorrencia): string {
  return o.registrado_por === 'OUTROS' && o.registrado_por_outro
    ? o.registrado_por_outro : ROTULO_REGISTRANTE[o.registrado_por] || 'Não informado';
}

function criarSelo(gravidade: Gravidade): HTMLElement {
  const cor = gravidade.toLowerCase();
  const selo = el('span', `selo ${cor}`);
  selo.append(el('span', `ponto ${cor}`), document.createTextNode(ROTULO_GRAVIDADE[gravidade]));
  return selo;
}

function criarVazio(titulo: string, texto: string, acao?: { rotulo: string; executar: () => void }): HTMLElement {
  const vazio = el('div', 'vazio');
  vazio.append(icone('lista'), el('h3', '', titulo), el('p', '', texto));
  if (acao) {
    const botao = el('button', 'botao secundario', acao.rotulo);
    botao.type = 'button';
    botao.addEventListener('click', acao.executar);
    vazio.append(botao);
  }
  return vazio;
}

/* ---------- estado ---------- */

type Painel = 'visao-geral' | 'registrar' | 'ocorrencias' | 'relatorio' | 'whatsapp';
const estado = {
  escolas: new Map<string, number>(), // nome normalizado -> id
  ocorrencias: null as Ocorrencia[] | null,
  relatorio: null as ItemRelatorio[] | null,
  indicadores: null as Indicadores | null,
  filtroGravidade: '' as Gravidade | '',
  busca: '', escolaFiltro: '', periodo: '', pagina: 1,
  mostrarZeradas: false, carregando: false, enviando: false,
};
const TAMANHO_PAGINA = 10;
const CHAVE_REGISTRANTE = 'escola-notificacao:registrado_por';

function lerPreferencia(): string | null {
  try { return localStorage.getItem(CHAVE_REGISTRANTE); } catch { return null; }
}
function salvarPreferencia(valor: string): void {
  try { localStorage.setItem(CHAVE_REGISTRANTE, valor); } catch {
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
const campoAnexoTipo = q<HTMLSelectElement>('#anexo-tipo');
const campoAnexoPDF = q<HTMLInputElement>('#anexo-pdf');
const campoAnexoLink = q<HTMLInputElement>('#anexo-link');
const blocoOutro = q<HTMLDivElement>('#outro-campo');
const botaoEnviar = q<HTMLButtonElement>('#enviar');
const erroGeral = q<HTMLParagraphElement>('#erro-geral');
const contador = q<HTMLParagraphElement>('#contador');
const aviso = q<HTMLDivElement>('#aviso');
const botaoAtualizar = q<HTMLButtonElement>('#atualizar');

/* ---------- abas ---------- */

const abas = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
let acessoADM: ReturnType<typeof iniciarWhatsApp>;
const paineis: Record<Painel, HTMLElement> = {
  'visao-geral': q('#painel-visao-geral'), registrar: q('#painel-registrar'),
  ocorrencias: q('#painel-ocorrencias'), relatorio: q('#painel-relatorio'),
  whatsapp: q('#painel-whatsapp'),
};
const TITULOS: Record<Painel, [string, string]> = {
  'visao-geral': ['Visão geral', 'Informações da rede para uma gestão mais atenta e integrada.'],
  registrar: ['Nova ocorrência', 'Registre os fatos e contribua para o acompanhamento da sua escola.'],
  ocorrencias: ['Ocorrências', 'Consulte, filtre e acompanhe os registros da rede de ensino.'],
  relatorio: ['Relatórios', 'Informações consolidadas para apoiar as decisões da gestão.'],
  whatsapp: ['Canal direto com a diretoria', 'Configure quem recebe os avisos de novas ocorrências.'],
};
let painelAtivo: Painel = 'visao-geral';
const telaMovel = window.matchMedia('(max-width: 699px)');

function ativar(painel: Painel, moverFoco = false, registroId?: number): void {
  if (['visao-geral', 'ocorrencias', 'relatorio'].includes(painel) && !podeConsultar()) painel = 'registrar';
  if (painel === 'whatsapp' && !acessoADM?.autenticado()) {
    ativar('visao-geral');
    acessoADM?.solicitarAcesso();
    return;
  }
  q('#inicio').hidden = true;
  q('.lateral').hidden = false;
  q('.aplicacao').hidden = false;
  q<HTMLAnchorElement>('.pular').href = '#conteudo';
  painelAtivo = painel;
  (Object.keys(paineis) as Painel[]).forEach((nome) => { paineis[nome].hidden = nome !== painel; });
  abas.forEach((aba) => {
    const ativa = aba.dataset.painel === painel;
    aba.setAttribute('aria-selected', String(ativa));
    aba.tabIndex = ativa ? 0 : -1;
    if (ativa && moverFoco) aba.focus();
  });
  const [titulo, subtitulo] = TITULOS[painel];
  q('#titulo-pagina').textContent = titulo;
  q('#subtitulo-pagina').textContent = subtitulo;
  q('#caminho-atual').textContent = titulo;
  q<HTMLButtonElement>('.acoes-pagina [data-abrir="registrar"]').hidden = painel === 'registrar';
  document.title = `${titulo} · Conviva SP`;
  const hash = registroId ? `#ocorrencias/${registroId}` : `#${painel}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

abas.forEach((aba) => {
  aba.addEventListener('click', () => ativar(aba.dataset.painel as Painel));
  aba.addEventListener('keydown', (ev) => {
    const visiveis = abas.filter((item) => !item.hidden);
    const i = visiveis.indexOf(aba);
    let destino: HTMLButtonElement | undefined;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') destino = visiveis[(i + 1) % visiveis.length];
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') destino = visiveis[(i - 1 + visiveis.length) % visiveis.length];
    if (ev.key === 'Home') destino = visiveis[0];
    if (ev.key === 'End') destino = visiveis[visiveis.length - 1];
    if (destino) { ev.preventDefault(); ativar(destino.dataset.painel as Painel, true); }
  });
});
function ajustarOrientacao(): void {
  q('[role="tablist"]').setAttribute('aria-orientation', telaMovel.matches ? 'horizontal' : 'vertical');
}
telaMovel.addEventListener('change', ajustarOrientacao);
ajustarOrientacao();
function painelDaUrl(): Painel {
  const h = location.hash.replace('#', '').split('/')[0];
  return Object.hasOwn(paineis, h) ? h as Painel : 'visao-geral';
}
function sincronizarRota(): void {
  const status = q('#registro-link-status');
  status.textContent = '';
  q<HTMLDialogElement>('#detalhes-dialog').close();
  if (location.hash.startsWith('#ocorrencias/')) {
    const hash = location.hash;
    const [valor, parametros = ''] = hash.slice('#ocorrencias/'.length).split('?');
    const id = Number(valor);
    const memoria = window as Window & { __convivaLink?: string };
    const token = new URLSearchParams(parametros).get('acesso') || memoria.__convivaLink;
    delete memoria.__convivaLink;
    if (token) {
      const limpo = `#ocorrencias/${valor}`;
      history.replaceState(null, '', limpo);
      ativar('registrar');
      history.replaceState(null, '', limpo);
      status.textContent = 'Validando link de acesso…';
      void entrarPeloLink(token).then(() => {
        history.replaceState(null, '', limpo);
        sincronizarRota();
      }).catch((erro) => { mostrarAviso(erro instanceof Error ? erro.message : 'Não foi possível validar o link.'); });
      return;
    }
    if (!podeConsultar()) {
      ativar('registrar');
      mostrarAviso('Consulta restrita ao ADM ou ao link pessoal recebido no WhatsApp.');
      return;
    }
    if (!/^[1-9]\d*$/.test(valor) || !Number.isSafeInteger(id)) {
      ativar('ocorrencias');
      status.textContent = 'O link da ocorrência é inválido.';
      return;
    }
    ativar('ocorrencias', false, id);
    status.textContent = 'Abrindo ocorrência…';
    void buscarOcorrencia(id).then((registro) => {
      if (location.hash !== hash) return;
      status.textContent = '';
      abrirDetalhes(registro);
    }).catch((erro) => {
      if (location.hash !== hash) return;
      status.textContent = erro instanceof Error ? erro.message : 'Não foi possível abrir a ocorrência.';
    });
    return;
  }
  if (!location.hash || location.hash === '#inicio') {
    q('#inicio').hidden = false;
    q('.lateral').hidden = true;
    q('.aplicacao').hidden = true;
    q<HTMLAnchorElement>('.pular').href = '#entrada-conteudo';
    document.title = 'Ocorrências escolares · Conviva SP';
  } else ativar(painelDaUrl());
}
window.addEventListener('hashchange', sincronizarRota);
q('#entrar-painel').addEventListener('click', () => {
  ativar('visao-geral');
  q('#conteudo').focus();
});
document.querySelectorAll<HTMLButtonElement>('[data-abrir]').forEach((botao) => {
  botao.addEventListener('click', () => {
    ativar(botao.dataset.abrir as Painel);
    if (painelAtivo === 'registrar') campoEscola.focus();
    else paineis[painelAtivo].focus();
  });
});

/* ---------- aviso (toast) ---------- */

let temporizadorAviso: number | undefined;
function mostrarAviso(texto: string): void {
  aviso.textContent = texto;
  aviso.classList.add('visivel');
  window.clearTimeout(temporizadorAviso);
  temporizadorAviso = window.setTimeout(() => aviso.classList.remove('visivel'), 6000);
}

/* ---------- formulário ---------- */

type CampoErro = 'escola' | 'data' | 'gravidade' | 'registrado_por' | 'outro' | 'anexo-pdf' | 'anexo-link';
interface ErroCampo { campo: CampoErro; mensagem: string; }
const ALVO_FOCO: Record<CampoErro, string> = {
  escola: 'escola', data: 'data', gravidade: 'g-amarelo', registrado_por: 'r-diretor', outro: 'outro',
  'anexo-pdf': 'anexo-pdf', 'anexo-link': 'anexo-link',
};
function limparErro(campo: CampoErro): void {
  q(`#erro-${campo}`).textContent = '';
  document.getElementById(ALVO_FOCO[campo])?.removeAttribute('aria-invalid');
}
function limparTodosErros(): void {
  (Object.keys(ALVO_FOCO) as CampoErro[]).forEach(limparErro);
  erroGeral.hidden = true;
  erroGeral.textContent = '';
}
function mostrarErro(erro: ErroCampo): void {
  q(`#erro-${erro.campo}`).textContent = erro.mensagem;
  document.getElementById(ALVO_FOCO[erro.campo])?.setAttribute('aria-invalid', 'true');
}
function valorRadio(nome: string): string {
  return form.querySelector<HTMLInputElement>(`input[name="${nome}"]:checked`)?.value || '';
}
function validar(): { erros: ErroCampo[]; dados: NovaOcorrencia | null } {
  const erros: ErroCampo[] = [];
  const escolaId = estado.escolas.get(normalizar(campoEscola.value));
  if (escolaId === undefined) erros.push({ campo: 'escola', mensagem: campoEscola.value.trim()
    ? 'Escolha uma escola da lista de sugestões.' : 'Escolha a escola.' });
  campoData.max = hojeISO();
  if (!campoData.value || !campoData.validity.valid) erros.push({ campo: 'data', mensagem: 'Informe uma data válida, igual ou anterior a hoje.' });
  const gravidade = valorRadio('gravidade');
  if (gravidade !== 'AMARELO' && gravidade !== 'VERMELHO') erros.push({ campo: 'gravidade', mensagem: 'Escolha a classificação amarela ou vermelha.' });
  const registrante = valorRadio('registrado_por');
  if (registrante !== 'DIRETOR' && registrante !== 'VICE_DIRETOR' && registrante !== 'OUTROS') {
    erros.push({ campo: 'registrado_por', mensagem: 'Escolha quem registrou.' });
  } else if (registrante === 'OUTROS' && !campoOutro.value.trim()) {
    erros.push({ campo: 'outro', mensagem: 'Informe o nome ou cargo de quem registrou.' });
  }
  if (campoAnexoTipo.value === 'PDF') {
    const arquivo = campoAnexoPDF.files?.[0];
    if (!arquivo) erros.push({ campo: 'anexo-pdf', mensagem: 'Selecione o PDF ou escolha Sem anexo.' });
    else if (!/\.pdf$/i.test(arquivo.name) || arquivo.name.length > 180) erros.push({ campo: 'anexo-pdf', mensagem: 'Selecione um arquivo .pdf com nome de até 180 caracteres.' });
    else if (!arquivo.size || arquivo.size > LIMITE_PDF) erros.push({ campo: 'anexo-pdf', mensagem: 'O PDF deve ter até 5 MB.' });
  }
  if (campoAnexoTipo.value === 'LINK' && !linkValido(campoAnexoLink.value.trim())) {
    erros.push({ campo: 'anexo-link', mensagem: 'Informe um link http:// ou https:// válido, sem credenciais.' });
  }
  if (erros.length || escolaId === undefined) return { erros, dados: null };
  return { erros, dados: { escola_id: escolaId, data_ocorrencia: campoData.value,
    tipo: campoTipo.value.trim(), descricao: campoDescricao.value.trim(), gravidade: gravidade as Gravidade,
    registrado_por: registrante as Registrante, registrado_por_outro: campoOutro.value.trim() } };
}

// Some o erro assim que a pessoa corrige o campo.
campoEscola.addEventListener('input', () => limparErro('escola'));
campoData.addEventListener('input', () => limparErro('data'));
campoOutro.addEventListener('input', () => limparErro('outro'));
form.querySelectorAll<HTMLInputElement>('input[name="gravidade"]').forEach((r) => r.addEventListener('change', () => limparErro('gravidade')));
form.querySelectorAll<HTMLInputElement>('input[name="registrado_por"]').forEach((r) => r.addEventListener('change', () => {
  limparErro('registrado_por');
  const outros = r.value === 'OUTROS' && r.checked;
  blocoOutro.hidden = !outros;
  campoOutro.required = outros;
  if (outros) campoOutro.focus();
  else { campoOutro.value = ''; limparErro('outro'); }
}));
campoDescricao.addEventListener('input', () => { contador.textContent = `${campoDescricao.value.length} / 5000`; });
campoAnexoTipo.addEventListener('change', () => {
  q('#anexo-pdf-campo').hidden = campoAnexoTipo.value !== 'PDF';
  q('#anexo-link-campo').hidden = campoAnexoTipo.value !== 'LINK';
  limparErro('anexo-pdf'); limparErro('anexo-link');
});
campoAnexoPDF.addEventListener('change', () => limparErro('anexo-pdf'));
campoAnexoLink.addEventListener('input', () => limparErro('anexo-link'));

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (estado.enviando || estado.carregando) return;
  limparTodosErros();
  const { erros, dados } = validar();
  if (!dados) {
    erros.forEach(mostrarErro);
    document.getElementById(ALVO_FOCO[erros[0].campo])?.focus();
    return;
  }
  estado.enviando = true;
  botaoEnviar.disabled = true;
  q('span', botaoEnviar).textContent = 'Registrando…';
  form.setAttribute('aria-busy', 'true');
  try {
    if (campoAnexoTipo.value === 'PDF') {
      try { dados.anexo = await lerPDF(campoAnexoPDF.files![0]); } catch (erro) {
        mostrarErro({ campo: 'anexo-pdf', mensagem: erro instanceof Error ? erro.message : 'Não foi possível ler o PDF.' });
        campoAnexoPDF.focus();
        return;
      }
    } else if (campoAnexoTipo.value === 'LINK') dados.anexo = { tipo: 'LINK', url: campoAnexoLink.value.trim() };
    const resultado = await criarOcorrencia(dados);
    salvarPreferencia(dados.registrado_por);
    mostrarAviso(`Ocorrência ${protocolo(resultado.id)} registrada com sucesso.${mensagemWhatsApp(resultado)}`);
    q('#registro-mensageria').textContent = `Ocorrência ${protocolo(resultado.id)} registrada.${mensagemWhatsApp(resultado)}`;
    reiniciarFormulario(dados.registrado_por);
    // Atualiza só o que está na tela; as outras seções recarregam ao abrir.
    // O painel e as consultas agora compartilham os dados atualizados após cada registro.
    await atualizarDados();
    campoEscola.focus();
  } catch (erro) {
    const mensagens = erro instanceof ApiError ? erro.erros : [erro instanceof Error ? erro.message : 'Não foi possível registrar. Tente novamente.'];
    erroGeral.textContent = mensagens.join(' ');
    erroGeral.hidden = false;
    erroGeral.focus();
  } finally {
    estado.enviando = false;
    botaoEnviar.disabled = estado.escolas.size === 0;
    q('span', botaoEnviar).textContent = 'Registrar ocorrência';
    form.removeAttribute('aria-busy');
  }
});
function reiniciarFormulario(registrante: Registrante): void {
  campoEscola.value = ''; campoTipo.value = ''; campoDescricao.value = '';
  campoAnexoTipo.value = ''; campoAnexoPDF.value = ''; campoAnexoLink.value = '';
  q('#anexo-pdf-campo').hidden = true; q('#anexo-link-campo').hidden = true;
  contador.textContent = '0 / 5000';
  limparTodosErros();
  form.querySelectorAll<HTMLInputElement>('input[name="gravidade"]').forEach((r) => { r.checked = false; });
  // Mantém a data e quem registrou: costuma ser a mesma pessoa em várias ocorrências.
  const mantido = form.querySelector<HTMLInputElement>(`input[name="registrado_por"][value="${registrante}"]`);
  if (mantido) mantido.checked = true;
  if (registrante !== 'OUTROS') { campoOutro.value = ''; blocoOutro.hidden = true; campoOutro.required = false; }
}
// Em telas largas o formulário fica sempre visível ao lado.
// As orientações de preenchimento ocupam a coluna lateral do painel de registro.

/* ---------- escolas ---------- */

async function carregarEscolas(): Promise<void> {
  const escolas: Escola[] = await listarEscolas();
  const lista = q<HTMLDataListElement>('#lista-escolas');
  const filtro = q<HTMLSelectElement>('#filtro-escola');
  estado.escolas.clear();
  lista.replaceChildren();
  filtro.replaceChildren(new Option('Todas as escolas', ''));
  escolas.forEach((e) => {
    estado.escolas.set(normalizar(e.nome), e.id);
    lista.append(new Option(e.nome, e.nome));
    filtro.append(new Option(e.nome, e.nome));
  });
  filtro.value = estado.escolaFiltro;
}

/* ---------- lista de ocorrências ---------- */

const listaEl = q<HTMLDivElement>('#lista');
const listaStatus = q<HTMLParagraphElement>('#lista-status');

function criarTabela(itens: Ocorrencia[]): HTMLElement {
  const container = el('div', 'tabela-container');
  container.tabIndex = 0;
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Registros de ocorrências. Role horizontalmente para ver todas as colunas.');
  const tabela = el('table', 'tabela');
  tabela.setAttribute('aria-label', 'Ocorrências escolares');
  const cabecalho = tabela.createTHead().insertRow();
  ['Registro', 'Unidade escolar', 'Classificação', 'Data', 'Detalhes'].forEach((rotulo) => {
    const th = el('th', '', rotulo); th.scope = 'col'; cabecalho.append(th);
  });
  const corpo = tabela.createTBody();
  itens.forEach((o) => {
    const linha = corpo.insertRow();
    linha.insertCell().append(el('span', 'registro-id', protocolo(o.id)));
    const escola = linha.insertCell();
    escola.append(el('span', 'escola-nome', o.escola), el('span', 'tipo-nome', o.tipo || 'Tipo não informado'));
    if (o.descricao) escola.append(el('p', 'descricao-resumo', o.descricao.length > 300 ? `${o.descricao.slice(0, 299).trimEnd()}…` : o.descricao));
    if (o.anexo) escola.append(el('span', 'anexo-indicador', o.anexo.tipo === 'PDF' ? 'PDF anexado' : 'Link anexado'));
    linha.insertCell().append(criarSelo(o.gravidade));
    const data = el('time', '', formatarData(o.data_ocorrencia));
    data.dateTime = o.data_ocorrencia.slice(0, 10);
    linha.insertCell().append(data);
    const ver = el('button', 'botao-icone');
    ver.type = 'button';
    ver.setAttribute('aria-label', `Ver detalhes do registro ${protocolo(o.id)}`);
    ver.append(icone('olho'));
    ver.addEventListener('click', () => abrirDetalhes(o));
    linha.insertCell().append(ver);
  });
  container.append(tabela);
  return container;
}

function itensFiltrados(): Ocorrencia[] {
  const termo = normalizar(estado.busca);
  const hoje = hojeISO();
  const inicio = new Date(`${hoje}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - (Number(estado.periodo) - 1));
  return (estado.ocorrencias || []).filter((o) =>
    (!estado.filtroGravidade || o.gravidade === estado.filtroGravidade) &&
    (!estado.escolaFiltro || o.escola === estado.escolaFiltro) &&
    (!estado.periodo || (o.data_ocorrencia.slice(0, 10) >= inicio.toISOString().slice(0, 10) && o.data_ocorrencia.slice(0, 10) <= hoje)) &&
    (!termo || normalizar(`${o.escola} ${o.tipo || ''} ${protocolo(o.id)}`).includes(termo)));
}
function desenharLista(): void {
  const itens = itensFiltrados();
  const paginas = Math.max(1, Math.ceil(itens.length / TAMANHO_PAGINA));
  estado.pagina = Math.min(estado.pagina, paginas);
  const inicio = (estado.pagina - 1) * TAMANHO_PAGINA;
  const filtrando = Boolean(estado.busca || estado.filtroGravidade || estado.escolaFiltro || estado.periodo);
  listaEl.replaceChildren(itens.length ? criarTabela(itens.slice(inicio, inicio + TAMANHO_PAGINA)) : criarVazio(
    estado.ocorrencias === null ? 'Registros indisponíveis' : filtrando ? 'Nenhuma ocorrência encontrada' : 'Os registros começam por aqui',
    estado.ocorrencias === null ? 'Atualize a página para tentar carregar as informações.' : filtrando ? 'Revise os filtros ou tente outra busca.' : 'Registre a primeira ocorrência para acompanhar a sua rede.',
    { rotulo: estado.ocorrencias === null ? 'Tentar novamente' : filtrando ? 'Limpar filtros' : 'Nova ocorrência',
      executar: estado.ocorrencias === null ? () => { void atualizarDados(); } : filtrando ? limparFiltros : () => { ativar('registrar'); campoEscola.focus(); } }));
  listaStatus.textContent = estado.ocorrencias === null ? '' : `${numero(itens.length)} ${itens.length === 1 ? 'registro encontrado' : 'registros encontrados'}${filtrando ? ' com os filtros selecionados' : ''}.`;
  q('#pagina-info').textContent = itens.length ? `${inicio + 1}–${Math.min(inicio + TAMANHO_PAGINA, itens.length)} de ${numero(itens.length)} registros · Página ${estado.pagina} de ${paginas}` : 'Nenhum registro para exibir';
  q<HTMLButtonElement>('#pagina-anterior').disabled = estado.pagina <= 1;
  q<HTMLButtonElement>('#pagina-proxima').disabled = estado.pagina >= paginas;
  q<HTMLButtonElement>('#exportar-lista').disabled = !itens.length || estado.carregando;
  const recentes = q('#recentes-lista');
  recentes.replaceChildren(estado.ocorrencias?.length ? criarTabela(estado.ocorrencias.slice(0, 5)) : criarVazio(
    estado.ocorrencias === null ? 'Não foi possível carregar os registros' : 'Sua rede, acompanhada desde o primeiro registro',
    estado.ocorrencias === null ? 'Use Atualizar para tentar novamente.' : 'As ocorrências mais recentes serão exibidas aqui.',
    estado.ocorrencias === null ? undefined : { rotulo: 'Registrar ocorrência', executar: () => { ativar('registrar'); campoEscola.focus(); } }));
}
function atualizarFiltros(): void { estado.pagina = 1; desenharLista(); }
q<HTMLInputElement>('#busca').addEventListener('input', (ev) => { estado.busca = (ev.target as HTMLInputElement).value; atualizarFiltros(); });
q<HTMLSelectElement>('#filtro-escola').addEventListener('change', (ev) => { estado.escolaFiltro = (ev.target as HTMLSelectElement).value; atualizarFiltros(); });
q<HTMLSelectElement>('#filtro-periodo').addEventListener('change', (ev) => { estado.periodo = (ev.target as HTMLSelectElement).value; atualizarFiltros(); });
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.chip'));
chips.forEach((chip) => chip.addEventListener('click', () => {
  chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
  estado.filtroGravidade = (chip.dataset.grav || '') as Gravidade | '';
  atualizarFiltros();
}));
function limparFiltros(): void {
  estado.busca = ''; estado.escolaFiltro = ''; estado.periodo = ''; estado.filtroGravidade = '';
  q<HTMLInputElement>('#busca').value = '';
  q<HTMLSelectElement>('#filtro-escola').value = '';
  q<HTMLSelectElement>('#filtro-periodo').value = '';
  chips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.grav === '')));
  atualizarFiltros();
}
q('#limpar-filtros').addEventListener('click', limparFiltros);
q('#pagina-anterior').addEventListener('click', () => { estado.pagina -= 1; desenharLista(); });
q('#pagina-proxima').addEventListener('click', () => { estado.pagina += 1; desenharLista(); });
q('#exportar-lista').addEventListener('click', () => {
  const itens = itensFiltrados();
  if (!itens.length) return;
  baixarCSV(`ocorrencias-${hojeISO()}.csv`, [
    ['Registro', 'Escola', 'Data', 'Classificação', 'Tipo', 'Descrição', 'Responsável', 'Situação'],
    ...itens.map((o) => [protocolo(o.id), o.escola, formatarData(o.data_ocorrencia), ROTULO_GRAVIDADE[o.gravidade], o.tipo || '', o.descricao || '', responsavel(o), o.status]),
  ]);
  mostrarAviso(`${numero(itens.length)} registros exportados com os filtros atuais.`);
});

/* ---------- relatório ---------- */

const rankingEl = q<HTMLOListElement>('#relatorio');
const resumoEl = q<HTMLParagraphElement>('#resumo');
const relStatus = q<HTMLParagraphElement>('#rel-status');
function desenharRelatorio(): void {
  if (!estado.relatorio) {
    resumoEl.textContent = 'Não foi possível consultar o relatório.';
    relStatus.textContent = 'Use Atualizar para tentar novamente.';
    q<HTMLButtonElement>('#exportar-relatorio').disabled = true;
    return;
  }
  const comVermelha = estado.relatorio.filter((i) => i.total_vermelhas > 0);
  const total = comVermelha.reduce((soma, i) => soma + i.total_vermelhas, 0);
  resumoEl.textContent = total === 0 ? 'Nenhuma ocorrência vermelha registrada.'
    : `${numero(total)} ${total === 1 ? 'ocorrência vermelha' : 'ocorrências vermelhas'} em ${numero(comVermelha.length)} ${comVermelha.length === 1 ? 'escola' : 'escolas'}.`;
  const itens = estado.mostrarZeradas ? estado.relatorio : comVermelha;
  const maior = Math.max(1, ...estado.relatorio.map((i) => i.total_vermelhas));
  rankingEl.replaceChildren(...itens.map((i) => {
    const li = el('li');
    const barra = el('span', 'rank-barra');
    barra.style.setProperty('--largura', `${(i.total_vermelhas / maior) * 100}%`);
    barra.setAttribute('aria-hidden', 'true');
    const contagem = el('strong', 'rank-num', numero(i.total_vermelhas));
    contagem.setAttribute('aria-label', `${numero(i.total_vermelhas)} ocorrências vermelhas`);
    li.append(el('span', 'rank-nome', i.escola), contagem, barra);
    return li;
  }));
  relStatus.textContent = itens.length ? `${numero(itens.length)} escolas no relatório.` : 'Nenhuma escola com classificação vermelha neste histórico.';
  q<HTMLButtonElement>('#exportar-relatorio').disabled = !itens.length || estado.carregando;
}
q<HTMLInputElement>('#mostrar-zeradas').addEventListener('change', (ev) => {
  estado.mostrarZeradas = (ev.target as HTMLInputElement).checked;
  desenharRelatorio();
});
q('#exportar-relatorio').addEventListener('click', () => {
  const itens = estado.relatorio?.filter((i) => estado.mostrarZeradas || i.total_vermelhas > 0) || [];
  if (!itens.length) return;
  baixarCSV(`relatorio-vermelhas-${hojeISO()}.csv`, [['Escola', 'Ocorrências vermelhas'], ...itens.map((i) => [i.escola, i.total_vermelhas])]);
  mostrarAviso('Relatório exportado com sucesso.');
});

/* ---------- painel da rede ---------- */

function desenharIndicadores(): void {
  const dados = estado.indicadores;
  if (!dados) {
    q('#grafico-nota').textContent = 'Indicadores indisponíveis. Use Atualizar para tentar novamente.';
    return;
  }
  q('#metrica-total').textContent = numero(dados.total_ocorrencias);
  q('#nav-total').textContent = numero(dados.total_ocorrencias);
  q('#metrica-vermelhas').textContent = numero(dados.total_vermelhas);
  q('#metrica-amarelas').textContent = numero(dados.total_amarelas);
  q('#metrica-escolas').textContent = numero(dados.escolas_com_registros);
  q('#metrica-rede').textContent = `De ${numero(dados.total_escolas)} unidades da rede`;
  const distribuicao = q('#distribuicao');
  distribuicao.replaceChildren(...(['AMARELO', 'VERMELHO'] as Gravidade[]).map((gravidade) => {
    const cor = gravidade.toLowerCase();
    const total = gravidade === 'VERMELHO' ? dados.total_vermelhas : dados.total_amarelas;
    const percentual = dados.total_ocorrencias ? (total / dados.total_ocorrencias) * 100 : 0;
    const item = el('div', 'distribuicao-item');
    const titulo = el('div', 'distribuicao-titulo');
    const contagem = el('strong', '', numero(total));
    contagem.append(el('small', '', `${percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`));
    titulo.append(el('span', `ponto ${cor}`), document.createTextNode(gravidade === 'VERMELHO' ? 'Vermelhas' : 'Amarelas'), contagem);
    const fundo = el('div', 'barra-fundo');
    const barra = el('span', cor);
    barra.style.width = `${percentual}%`;
    fundo.setAttribute('aria-hidden', 'true');
    fundo.append(barra); item.append(titulo, fundo);
    return item;
  }));
  const hoje = hojeISO();
  const meses = Array.from({ length: 6 }, (_, i) => {
    const data = new Date(`${hoje.slice(0, 7)}-01T12:00:00Z`);
    data.setUTCMonth(data.getUTCMonth() - 5 + i);
    const mes = data.toISOString().slice(0, 7);
    return { data, ...(dados.meses.find((item) => item.mes === mes) || { mes, total: 0, amarelas: 0, vermelhas: 0 }) };
  });
  const maior = Math.max(1, ...meses.map((item) => item.total));
  const grafico = q('#grafico-mensal');
  grafico.setAttribute('role', 'group');
  grafico.replaceChildren(...meses.map((item) => {
    const coluna = el('div', 'grafico-coluna');
    const altura = (item.total / maior) * 82;
    coluna.style.setProperty('--altura', `${altura}%`);
    const rotulo = item.data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    coluna.setAttribute('role', 'img');
    coluna.setAttribute('aria-label', `${rotulo}: ${item.amarelas} amarelas e ${item.vermelhas} vermelhas.`);
    coluna.title = `${rotulo}: ${item.total} registros`;
    const barras = el('div', 'grafico-barras');
    const vermelha = el('span', 'barra-vermelha');
    const amarela = el('span', 'barra-amarela');
    vermelha.style.height = `${item.total ? item.vermelhas / item.total * 100 : 0}%`;
    amarela.style.height = `${item.total ? item.amarelas / item.total * 100 : 0}%`;
    barras.append(vermelha, amarela);
    coluna.append(el('span', 'grafico-total', numero(item.total)), barras,
      el('span', 'grafico-mes', item.data.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')));
    return coluna;
  }));
  const totalPeriodo = meses.reduce((total, item) => total + item.total, 0);
  q('#grafico-nota').textContent = `${numero(totalPeriodo)} ${totalPeriodo === 1 ? 'registro' : 'registros'} no período · Inclui o mês atual`;
}

/* ---------- detalhes e orientações ---------- */

function abrirDetalhes(o: Ocorrencia): void {
  q('#detalhes-titulo').textContent = protocolo(o.id);
  const conteudo = q('#detalhes-conteudo');
  const grade = el('dl', 'detalhes-grade');
  const valores = [['Data da ocorrência', formatarData(o.data_ocorrencia)], ['Tipo', o.tipo || 'Não informado'],
    ['Responsável pelo registro', responsavel(o)], ['Situação', o.status === 'ABERTA' ? 'Aberta' : o.status || 'Não informada']];
  valores.forEach(([rotulo, valor]) => {
    const item = el('div'); item.append(el('dt', '', rotulo), el('dd', '', valor)); grade.append(item);
  });
  conteudo.replaceChildren(criarSelo(o.gravidade), el('h3', 'detalhes-escola', o.escola), grade,
    el('p', 'detalhes-descricao', o.descricao || 'Nenhuma descrição informada.'));
  const documentos = el('section', 'detalhes-anexo');
  documentos.append(el('h3', '', 'Documento de apoio'));
  const anexo = o.anexo;
  if (anexo?.tipo === 'PDF') {
    documentos.append(el('p', 'anexo-nome', `${anexo.nome} · ${(anexo.tamanho / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`));
    const baixar = el('button', 'botao secundario', 'Baixar PDF');
    baixar.type = 'button';
    const status = el('p', 'erro'); status.setAttribute('role', 'status');
    baixar.addEventListener('click', async () => {
      baixar.disabled = true; status.textContent = 'Preparando PDF…';
      try { await baixarAnexo(o.id, anexo.nome); status.textContent = 'Download iniciado.'; }
      catch (erro) { status.textContent = erro instanceof Error ? erro.message : 'Não foi possível baixar o PDF.'; }
      finally { baixar.disabled = false; }
    });
    documentos.append(baixar, status);
  } else if (anexo?.tipo === 'LINK' && linkValido(anexo.url)) {
    const link = el('a', 'botao secundario', 'Abrir documento (nova aba)');
    link.href = anexo.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    documentos.append(el('p', 'anexo-nome', anexo.url), link);
  } else documentos.append(el('p', 'ajuda', 'Nenhum documento anexado a esta ocorrência.'));
  conteudo.append(documentos);
  if (perfilAtual() === 'ADM' && !modoDemo) {
    const editar = el('button', 'botao secundario', 'Editar registro'); editar.type = 'button';
    editar.addEventListener('click', () => editarRegistro(o));
    const apagar = el('button', 'botao secundario', 'Apagar registro'); apagar.type = 'button';
    const confirmacao = el('div'); confirmacao.hidden = true;
    const pergunta = el('p', '', 'Apagar este registro, seus documentos e o histórico de avisos?');
    const confirmar = el('button', 'botao principal', 'Confirmar exclusão'); confirmar.type = 'button';
    const cancelar = el('button', 'botao secundario', 'Cancelar exclusão'); cancelar.type = 'button';
    cancelar.addEventListener('click', () => { confirmacao.hidden = true; });
    const erro = el('p', 'erro'); erro.setAttribute('role', 'alert');
    confirmacao.append(pergunta, confirmar, cancelar, erro);
    apagar.addEventListener('click', () => { confirmacao.hidden = false; confirmar.focus(); });
    confirmar.addEventListener('click', async () => {
      confirmar.disabled = true;
      try {
        await gerenciarRegistro(o.id, 'DELETE');
        q<HTMLDialogElement>('#detalhes-dialog').close();
        history.replaceState(null, '', '#ocorrencias');
        await atualizarDados(); mostrarAviso('Registro excluído.');
      } catch (e) { erro.textContent = e instanceof Error ? e.message : 'Falha ao excluir o registro.'; }
      finally { confirmar.disabled = false; }
    });
    conteudo.append(editar, apagar, confirmacao);
    const gerar = el('button', 'botao secundario', 'Gerar links dos responsáveis'); gerar.type = 'button';
    const links = el('div', 'links-responsaveis');
    const mensagem = el('p', 'ajuda', 'Links pessoais permitem consultar toda a rede por sete dias. Compartilhe somente com o responsável indicado.');
    gerar.addEventListener('click', async () => {
      const versao = versaoAcesso(); gerar.disabled = true;
      try {
        const r = await fetch(`/api/admin/ocorrencias/${o.id}/links`, { method: 'POST', headers: cabecalhoAcesso(), cache: 'no-store', signal: AbortSignal.timeout(15000) });
        const corpo = await r.json();
        if (versao !== versaoAcesso()) return;
        if (!r.ok) throw new Error(corpo.erros?.join(' ') || 'Não foi possível gerar os links.');
        links.replaceChildren();
        for (const item of corpo.links) {
          const label = el('label', 'campo', item.destinatario);
          const input = el('input'); input.type = 'text'; input.readOnly = true; input.value = item.url;
          label.append(input); links.append(label);
        }
        mensagem.textContent = corpo.links.length ? 'Cada link permite consultar toda a rede por sete dias. Envie somente ao responsável indicado.' : 'Cadastre primeiro os números no acesso ADM.';
      } catch (erro) { mensagem.textContent = erro instanceof Error ? erro.message : 'Falha ao gerar links.'; }
      finally { gerar.disabled = false; }
    });
    conteudo.append(gerar, mensagem, links);
  }
  q<HTMLDialogElement>('#detalhes-dialog').showModal();
}
q('#abrir-orientacoes').addEventListener('click', () => q<HTMLDialogElement>('#orientacoes-dialog').showModal());
q('#orientacoes-entrada').addEventListener('click', () => q<HTMLDialogElement>('#orientacoes-dialog').showModal());
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
  dialog.querySelectorAll<HTMLButtonElement>('[data-fechar]').forEach((botao) => botao.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (ev) => {
    const limites = dialog.getBoundingClientRect();
    if (ev.target === dialog && (ev.clientX < limites.left || ev.clientX > limites.right || ev.clientY < limites.top || ev.clientY > limites.bottom)) dialog.close();
  });
});

/* ---------- carregamento ---------- */

async function atualizarDados(): Promise<void> {
  if (estado.carregando) return;
  estado.carregando = true;
  const versao = versaoAcesso();
  botaoAtualizar.disabled = true;
  botaoEnviar.disabled = true;
  q<HTMLButtonElement>('#exportar-lista').disabled = true;
  q<HTMLButtonElement>('#exportar-relatorio').disabled = true;
  q('#conteudo').setAttribute('aria-busy', 'true');
  q('#ultima-atualizacao').textContent = 'Atualizando informações da rede…';
  const tarefas = [
    carregarEscolas(),
    ...(podeConsultar() ? [
    listarOcorrencias('').then((dados) => { estado.ocorrencias = dados.slice(0, 200); }),
    listarIndicadores().then((dados) => { estado.indicadores = dados; }),
    listarRelatorio().then((dados) => { estado.relatorio = dados; }),
    ] : []),
  ];
  const resultados = await Promise.allSettled(tarefas);
  estado.carregando = false;
  if (versao !== versaoAcesso()) {
    estado.ocorrencias = null; estado.relatorio = null; estado.indicadores = null;
    await atualizarDados();
    return;
  }
  botaoAtualizar.disabled = false;
  botaoEnviar.disabled = estado.enviando || estado.escolas.size === 0;
  q('#conteudo').removeAttribute('aria-busy');
  desenharLista(); desenharRelatorio(); desenharIndicadores();
  const falhas = resultados.flatMap((resultado, i) => resultado.status === 'rejected' ? [['escolas', 'ocorrências', 'indicadores', 'relatório'][i]] : []);
  const falha = q('#falha-dados');
  falha.hidden = !falhas.length;
  falha.replaceChildren();
  if (falhas.length) {
    falha.append(document.createTextNode(`Não foi possível atualizar: ${falhas.join(', ')}. Informações anteriores, quando disponíveis, foram mantidas. `));
    const tentar = el('button', 'link', 'Tentar novamente');
    tentar.type = 'button'; tentar.addEventListener('click', () => { void atualizarDados(); }); falha.append(tentar);
    q('#ultima-atualizacao').textContent = 'Atualização incompleta. Consulte o aviso acima.';
  } else {
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    q('#ultima-atualizacao').textContent = `Atualizado às ${hora} · Horário de Brasília`;
  }
}
botaoAtualizar.addEventListener('click', () => { void atualizarDados(); });

async function gerenciarRegistro(id: number, method: 'PATCH' | 'DELETE', dados?: NovaOcorrencia): Promise<void> {
  const versao = versaoAcesso();
  const r = await fetch(`/api/admin/ocorrencias/${id}`, { method,
    headers: { ...cabecalhoAcesso(), 'Content-Type': 'application/json' },
    body: dados ? JSON.stringify(dados) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const corpo = await r.json();
  if (versao !== versaoAcesso()) throw new Error('O acesso foi encerrado.');
  if (!r.ok) throw new Error(corpo.erros?.join(' ') || 'Não foi possível atualizar o registro.');
}

function editarRegistro(o: Ocorrencia): void {
  const conteudo = q('#detalhes-conteudo');
  const edicao = el('form'); edicao.className = 'form-edicao';
  const campo = (nome: string, rotulo: string, controle: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    const div = el('div', 'campo'); const label = el('label', '', rotulo);
    controle.id = `editar-${nome}`; controle.name = nome; label.htmlFor = controle.id;
    div.append(label, controle); edicao.append(div); return controle;
  };
  const escola = campo('escola', 'Escola', el('select')) as HTMLSelectElement;
  for (const opcao of q<HTMLDataListElement>('#lista-escolas').options) {
    const id = estado.escolas.get(normalizar(opcao.value));
    escola.add(new Option(opcao.value, String(id), false, opcao.value === o.escola));
  }
  const data = campo('data', 'Data da ocorrência', el('input')) as HTMLInputElement;
  data.type = 'date'; data.required = true; data.min = '1000-01-01'; data.max = hojeISO(); data.value = o.data_ocorrencia.slice(0, 10);
  const tipo = campo('tipo', 'Tipo', el('input')) as HTMLInputElement; tipo.maxLength = 100; tipo.value = o.tipo || '';
  const descricao = campo('descricao', 'Descrição', el('textarea')) as HTMLTextAreaElement;
  descricao.maxLength = 5000; descricao.rows = 5; descricao.value = o.descricao || '';
  const gravidade = campo('gravidade', 'Classificação', el('select')) as HTMLSelectElement;
  gravidade.add(new Option('Amarela', 'AMARELO')); gravidade.add(new Option('Vermelha', 'VERMELHO')); gravidade.value = o.gravidade;
  const registrante = campo('registrado_por', 'Responsável pelo registro', el('select')) as HTMLSelectElement;
  for (const [valor, rotulo] of Object.entries(ROTULO_REGISTRANTE)) registrante.add(new Option(rotulo, valor));
  registrante.value = o.registrado_por;
  const outro = campo('outro', 'Nome ou cargo (obrigatório para Outros)', el('input')) as HTMLInputElement;
  outro.maxLength = 100; outro.value = o.registrado_por_outro || '';
  const erro = el('p', 'erro'); erro.setAttribute('role', 'alert');
  const salvar = el('button', 'botao principal', 'Salvar alterações'); salvar.type = 'submit';
  const cancelar = el('button', 'botao secundario', 'Cancelar edição'); cancelar.type = 'button';
  cancelar.addEventListener('click', () => abrirDetalhes(o));
  edicao.append(erro, salvar, cancelar);
  edicao.addEventListener('submit', async (e) => {
    e.preventDefault(); salvar.disabled = true; erro.textContent = '';
    try {
      await gerenciarRegistro(o.id, 'PATCH', { escola_id: Number(escola.value), data_ocorrencia: data.value,
        tipo: tipo.value, descricao: descricao.value, gravidade: gravidade.value as Gravidade,
        registrado_por: registrante.value as Registrante, registrado_por_outro: outro.value });
      q<HTMLDialogElement>('#detalhes-dialog').close();
      await atualizarDados(); mostrarAviso('Registro alterado.');
    } catch (e) { erro.textContent = e instanceof Error ? e.message : 'Falha ao alterar o registro.'; }
    finally { salvar.disabled = false; }
  });
  conteudo.replaceChildren(el('h3', '', 'Editar registro'), edicao); escola.focus();
}

/* ---------- início ---------- */

campoData.value = hojeISO();
campoData.min = '1000-01-01';
campoData.max = hojeISO();
q<HTMLTimeElement>('#data-atual').dateTime = hojeISO();
q('#data-atual').textContent = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' });
acessoADM = iniciarWhatsApp(() => {
  q('#aba-whatsapp').hidden = false;
  q('.abas-lista').classList.add('adm-liberado');
  ativar('whatsapp');
}, () => {
  q('#aba-whatsapp').hidden = true;
  q('.abas-lista').classList.remove('adm-liberado');
  if (painelAtivo === 'whatsapp') ativar('visao-geral');
  q('#abrir-acesso-adm').focus();
});
let interfacePronta = false;
function ajustarAcesso(): void {
  const consultar = podeConsultar();
  for (const aba of abas) {
    if (['visao-geral', 'ocorrencias', 'relatorio'].includes(aba.dataset.painel || '')) aba.hidden = !consultar;
  }
  document.querySelectorAll<HTMLElement>('[data-abrir="ocorrencias"], [data-abrir="relatorio"], [data-abrir="visao-geral"]').forEach((e) => { e.hidden = !consultar; });
  q('#entrar-painel').textContent = consultar ? 'Acessar painel' : 'Registrar ocorrência';
  q('#entrar-painel').setAttribute('aria-label', consultar ? 'Acessar painel de ocorrências' : 'Registrar ocorrência da escola');
  q('.abas-lista').classList.toggle('somente-registro', !consultar);
  q('#ambiente').textContent = perfilAtual() === 'ADM' ? 'Administrador' : perfilAtual() === 'RESPONSAVEL' ? 'Responsável · consulta da rede' : 'Escola · registro de ocorrência';
  if (!consultar) {
    acessoADM?.encerrar();
    estado.ocorrencias = null; estado.relatorio = null; estado.indicadores = null;
    q<HTMLDialogElement>('#detalhes-dialog').close();
    q('#detalhes-conteudo').replaceChildren();
    desenharLista(); desenharRelatorio(); desenharIndicadores();
    if (interfacePronta && painelAtivo !== 'registrar' && painelAtivo !== 'whatsapp') ativar('registrar');
  }
  sairAcesso.hidden = !consultar;
  if (consultar) void atualizarDados();
}
const sairAcesso = el('button', 'botao secundario', 'Sair do acesso');
sairAcesso.type = 'button';
sairAcesso.addEventListener('click', () => acessoADM.encerrar());
q('#abrir-acesso-adm').after(sairAcesso);
window.addEventListener('conviva:acesso', ajustarAcesso);
ajustarAcesso();
q('#abrir-acesso-adm').addEventListener('click', () => acessoADM.solicitarAcesso());
q('#aviso-demo').hidden = !modoDemo;
q('#entrada-demo').hidden = !modoDemo;
if (modoDemo) q('#ambiente').textContent = 'Demonstração';
const preferido = lerPreferencia();
if (preferido === 'DIRETOR' || preferido === 'VICE_DIRETOR') {
  const radio = form.querySelector<HTMLInputElement>(`input[name="registrado_por"][value="${preferido}"]`);
  if (radio) radio.checked = true;
}
interfacePronta = true;
sincronizarRota();
void atualizarDados();
