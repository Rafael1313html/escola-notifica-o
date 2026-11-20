import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('escola somente registra; histórico local e links sem credencial não liberam consultas', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('adm', 'true');
    localStorage.setItem('escola-notificacao:demo:ocorrencias', JSON.stringify([{
      id: 1, escola: 'Outra escola', descricao: 'SEGREDO OUTRA ESCOLA', gravidade: 'VERMELHO',
      registrado_por: 'DIRETOR', data_ocorrencia: '2026-01-10', criado_em: '2026-01-10T12:00:00Z', status: 'ABERTA',
    }]));
  });
  await page.goto('/#ocorrencias/1');
  await expect(page.locator('#painel-registrar')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Ocorrências' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Relatórios' })).toHaveCount(0);
  await expect(page.locator('#lista')).not.toContainText('SEGREDO OUTRA ESCOLA');
  await expect(page.locator('#detalhes-dialog')).not.toBeVisible();
  await page.evaluate(() => { location.hash = '#relatorio'; });
  await expect(page.locator('#painel-registrar')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('link legado não libera consultas; somente ADM abre histórico e relatórios', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('escola-notificacao:demo:ocorrencias', JSON.stringify([1, 2].map((id) => ({
      id, escola: id === 1 ? 'ABEL DOS REIS' : 'AGENOR MEDEIROS PROFESSOR', descricao: `Registro ${id}`,
      gravidade: 'VERMELHO', registrado_por: 'DIRETOR', data_ocorrencia: '2026-01-10', criado_em: '2026-01-10T12:00:00Z', status: 'ABERTA',
    }))));
  });
  await page.goto('/#ocorrencias/1?acesso=token-pessoal-teste');
  await expect(page.locator('#painel-registrar')).toBeVisible();
  expect(page.url()).not.toContain('acesso=');
  await expect(page.getByRole('tab', { name: 'Ocorrências' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Relatórios' })).toHaveCount(0);
  await expect(page.locator('#lista')).not.toContainText('AGENOR MEDEIROS PROFESSOR');
  await expect(page.locator('#detalhes-dialog')).not.toBeVisible();
});
