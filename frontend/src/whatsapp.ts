import { modoDemo } from './api';
import type { ResultadoRegistro } from './types';
import { liberarADM, encerrarAcesso, perfilAtual } from './acesso';

interface Destinatario { id: string; nome: string; cargo: string; numero: string }
interface Configuracao {
  ativo: boolean;
  destinatarios: Destinatario[];
  envios: { ocorrencia_id: number; destinatario_id: string; status: string }[];
}
const pessoas = [
  ['marcela', 'Marcela', 'Dirigente'], ['alexandra', 'Alexandra', 'Supervisora'],
  ['susana', 'Susana', 'Supervisora'], ['mercia', 'Mercia', 'PEC · ADM'],
  ['monica', 'Monica', 'PEC'], ['camila', 'Camila', 'CEC'],
];

export function mensagemWhatsApp(resultado: ResultadoRegistro): string {
  if (modoDemo) return ' Demonstração: nenhuma mensagem WhatsApp foi enviada.';
  if (resultado.whatsapp?.status === 'PENDENTE') return ` WhatsApp: ${resultado.whatsapp.total} notificações na fila.`;
  if (resultado.whatsapp?.status === 'SEM_DESTINATARIOS') return ' WhatsApp: nenhum número configurado pelo ADM.';
  return ' WhatsApp: envio automático ainda não ativado.';
}

export function iniciarWhatsApp(aoAutorizar: () => void, aoBloquear: () => void) {
  const form = document.querySelector<HTMLFormElement>('#whatsapp-form')!;
  const acesso = document.querySelector<HTMLFormElement>('#whatsapp-acesso')!;
  const campos = document.querySelector<HTMLElement>('#whatsapp-campos')!;
  const status = document.querySelector<HTMLElement>('#whatsapp-status')!;
  const historico = document.querySelector<HTMLElement>('#whatsapp-historico')!;
  const chave = document.querySelector<HTMLInputElement>('#whatsapp-chave')!;
  const salvar = document.querySelector<HTMLButtonElement>('#whatsapp-salvar')!;
  const dialog = document.querySelector<HTMLDialogElement>('#whatsapp-acesso-dialog')!;
  const statusAcesso = document.querySelector<HTMLElement>('#whatsapp-acesso-status')!;
  let credencial = '';
  let carregado = false;

  function criarCampos(): void {
    if (campos.childElementCount) return;
    for (const [id, nome, cargo] of pessoas) {
      const campo = document.createElement('div'); campo.className = 'campo';
      const label = document.createElement('label'); label.htmlFor = `whatsapp-${id}`;
      label.textContent = `${cargo} · ${nome}`;
      const input = document.createElement('input');
      input.id = label.htmlFor; input.name = id; input.type = 'tel'; input.maxLength = 30;
      input.autocomplete = 'off'; input.placeholder = '+55 (11) 99999-9999';
      input.setAttribute('aria-describedby', 'whatsapp-ajuda');
      campo.append(label, input); campos.append(campo);
    }
  }

  async function pedir(opcoes?: RequestInit): Promise<Configuracao | { salvo: boolean }> {
    const chavePedido = credencial;
    if (!chavePedido) throw new Error('Entre com a senha ADM para acessar a configuração.');
    const resposta = await fetch('/api/admin/whatsapp', { ...opcoes, cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chavePedido}` } });
    if (credencial !== chavePedido) throw new Error('A sessão ADM foi encerrada.');
    const corpo = await resposta.json().catch(() => null);
    if (credencial !== chavePedido) throw new Error('A sessão ADM foi encerrada.');
    if (!resposta.ok || !corpo) {
      if (resposta.status === 401 || resposta.status === 403) bloquear();
      throw new Error(corpo?.erros?.join(' ') || 'Não foi possível acessar a configuração de WhatsApp.');
    }
    return corpo;
  }
  function bloquear(): void {
    const estavaAutorizado = carregado;
    credencial = ''; carregado = false; form.hidden = true;
    if (perfilAtual() !== 'ESCOLA') encerrarAcesso();
    chave.value = ''; historico.replaceChildren();
    campos.replaceChildren();
    document.querySelector<HTMLButtonElement>('#whatsapp-bloquear')!.hidden = true;
    status.textContent = 'Configuração bloqueada.';
    if (estavaAutorizado) aoBloquear();
  }
  async function carregar(): Promise<void> {
    const config = await pedir() as Configuracao;
    const primeiroAcesso = !carregado;
    criarCampos();
    config.destinatarios.forEach((p) => {
      const input = form.elements.namedItem(p.id);
      if (input instanceof HTMLInputElement) input.value = p.numero;
    });
    form.hidden = false; carregado = true; chave.value = '';
    if (primeiroAcesso) liberarADM(credencial);
    document.querySelector<HTMLButtonElement>('#whatsapp-bloquear')!.hidden = false;
    status.textContent = config.ativo ? 'Integração ativa. Novas ocorrências serão enfileiradas para os números preenchidos.'
        : 'Integração pendente. Os números podem ser salvos; o envio depende da configuração da API no servidor.';
    historico.replaceChildren();
    {
      const titulo = document.createElement('h3'); titulo.textContent = 'Últimas notificações'; historico.append(titulo);
      const legenda = document.createElement('p'); legenda.className = 'ajuda';
      legenda.textContent = 'Aceito significa recebido pela API da Meta. A entrega no aparelho ainda não é confirmada.'; historico.append(legenda);
      const nomes: Record<string, string> = { PENDENTE: 'Na fila', PROCESSANDO: 'Enviando', ACEITO: 'Aceito pela Meta', FALHOU: 'Falha no envio', INCERTO: 'Resultado incerto; verificar na Meta' };
      for (const envio of config.envios) {
        const linha = document.createElement('p');
        linha.textContent = `Registro #${envio.ocorrencia_id} · ${pessoas.find(([id]) => id === envio.destinatario_id)?.[1] || 'Destinatário'} · ${nomes[envio.status] || envio.status}`;
        historico.append(linha);
      }
      if (!config.envios.length) historico.append(document.createTextNode('Nenhuma notificação registrada.'));
    }
    dialog.close();
    if (primeiroAcesso) aoAutorizar();
  }
  acesso.addEventListener('submit', async (ev) => {
    ev.preventDefault(); credencial = chave.value.trim();
    const botao = acesso.querySelector<HTMLButtonElement>('button')!; botao.disabled = true;
    statusAcesso.textContent = 'Validando acesso ADM…';
    try { await carregar(); } catch (erro) { bloquear(); statusAcesso.textContent = erro instanceof Error ? erro.message : 'Falha de conexão.'; }
    finally { botao.disabled = false; chave.value = ''; }
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); if (!carregado) return;
    const destinatarios = pessoas.map(([id]) => ({ id, numero: (form.elements.namedItem(id) as HTMLInputElement).value.trim() }));
    for (const item of destinatarios) {
      const numero = item.numero.replace(/\D/g, '');
      if (/[^\d+()\s-]/.test(item.numero) || (numero && !/^[1-9]\d{7,14}$/.test(numero))) {
        status.textContent = 'Informe números com DDI e DDD, ou deixe o campo vazio para desativar.';
        (form.elements.namedItem(item.id) as HTMLInputElement).focus(); return;
      }
      item.numero = numero;
    }
    const preenchidos = destinatarios.map((p) => p.numero).filter(Boolean);
    if (new Set(preenchidos).size !== preenchidos.length) { status.textContent = 'Use um número diferente para cada destinatário.'; return; }
    salvar.disabled = true;
    try {
      await pedir({ method: 'PUT', body: JSON.stringify({ destinatarios }) });
      await carregar(); status.textContent = `Números salvos. ${status.textContent}`;
    } catch (erro) { status.textContent = erro instanceof Error ? erro.message : 'Não foi possível salvar os números.'; }
    finally { salvar.disabled = false; }
  });
  document.querySelector('#whatsapp-bloquear')!.addEventListener('click', bloquear);
  document.querySelector('#whatsapp-recarregar')!.addEventListener('click', () => {
    void carregar().catch(() => { status.textContent = 'Não foi possível atualizar a configuração.'; });
  });
  dialog.addEventListener('close', () => { chave.value = ''; if (!carregado) credencial = ''; });
  return {
    encerrar: bloquear,
    autenticado: () => carregado,
    solicitarAcesso: () => {
      if (carregado) { aoAutorizar(); return; }
      statusAcesso.textContent = 'Área exclusiva do ADM. Informe sua senha para continuar.';
      if (!dialog.open) dialog.showModal();
      chave.focus();
    },
  };
}
