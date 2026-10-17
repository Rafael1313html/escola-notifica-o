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

test('responsável valida link pessoal, consulta a rede e sai sem permissão de editar ou apagar', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('escola-notificacao:demo:ocorrencias', JSON.stringify([1, 2].map((id) => ({
      id, escola: id === 1 ? 'ABEL DOS REIS' : 'AGENOR MEDEIROS PROFESSOR', descricao: `Registro ${id}`,
      gravidade: 'VERMELHO', registrado_por: 'DIRETOR', data_ocorrencia: '2026-01-10', criado_em: '2026-01-10T12:00:00Z', status: 'ABERTA',
    }))));
  });
  await page.route('**/api/acesso', async (route) => {
    expect(route.request().headers().authorization).toBe('Link token-pessoal-teste');
    await route.fulfill({ json: { perfil: 'RESPONSAVEL', escopo: 'REDE', ocorrencia_id: 1 } });
  });
  await page.goto('/#ocorrencias/1?acesso=token-pessoal-teste');
  await expect(page.locator('#detalhes-dialog')).toBeVisible();
  expect(page.url()).not.toContain('acesso=');
  await expect(page.getByRole('button', { name: 'Editar registro', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Apagar registro', exact: true })).toHaveCount(0);
  await expect(page.locator('#aba-whatsapp')).toBeHidden();
  await page.getByRole('button', { name: 'Fechar detalhes' }).click();
  await expect(page.locator('#lista')).toContainText('AGENOR MEDEIROS PROFESSOR');
  await page.getByRole('tab', { name: 'Relatórios' }).click();
  await expect(page.locator('#painel-relatorio')).toBeVisible();
  await page.getByRole('button', { name: 'Sair do acesso' }).click();
  await expect(page.locator('#painel-registrar')).toBeVisible();
  await expect(page.locator('#lista')).not.toContainText('AGENOR MEDEIROS PROFESSOR');
  await expect(page.getByRole('tab', { name: 'Ocorrências' })).toHaveCount(0);
});
