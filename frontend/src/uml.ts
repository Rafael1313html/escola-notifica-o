import './uml.css';
import './tema.css';
import './tema';
import diagrama from './uml-diagrama.svg?raw';

interface ClasseUML { tipo: string; descricao: string; atributos: [string, string][]; regras: string[]; }
const classes: Record<string, ClasseUML> = {
  Escola: {
    tipo: 'Entidade', descricao: 'Unidade escolar identificada pelo cadastro da rede.',
    atributos: [['id', 'Inteiro · chave primária'], ['nome', 'Texto de até 150 caracteres · único']],
    regras: ['Uma escola pode ter zero ou várias ocorrências.', 'Cada ocorrência deve indicar uma escola cadastrada.', 'Tabela MySQL: escolas.'],
  },
  Ocorrencia: {
    tipo: 'Entidade', descricao: 'Registro dos fatos, da classificação e do responsável pelo preenchimento.',
    atributos: [['id', 'Inteiro · chave primária · protocolo EN-000001'], ['escola_id', 'Inteiro · referência à escola'], ['data_ocorrencia', 'Data válida, igual ou anterior a hoje'], ['tipo', 'Texto opcional de até 100 caracteres'], ['descricao', 'Texto opcional de até 5.000 caracteres'], ['gravidade', 'Enumeração Gravidade'], ['registrado_por', 'Enumeração Registrante'], ['registrado_por_outro', 'Nome ou cargo opcional · até 100 caracteres'], ['status', 'Texto de até 30 caracteres · padrão ABERTA'], ['criado_em', 'Data e hora geradas pelo banco']],
    regras: ['Pertence a exatamente uma escola.', 'Pode ter zero ou um anexo.', 'OUTROS exige nome ou cargo; os demais responsáveis mantêm esse campo vazio.', 'Ocorrência e anexo são gravados na mesma transação.', 'O resumo exibido no painel tem até 300 caracteres.', 'Tabela MySQL: ocorrencias.'],
  },
  Anexo: {
    tipo: 'Entidade', descricao: 'Documento opcional vinculado a uma ocorrência. Guarda um PDF ou um endereço de documento.',
    atributos: [['ocorrencia_id', 'Inteiro · chave primária e referência à ocorrência'], ['tipo', 'Enumeração TipoAnexo'], ['nome', 'Nome do PDF · até 180 caracteres · opcional'], ['url', 'Link HTTP/HTTPS · até 2.048 caracteres · opcional'], ['tamanho', 'Quantidade de bytes do PDF · opcional'], ['arquivo', 'Conteúdo binário do PDF · MEDIUMBLOB · opcional']],
    regras: ['PDF: nome, tamanho e arquivo preenchidos; URL vazia.', 'LINK: URL preenchida; nome, tamanho e arquivo vazios.', 'PDF de até 5 MB, com extensão e assinatura do formato validadas.', 'Links não podem conter credenciais; o sistema guarda o endereço sem copiar o arquivo.', 'Excluir a ocorrência remove o anexo no banco por ON DELETE CASCADE.', 'A composição representa essa dependência de existência.', 'Tabela MySQL: ocorrencia_anexos. Na demonstração, PDFs ficam no IndexedDB.'],
  },
  Registrante: {
    tipo: 'Enumeração', descricao: 'Função de quem preencheu o registro; não representa uma conta autenticada.',
    atributos: [['DIRETOR', 'Diretor'], ['VICE_DIRETOR', 'Vice-diretor'], ['OUTROS', 'Outra função, com nome ou cargo obrigatório']],
    regras: ['Uma única opção por ocorrência.', 'O sistema atual não possui login nem permissões de administrador.'],
  },
  Gravidade: {
    tipo: 'Enumeração', descricao: 'Classificação usada nos indicadores, filtros e relatórios da rede.',
    atributos: [['AMARELO', 'Atenção e monitoramento'], ['VERMELHO', 'Acompanhamento prioritário']],
    regras: ['Uma única classificação por ocorrência.', 'A equipe deve seguir os protocolos da rede de ensino.'],
  },
  TipoAnexo: {
    tipo: 'Enumeração de domínio', descricao: 'Alternativas aceitas no documento de apoio de uma ocorrência.',
    atributos: [['PDF', 'Arquivo armazenado no MySQL ou no navegador da demonstração'], ['LINK', 'Endereço HTTP/HTTPS de um documento externo']],
    regras: ['Um anexo escolhe apenas uma alternativa.', 'Representa a união de tipos TypeScript e as restrições CHECK do banco.'],
  },
};

function q<T extends HTMLElement>(seletor: string): T { return document.querySelector<T>(seletor)!; }
const mapa = q<HTMLDivElement>('#uml-mapa');
const status = q<HTMLParagraphElement>('#uml-status');
mapa.innerHTML = diagrama;
const imagem = mapa.querySelector<SVGSVGElement>('svg')!;
function elemento(tag: string, texto: string): HTMLElement {
  const item = document.createElement(tag); item.textContent = texto; return item;
}
function selecionar(nome: string, anunciar = true): void {
  const classe = classes[nome];
  if (!classe) return;
  q('#uml-classe-nome').textContent = nome;
  q('#uml-classe-tipo').textContent = classe.tipo.toLocaleUpperCase('pt-BR');
  q('#uml-classe-descricao').textContent = classe.descricao;
  q('#uml-atributos').replaceChildren(...classe.atributos.map(([campo, tipo]) => {
    const item = document.createElement('div'); item.append(elemento('dt', campo), elemento('dd', tipo)); return item;
  }));
  q('#uml-regras').replaceChildren(...classe.regras.map((regra) => elemento('li', regra)));
  document.querySelectorAll<HTMLButtonElement>('[data-selecionar]').forEach((botao) => botao.setAttribute('aria-pressed', String(botao.dataset.selecionar === nome)));
  imagem.querySelectorAll<SVGGElement>('[data-classe]').forEach((grupo) => grupo.classList.toggle('selecionada', grupo.dataset.classe === nome));
  if (anunciar) status.textContent = `Classe ${nome} selecionada. Os atributos e regras foram atualizados.`;
}
document.querySelectorAll<HTMLButtonElement>('[data-selecionar]').forEach((botao) => botao.addEventListener('click', () => selecionar(botao.dataset.selecionar!)));
imagem.querySelectorAll<SVGGElement>('[data-classe]').forEach((grupo) => grupo.addEventListener('click', () => selecionar(grupo.dataset.classe!)));
selecionar('Escola', false);

let zoom = 1;
function mudarZoom(valor: number): void {
  const anterior = zoom;
  zoom = Math.max(.6, Math.min(4, Math.round(valor * 10) / 10));
  const centroX = mapa.scrollLeft + mapa.clientWidth / 2;
  const centroY = mapa.scrollTop + mapa.clientHeight / 2;
  imagem.style.width = `${zoom * 100}%`;
  mapa.scrollLeft = centroX * zoom / anterior - mapa.clientWidth / 2;
  mapa.scrollTop = centroY * zoom / anterior - mapa.clientHeight / 2;
  q('#uml-zoom').textContent = `${Math.round(zoom * 100)}%`;
  q<HTMLButtonElement>('#uml-menos').disabled = zoom <= .6;
  q<HTMLButtonElement>('#uml-mais').disabled = zoom >= 4;
}
q('#uml-menos').addEventListener('click', () => mudarZoom(zoom - .2));
q('#uml-mais').addEventListener('click', () => mudarZoom(zoom + .2));
q('#uml-ajustar').addEventListener('click', () => { mudarZoom(1); mapa.scrollTo(0, 0); });
mapa.addEventListener('keydown', (evento) => {
  if (!['+', '=', '-', '0'].includes(evento.key)) return;
  evento.preventDefault();
  mudarZoom(evento.key === '0' ? 1 : zoom + (evento.key === '-' ? -.2 : .2));
});
let arrasto: { x: number; y: number; esquerda: number; topo: number } | null = null;
mapa.addEventListener('pointerdown', (evento) => {
  if (evento.pointerType !== 'mouse' || evento.button !== 0 || (evento.target as Element).closest('[data-classe]')) return;
  arrasto = { x: evento.clientX, y: evento.clientY, esquerda: mapa.scrollLeft, topo: mapa.scrollTop };
  mapa.setPointerCapture(evento.pointerId); mapa.classList.add('arrastando');
});
mapa.addEventListener('pointermove', (evento) => {
  if (!arrasto) return;
  mapa.scrollLeft = arrasto.esquerda - (evento.clientX - arrasto.x);
  mapa.scrollTop = arrasto.topo - (evento.clientY - arrasto.y);
});
for (const evento of ['pointerup', 'pointercancel', 'lostpointercapture']) mapa.addEventListener(evento, () => { arrasto = null; mapa.classList.remove('arrastando'); });
q('#uml-tela-cheia').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await q('.uml-visualizador').requestFullscreen();
  } catch { status.textContent = 'Tela cheia indisponível neste navegador. Use o zoom do diagrama.'; }
});
document.addEventListener('fullscreenchange', () => { q('#uml-tela-cheia').textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia'; });
q('#uml-imprimir').addEventListener('click', () => window.print());

function baixar(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = nome;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
q('#uml-svg').addEventListener('click', () => baixar(new Blob([diagrama], { type: 'image/svg+xml;charset=utf-8' }), 'conviva-classes-uml.svg'));
q('#uml-png').addEventListener('click', async () => {
  const botao = q<HTMLButtonElement>('#uml-png'); botao.disabled = true;
  const url = URL.createObjectURL(new Blob([diagrama], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const figura = new Image(); figura.src = url; await figura.decode();
    const canvas = document.createElement('canvas'); canvas.width = 2800; canvas.height = 1800;
    const contexto = canvas.getContext('2d'); if (!contexto) throw new Error();
    contexto.drawImage(figura, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error()), 'image/png'));
    baixar(png, 'conviva-classes-uml.png'); status.textContent = 'Imagem PNG gerada para download.';
  } catch { status.textContent = 'Não foi possível gerar o PNG. Baixe o SVG ou use Imprimir / PDF.'; }
  finally { URL.revokeObjectURL(url); botao.disabled = false; }
});
