import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('UML permite selecionar classes, usar zoom e exportar SVG e PNG', async ({ page }) => {
  await page.goto('/uml.html');
  await expect(page.getByRole('heading', { name: 'Classes do sistema' })).toBeVisible();
  await expect(page.locator('#uml-classe-nome')).toHaveText('Escola');
  await page.locator('[data-selecionar="Anexo"]').click();
  await expect(page.locator('#uml-classe-nome')).toHaveText('Anexo');
  await expect(page.locator('#uml-regras')).toContainText('ON DELETE CASCADE');
  await page.locator('[data-selecionar="Gravidade"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#uml-classe-nome')).toHaveText('Gravidade');
  await page.locator('#uml-mapa [data-classe="Ocorrencia"]').click();
  await expect(page.locator('#uml-classe-nome')).toHaveText('Ocorrencia');
  await expect(page.locator('#uml-atributos')).toContainText('5.000 caracteres');
  await page.getByRole('button', { name: 'Aumentar zoom' }).click();
  await expect(page.locator('#uml-zoom')).toHaveText('120%');
  await page.locator('#uml-mapa').focus();
  await page.keyboard.press('+');
  await expect(page.locator('#uml-zoom')).toHaveText('140%');
  await page.keyboard.press('0');
  await expect(page.locator('#uml-zoom')).toHaveText('100%');
  for (const [botao, nome, assinatura] of [
    ['Baixar SVG', 'conviva-classes-uml.svg', '<svg'],
    ['Baixar PNG', 'conviva-classes-uml.png', 'PNG'],
  ]) {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: botao }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(nome);
    const stream = await download.createReadStream(); const partes: Buffer[] = [];
    for await (const parte of stream!) partes.push(Buffer.from(parte));
    expect(Buffer.concat(partes).toString().slice(0, 15)).toContain(assinatura);
  }
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#uml-mapa')).toHaveCSS('overflow', 'visible');
  await expect(page.locator('.uml-exportar')).not.toBeVisible();
});

test('UML é acessível em temas claro e escuro sem transbordar no celular', async ({ page }) => {
  await page.goto('/uml.html');
  await expect(page.locator('#uml-atributos')).toContainText('chave primária');
  for (const tema of ['claro', 'escuro']) {
    if (await page.locator('html').getAttribute('data-tema') !== tema) await page.locator('[data-alternar-tema]').click();
    await expect(page.locator('html')).toHaveAttribute('data-tema', tema);
    const resultados = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(resultados.violations.map((v) => ({ id: v.id, elementos: v.nodes.map((n) => ({ alvo: n.target, motivo: n.failureSummary })) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('relatórios encaminham métricas ao Cloudflare autenticado sem expor contadores locais como globais', async ({ page }) => {
  await page.goto('/#relatorio');
  await expect(page.locator('#acessos-cloudflare')).toHaveAttribute('href', 'https://dash.cloudflare.com/4f629e0de9a41d35b1e4d2bbb042738e/web-analytics');
  await expect(page.locator('#acessos-cloudflare')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.acessos-bloco')).toContainText('consulta privada');
  await expect(page.locator('.acessos-bloco')).toContainText('Web Analytics habilitado');
});
