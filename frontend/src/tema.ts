type Tema = 'claro' | 'escuro';
const chaveTema = 'escola-notificacao:tema';
const preferenciaSistema = window.matchMedia('(prefers-color-scheme: dark)');
const botoes = document.querySelectorAll<HTMLButtonElement>('[data-alternar-tema]');
let escolha: Tema | null = null;
try {
  const salva = localStorage.getItem(chaveTema);
  if (salva === 'claro' || salva === 'escuro') escolha = salva;
} catch { /* A troca de tema continua disponível sem armazenamento. */ }

function aplicarTema(tema: Tema): void {
  const escuro = tema === 'escuro';
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#162d3c' : '#0f7ba6');
  botoes.forEach((botao) => {
    botao.setAttribute('aria-pressed', String(escuro));
    botao.title = escuro ? 'Ativar tema claro' : 'Ativar tema escuro';
    botao.querySelector('[data-tema-rotulo]')!.textContent = escuro ? 'Escuro' : 'Claro';
    botao.querySelector('use')?.setAttribute('href', escuro ? '#i-lua' : '#i-sol');
  });
}

const temaDoSistema = (): Tema => preferenciaSistema.matches ? 'escuro' : 'claro';
aplicarTema(escolha || temaDoSistema());
botoes.forEach((botao) => botao.addEventListener('click', () => {
  escolha = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro';
  aplicarTema(escolha);
  try { localStorage.setItem(chaveTema, escolha); } catch { /* Mantém a escolha enquanto a página estiver aberta. */ }
}));
preferenciaSistema.addEventListener('change', () => { if (!escolha) aplicarTema(temaDoSistema()); });
window.addEventListener('storage', (evento) => {
  if (evento.key !== chaveTema && evento.key !== null) return;
  escolha = evento.newValue === 'claro' || evento.newValue === 'escuro' ? evento.newValue : null;
  aplicarTema(escolha || temaDoSistema());
});

// A paleta visual nunca altera a classificação gravada na ocorrência.
const chaveCores = 'escola-notificacao:cores';
const botoesCores = document.querySelectorAll<HTMLButtonElement>('[data-alternar-cores]');
function aplicarCores(acessiveis: boolean): void {
  document.documentElement.dataset.cores = acessiveis ? 'acessiveis' : 'padrao';
  botoesCores.forEach((botao) => {
    botao.setAttribute('aria-pressed', String(acessiveis));
    botao.title = acessiveis ? 'Restaurar cores padrão' : 'Ativar paleta azul e laranja para daltonismo';
  });
}
let coresSalvas = true;
try { coresSalvas = localStorage.getItem(chaveCores) !== 'padrao'; } catch { /* Funciona sem armazenamento. */ }
aplicarCores(coresSalvas);
botoesCores.forEach((botao) => botao.addEventListener('click', () => {
  const acessiveis = document.documentElement.dataset.cores !== 'acessiveis';
  aplicarCores(acessiveis);
  try { localStorage.setItem(chaveCores, acessiveis ? 'acessiveis' : 'padrao'); } catch { /* Mantém nesta página. */ }
}));
window.addEventListener('storage', (evento) => {
  if (evento.key === chaveCores || evento.key === null) aplicarCores(evento.newValue !== 'padrao');
});
