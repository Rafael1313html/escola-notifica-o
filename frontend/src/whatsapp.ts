import { modoDemo } from './api';
import type { ResultadoRegistro } from './types';

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
const chaveDemo = 'escola-notificacao:whatsapp-demo';

export function mensagemWhatsApp(resultado: ResultadoRegistro): string {
  if (modoDemo) return ' Demonstração: nenhuma mensagem WhatsApp foi enviada.';
  if (resultado.whatsapp?.status === 'PENDENTE') return ` WhatsApp: ${resultado.whatsapp.total} notificações na fila.`;
  if (resultado.whatsapp?.status === 'SEM_DESTINATARIOS') return ' WhatsApp: nenhum número configurado pelo ADM.';
  return ' WhatsApp: envio automático ainda não ativado.';
}

export function iniciarWhatsApp(): void {
  const form = document.querySelector<HTMLFormElement>('#whatsapp-form')!;
  const acesso = document.querySelector<HTMLFormElement>('#whatsapp-acesso')!;
  const campos = document.querySelector<HTMLElement>('#whatsapp-campos')!;
  const status = document.querySelector<HTMLElement>('#whatsapp-status')!;
  const historico = document.querySelector<HTMLElement>('#whatsapp-historico')!;
  const chave = document.querySelector<HTMLInputElement>('#whatsapp-chave')!;
  const salvar = document.querySelector<HTMLButtonElement>('#whatsapp-salvar')!;
  let credencial = '';
  let carregado = false;

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

  async function pedir(opcoes?: RequestInit): Promise<Configuracao | { salvo: boolean }> {
    const resposta = await fetch('/api/admin/whatsapp', { ...opcoes, cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credencial}` } });
    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok || !corpo) {
      if (resposta.status === 401) bloquear();
      throw new Error(corpo?.erros?.join(' ') || 'Não foi possível acessar a configuração de WhatsApp.');
    }
    return corpo;
  }
  function bloquear(): void {
    credencial = ''; carregado = false; form.hidden = true; acesso.hidden = false;
    chave.value = ''; historico.replaceChildren();
    campos.querySelectorAll('input').forEach((input) => { input.value = ''; });
    document.querySelector<HTMLButtonElement>('#whatsapp-bloquear')!.hidden = true;
    status.textContent = 'Configuração bloqueada.';
  }
  async function carregar(): Promise<void> {
    let config: Configuracao;
    if (modoDemo) {
      const local: Record<string, string> = JSON.parse(localStorage.getItem(chaveDemo) || '{}');
      config = { ativo: false, envios: [], destinatarios: pessoas.map(([id, nome, cargo]) => ({ id, nome, cargo, numero: typeof local[id] === 'string' ? local[id] : '' })) };
    } else config = await pedir() as Configuracao;
    config.destinatarios.forEach((p) => {
      const input = form.elements.namedItem(p.id);
      if (input instanceof HTMLInputElement) input.value = p.numero;
    });
    form.hidden = false; acesso.hidden = true; carregado = true; chave.value = '';
    document.querySelector<HTMLButtonElement>('#whatsapp-bloquear')!.hidden = modoDemo;
    status.textContent = modoDemo ? 'Demonstração: números salvos somente neste navegador. Nenhuma mensagem será enviada.'
      : config.ativo ? 'Integração ativa. Novas ocorrências serão enfileiradas para os números preenchidos.'
        : 'Integração pendente. Os números podem ser salvos; o envio depende da configuração da API no servidor.';
    historico.replaceChildren();
    if (!modoDemo) {
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
  }
  acesso.addEventListener('submit', async (ev) => {
    ev.preventDefault(); credencial = chave.value.trim();
    const botao = acesso.querySelector<HTMLButtonElement>('button')!; botao.disabled = true;
    try { await carregar(); } catch (erro) { credencial = ''; status.textContent = erro instanceof Error ? erro.message : 'Falha de conexão.'; }
    finally { botao.disabled = false; }
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
      if (modoDemo) localStorage.setItem(chaveDemo, JSON.stringify(Object.fromEntries(destinatarios.map((p) => [p.id, p.numero]))));
      else await pedir({ method: 'PUT', body: JSON.stringify({ destinatarios }) });
      await carregar(); status.textContent = `Números salvos. ${status.textContent}`;
    } catch (erro) { status.textContent = erro instanceof Error ? erro.message : 'Não foi possível salvar os números.'; }
    finally { salvar.disabled = false; }
  });
  document.querySelector('#whatsapp-bloquear')!.addEventListener('click', bloquear);
  document.querySelector('#whatsapp-recarregar')!.addEventListener('click', () => {
    void carregar().catch(() => { status.textContent = 'Não foi possível atualizar a configuração.'; });
  });
  if (modoDemo) void carregar().catch(() => { status.textContent = 'Não foi possível ler os números deste navegador.'; });
}
