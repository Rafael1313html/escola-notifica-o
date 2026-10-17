import { abrirComoADM } from './helpers/adm';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { hojeISO } from '../src/utils';

test('troca tema por teclado e preserva a escolha entre entrada, painel e recarga', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const entrada = page.locator('#inicio [data-alternar-tema]');
  await expect(entrada).toHaveAttribute('aria-pressed', 'false');
  await entrada.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
  await expect(entrada).toHaveAttribute('aria-pressed', 'true');
  await expect(entrada).toHaveText('Escuro');
  await page.locator('#entrar-painel').click();
  const topo = page.locator('.topo [data-alternar-tema]');
  await expect(topo).toBeVisible();
  await expect(topo).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
  await page.emulateMedia({ colorScheme: 'dark' });
  await topo.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');
  await expect(topo).toHaveText('Claro');
  const tamanho = await topo.boundingBox();
  expect(tamanho!.height).toBeGreaterThanOrEqual(44);
});

test('segue o tema do dispositivo e funciona quando o armazenamento está bloqueado', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (chave, valor) {
      if (chave === 'escola-notificacao:tema') throw new DOMException('Bloqueado', 'SecurityError');
      return original.call(this, chave, valor);
    };
  });
  await abrirComoADM(page, '/#visao-geral');
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');
  await page.locator('.topo [data-alternar-tema]').click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
  await page.locator('#aba-registrar').click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
  expect(erros).toEqual([]);
});

test('tema escuro mantém contraste, formulário, detalhes e layout acessíveis', async ({ page }) => {
  test.setTimeout(60000); // Cinco páginas passam por autenticação e análise de acessibilidade.
  await page.addInitScript((hoje) => {
    localStorage.setItem('escola-notificacao:tema', 'escuro');
    localStorage.setItem('escola-notificacao:demo:ocorrencias', JSON.stringify([{
      id: 1, escola: 'ABEL DOS REIS', data_ocorrencia: hoje, tipo: 'Registro fictício', descricao: 'Descrição fictícia.',
      gravidade: 'VERMELHO', registrado_por: 'DIRETOR', registrado_por_outro: null, status: 'ABERTA',
      criado_em: new Date().toISOString(), anexo: { tipo: 'LINK', url: 'https://example.org/documento' },
    }]));
  }, hojeISO());
  async function verificar(): Promise<void> {
    const resultados = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(resultados.violations.map((v) => ({ id: v.id, elementos: v.nodes.map((n) => ({ alvo: n.target, motivo: n.failureSummary })) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const rota of ['inicio', 'visao-geral', 'registrar', 'ocorrencias', 'relatorio']) {
    await abrirComoADM(page, `/#${rota}`);
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
    if (rota !== 'inicio') await expect(page.locator('#metrica-total')).toHaveText('1');
    if (rota === 'registrar') {
      await page.locator('label[for="g-vermelho"]').click();
      await page.locator('label[for="r-outros"]').click();
      await page.locator('#anexo-tipo').selectOption('LINK');
      await page.locator('#anexo-link').fill('https://example.org/documento');
      await page.locator('#enviar').click();
    }
    await verificar();
    if (rota === 'ocorrencias') {
      await page.locator('#lista tbody button').first().click();
      await verificar();
      await page.keyboard.press('Escape');
    }
  }
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(39, 54, 76)');
});
