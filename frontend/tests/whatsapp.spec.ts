import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('seis campos ADM persistem na demonstração sem enviar mensagens', async ({ page }) => {
  const envios: string[] = [];
  page.on('request', (r) => { if (/graph\.facebook|\/api\/admin/.test(r.url())) envios.push(r.url()); });
  await page.goto('/#whatsapp');
  await expect(page.getByRole('heading', { name: 'Canal direto com a diretoria', exact: true })).toBeVisible();
  await expect(page.locator('#whatsapp-campos input')).toHaveCount(6);
  await expect(page.locator('#whatsapp-status')).toContainText('Nenhuma mensagem será enviada');
  await page.getByLabel('Dirigente · Marcela', { exact: true }).fill('+55 (11) 99999-0000');
  await page.getByLabel('Supervisora · Alexandra', { exact: true }).fill('+55 (11) 99999-0001');
  await page.getByRole('button', { name: 'Salvar números' }).click();
  await expect(page.locator('#whatsapp-status')).toContainText('Números salvos');
  await page.reload();
  await expect(page.getByLabel('Dirigente · Marcela', { exact: true })).toHaveValue('5511999990000');
  await expect(page.getByLabel('Supervisora · Susana', { exact: true })).toHaveValue('');
  await page.getByLabel('Supervisora · Susana', { exact: true }).fill('5511999990000');
  await page.getByRole('button', { name: 'Salvar números' }).click();
  await expect(page.locator('#whatsapp-status')).toContainText('número diferente');
  expect(envios).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const acessibilidade = await new AxeBuilder({ page }).analyze();
  expect(acessibilidade.violations).toEqual([]);
  await page.locator('.topo [data-alternar-tema]').click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('arquitetura apresenta o fluxo e os seis responsáveis', async ({ page }) => {
  await page.goto('/mensageria.html');
  await expect(page.getByRole('heading', { name: 'Registrar. Salvar. Avisar a equipe.' })).toBeVisible();
  await expect(page.locator('.fluxo li')).toHaveCount(4);
  await expect(page.locator('.pessoa')).toHaveCount(6);
  await expect(page.getByText('Ativação pendente da conta WhatsApp Business.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('link recebido abre a ocorrência fora dos 200 recentes e informa links inválidos', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('escola-notificacao:demo:ocorrencias', JSON.stringify(Array.from({ length: 201 }, (_, i) => ({
      id: i + 1, escola: 'ABEL DOS REIS', data_ocorrencia: '2024-02-29', tipo: 'Teste fictício',
      descricao: `Descrição completa do registro ${i + 1}`, gravidade: 'AMARELO', registrado_por: 'DIRETOR',
      registrado_por_outro: null, status: 'ABERTA', criado_em: '2024-02-29T12:00:00Z',
    }))));
  });
  await page.goto('/#ocorrencias/1');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#detalhes-titulo')).toHaveText('EN-000001');
  await expect(page.locator('#detalhes-conteudo')).toContainText('Descrição completa do registro 1');
  await page.reload();
  await expect(page.locator('#detalhes-titulo')).toHaveText('EN-000001');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#ocorrencias/99999'; });
  await expect(page.locator('#registro-link-status')).toContainText('Ocorrência não encontrada');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.evaluate(() => { location.hash = '#ocorrencias/abc'; });
  await expect(page.locator('#registro-link-status')).toHaveText('O link da ocorrência é inválido.');
});
