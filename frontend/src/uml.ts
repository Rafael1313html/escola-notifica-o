import './uml.css';
import './tema.css';
import './tema';
import diagrama from './uml-diagrama.svg?raw';
import sequencia from './uml-sequencia.svg?raw';
import casos from './uml-casos.svg?raw';
import apresentacaoPDF from '../../docs/classes-uml.pdf?url';

interface ClasseUML { tipo: string; descricao: string; atributos: [string, string][]; regras: string[]; }
const classes: Record<string, ClasseUML> = {
  Escola: {
    tipo: 'Entidade', descricao: 'Unidade escolar identificada pelo cadastro da rede.',
    atributos: [['id', 'Inteiro · chave primária'], ['nome', 'Texto de até 150 caracteres · único']],
    regras: ['Uma escola pode ter zero ou várias ocorrências.', 'Cada ocorrência deve indicar uma escola cadastrada.', 'Tabela: escolas.'],
  },
  Ocorrencia: {
    tipo: 'Entidade', descricao: 'Registro dos fatos, da classificação e do responsável pelo preenchimento.',
    atributos: [['id', 'Inteiro · chave primária · protocolo EN-000001'], ['escola_id', 'Inteiro · referência à escola'], ['data_ocorrencia', 'Data válida, igual ou anterior a hoje'], ['tipo', 'Texto opcional de até 100 caracteres'], ['descricao', 'Texto opcional de até 5.000 caracteres'], ['gravidade', 'Enumeração Gravidade'], ['registrado_por', 'Enumeração Registrante'], ['registrado_por_outro', 'Nome ou cargo opcional · até 100 caracteres'], ['status', 'Texto de até 30 caracteres · padrão ABERTA'], ['criado_em', 'Data e hora geradas pelo banco']],
    regras: ['Pertence a exatamente uma escola.', 'Pode ter zero ou um anexo e gerar até seis avisos WhatsApp.', 'OUTROS exige nome ou cargo; os demais responsáveis mantêm esse campo vazio.', 'Ocorrência, anexo e fila de avisos são gravados na mesma transação.', 'O link recebido abre o registro pelo ID, inclusive fora dos 200 recentes.', 'Tabela: ocorrencias.'],
  },
  Anexo: {
    tipo: 'Entidade', descricao: 'Documento opcional vinculado a uma ocorrência. Guarda um PDF ou um endereço de documento.',
    atributos: [['ocorrencia_id', 'Inteiro · chave primária e referência à ocorrência'], ['tipo', 'Enumeração TipoAnexo'], ['nome', 'Nome do PDF · até 180 caracteres · opcional'], ['url', 'Link HTTP/HTTPS · até 2.048 caracteres · opcional'], ['tamanho', 'Quantidade de bytes do PDF · opcional'], ['arquivo', 'Conteúdo binário do PDF · partes no D1 ou MEDIUMBLOB no MySQL · opcional']],
    regras: ['PDF: nome, tamanho e arquivo preenchidos; URL vazia.', 'LINK: URL preenchida; nome, tamanho e arquivo vazios.', 'PDF de até 5 MB, com extensão e assinatura do formato validadas.', 'Links não podem conter credenciais; o sistema guarda o endereço sem copiar o arquivo.', 'Excluir a ocorrência remove o anexo no banco por ON DELETE CASCADE.', 'A composição representa essa dependência de existência.', 'Tabela: ocorrencia_anexos. Na demonstração, PDFs ficam no IndexedDB.'],
  },
  Registrante: {
    tipo: 'Enumeração', descricao: 'Função de quem preencheu o registro; não representa uma conta autenticada.',
    atributos: [['DIRETOR', 'Diretor'], ['VICE_DIRETOR', 'Vice-diretor'], ['OUTROS', 'Outra função, com nome ou cargo obrigatório']],
    regras: ['Uma única opção por ocorrência.', 'A escola somente cadastra. O ADM e os seis responsáveis com links pessoais válidos consultam toda a rede. Somente o ADM altera ou exclui registros.'],
  },
  Gravidade: {
    tipo: 'Enumeração', descricao: 'Classificação usada nos indicadores, filtros e relatórios da rede.',
    atributos: [['AMARELO', 'Atenção e monitoramento'], ['VERMELHO', 'Acompanhamento prioritário']],
    regras: ['Uma única classificação por ocorrência.', 'A equipe deve seguir os protocolos da rede de ensino.'],
  },
  TipoAnexo: {
    tipo: 'Enumeração de domínio', descricao: 'Alternativas aceitas no documento de apoio de uma ocorrência.',
    atributos: [['PDF', 'Arquivo armazenado no D1, no MySQL ou no navegador da demonstração'], ['LINK', 'Endereço HTTP/HTTPS de um documento externo']],
    regras: ['Um anexo escolhe apenas uma alternativa.', 'Representa a união de tipos TypeScript e as restrições CHECK do banco.'],
  },
  DestinatarioWhatsApp: {
    tipo: 'Configuração de mensageria', descricao: 'Um dos seis responsáveis que podem receber o link da ocorrência no WhatsApp pessoal.',
    atributos: [['id', 'Identificador fixo · chave primária'], ['numero', 'DDI, DDD e telefone · até 15 dígitos'], ['acesso_versao', 'Inteiro · muda ao trocar ou remover número; revoga links anteriores'], ['/ nome', 'Derivado do cadastro fixo da aplicação'], ['/ cargo', 'Derivado do cadastro fixo da aplicação']],
    regras: ['Marcela: dirigente. Alexandra e Susana: supervisoras. Mercia: PEC / ADM. Monica: PEC. Camila: CEC.', 'O ADM altera os seis números usando uma senha de acesso.', 'Campo vazio desativa o destinatário; números repetidos são recusados.', 'Pode receber avisos de várias ocorrências.', 'Tabela: whatsapp_destinatarios.'],
  },
  AvisoWhatsApp: {
    tipo: 'Entidade da fila', descricao: 'Aviso individual persistido após o cadastro e enviado pela API da Meta.',
    atributos: [['id', 'Inteiro longo · chave primária'], ['ocorrencia_id', 'Referência à ocorrência'], ['destinatario_id', 'Referência ao responsável'], ['numero', 'Cópia do telefone no momento do registro'], ['acesso_versao', 'Versão do cadastro quando o aviso foi criado'], ['status', 'Enumeração StatusEnvioWhatsApp'], ['mensagem_id', 'ID retornado pela Meta · opcional'], ['atualizado_em', 'Data e hora da última atualização']],
    regras: ['Um aviso por ocorrência e destinatário; a combinação é única no banco.', 'Protocolo, escola, data, classificação e link direto seguem no modelo aprovado.', 'Descrição e documentos ficam no sistema.', 'A fila é processada após a gravação, sem esperar pela Meta durante o cadastro.', 'Somente envio: sem respostas, webhook de mensagens ou chat interno.', 'Tabela: whatsapp_envios.'],
  },
  StatusEnvioWhatsApp: {
    tipo: 'Enumeração de mensageria', descricao: 'Situação da tentativa de envio; não representa confirmação de entrega no aparelho.',
    atributos: [['PENDENTE', 'Aviso na fila'], ['PROCESSANDO', 'Tentativa em curso'], ['ACEITO', 'A Meta retornou um ID de mensagem'], ['FALHOU', 'A API recusou o envio'], ['INCERTO', 'Timeout ou resultado desconhecido']],
    regras: ['O painel ADM mostra os 30 avisos mais recentes.', 'Falhas e resultados incertos não são reenviados automaticamente.', 'O envio real depende da conta Meta, do modelo aprovado e do endereço público configurado.'],
  },
};

function q<T extends HTMLElement>(seletor: string): T { return document.querySelector<T>(seletor)!; }
const mapa = q<HTMLDivElement>('#uml-mapa');
const status = q<HTMLParagraphElement>('#uml-status');
mapa.innerHTML = diagrama;
q<HTMLAnchorElement>('#uml-pdf').href = apresentacaoPDF;
q('#uml-sequencia-mapa').innerHTML = sequencia;
q('#uml-casos-mapa').innerHTML = casos;
const imagem = mapa.querySelector<SVGSVGElement>('svg')!;
function elemento(tag: string, texto: string): HTMLElement {
  const item = document.createElement(tag); item.textContent = texto; return item;
}
function selecionar(nome: string, anunciar = true): void {
  const classe = classes[nome];
  if (!classe) return;
  if (anunciar) apresentar(false);
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

function apresentar(ativo: boolean): void {
  document.body.classList.toggle('uml-apresentando', ativo);
  q<HTMLButtonElement>('#uml-apresentar').textContent = ativo ? 'Ver atributos e regras' : 'Modo apresentação';
  q('#uml-apresentar').setAttribute('aria-pressed', String(ativo));
}
q('#uml-apresentar').addEventListener('click', () => apresentar(!document.body.classList.contains('uml-apresentando')));
apresentar(true);
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
    const canvas = document.createElement('canvas'); canvas.width = 3600; canvas.height = 2200;
    const contexto = canvas.getContext('2d'); if (!contexto) throw new Error();
    contexto.drawImage(figura, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error()), 'image/png'));
    baixar(png, 'conviva-classes-uml.png'); status.textContent = 'Imagem PNG gerada para download.';
  } catch { status.textContent = 'Não foi possível gerar o PNG. Baixe o SVG ou use Imprimir / PDF.'; }
  finally { URL.revokeObjectURL(url); botao.disabled = false; }
});
