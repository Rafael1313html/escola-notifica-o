import { expect, type Page } from '@playwright/test';

// Os testes de interface validam os painéis usando uma autenticação HTTP simulada.
// Os testes do Worker e da API verificam a autorização real, sem este mock.
export async function entrarADM(page: Page, destino = '#visao-geral'): Promise<void> {
  if (await page.locator('#whatsapp-form').evaluate((form) => !(form as HTMLElement).hidden)) {
    await page.evaluate((hash) => { location.hash = hash; }, destino);
    return;
  }
  await page.route('**/api/admin/whatsapp', (route) => route.fulfill({ json: {
    ativo: false, envios: [], destinatarios: [],
  } }));
  if (!await page.locator('.aplicacao').isVisible()) await page.evaluate(() => { location.hash = '#registrar'; });
  if (!await page.locator('#whatsapp-acesso-dialog').isVisible()) await page.locator('#abrir-acesso-adm').click();
  await page.locator('#whatsapp-chave').fill('senha-adm-isolada-dos-testes');
  await page.locator('#whatsapp-acesso button').click();
  await expect(page.locator('#whatsapp-form')).toBeVisible();
  await page.evaluate((hash) => { location.hash = hash; }, destino);
}

export async function abrirComoADM(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await entrarADM(page, url.includes('#') ? url.slice(url.indexOf('#')) : '#visao-geral');
}
