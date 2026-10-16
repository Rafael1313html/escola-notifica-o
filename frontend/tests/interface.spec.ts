import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { hojeISO, gerarCSV } from '../src/utils';

test('entrada exibe a logo, abre orientações e permite acessar o painel', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Gestão de ocorrências escolares' })).toBeVisible();
  const logo = page.locator('.entrada-logo');
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Orientações para o registro' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Entendi' }).click();
  await page.getByRole('button', { name: 'Acessar painel de ocorrências' }).click();
  await expect(page.locator('#metrica-total')).toHaveText('0');
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
  expect(erros).toEqual([]);
});

test('valida formulário, registra, atualiza indicadores e preserva dados no navegador', async ({ page }) => {
  await page.goto('/#registrar');
  await expect(page.locator('#enviar')).toBeEnabled();
  await page.locator('#enviar').click();
  await expect(page.locator('#erro-escola')).toContainText('Escolha a escola');
  await expect(page.locator('#escola')).toBeFocused();
  await page.locator('#escola').fill('ABEL DOS REIS');
  await page.locator('#data').fill('2999-01-01');
  await page.locator('#enviar').click();
  await expect(page.locator('#erro-data')).toContainText('igual ou anterior a hoje');
  await page.locator('#data').fill(hojeISO());
  await page.locator('label[for="g-vermelho"]').click();
  await page.locator('label[for="r-outros"]').click();
  await page.locator('#enviar').click();
  await expect(page.locator('#erro-outro')).toContainText('nome ou cargo');
  await page.locator('#outro').fill('Equipe de demonstração');
  await page.locator('#tipo').fill('Ameaça');
  await page.locator('#descricao').fill('<img src=x onerror=alert(1)> Descrição fictícia.');
  await page.locator('#enviar').click();
  await expect(page.locator('#aviso')).toContainText('EN-000001 registrada com sucesso');
  await expect(page.locator('#escola')).toHaveValue('');
  await page.getByRole('tab', { name: 'Visão geral' }).click();
  await expect(page.locator('#metrica-total')).toHaveText('1');
  await expect(page.locator('#metrica-vermelhas')).toHaveText('1');
  await page.getByRole('tab', { name: 'Ocorrências' }).click();
  await page.getByRole('button', { name: 'Ver detalhes do registro EN-000001' }).click();
  await expect(page.getByRole('dialog')).toContainText('<img src=x onerror=alert(1)> Descrição fictícia.');
  await expect(page.locator('#detalhes-conteudo img')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.locator('#lista')).toContainText('EN-000001');
  await page.getByRole('tab', { name: 'Relatórios' }).click();
  await expect(page.locator('#resumo')).toHaveText('1 ocorrência vermelha em 1 escola.');
});

test('filtra, pagina e exporta os registros selecionados', async ({ page }) => {
  await page.addInitScript((hoje) => {
    localStorage.setItem('escola-notificacao:demo:ocorrencias', JSON.stringify(Array.from({ length: 13 }, (_, i) => ({
      id: i + 1, escola: i % 2 ? 'ABEL DOS REIS' : 'ALBERTO SANTOS DUMONT', data_ocorrencia: hoje,
      tipo: 'Registro fictício', descricao: '=1+1', gravidade: i % 2 ? 'AMARELO' : 'VERMELHO',
      registrado_por: 'DIRETOR', registrado_por_outro: null, status: 'ABERTA', criado_em: new Date().toISOString(),
    }))));
  }, hojeISO());
  await page.goto('/#ocorrencias');
  await expect(page.locator('#lista tbody tr')).toHaveCount(10);
  await page.getByRole('button', { name: 'Próxima página' }).click();
  await expect(page.locator('#lista tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: 'Vermelhas', exact: true }).click();
  await expect(page.locator('#lista tbody tr')).toHaveCount(7);
  await expect(page.locator('#pagina-anterior')).toBeDisabled();
  await page.locator('#busca').fill('EN-000013');
  await expect(page.locator('#lista tbody tr')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ocorrencias-\d{4}-\d{2}-\d{2}\.csv$/);
  const stream = await download.createReadStream();
  const partes: Buffer[] = [];
  for await (const parte of stream!) partes.push(Buffer.from(parte));
  const csv = Buffer.concat(partes).toString('utf8');
  expect(csv).toContain('EN-000013');
  expect(csv).not.toContain('EN-000012');
  expect(csv).toContain("'=1+1");
  await page.locator('#busca').fill('escola inexistente');
  await expect(page.locator('#lista')).toContainText('Nenhuma ocorrência encontrada');
  await page.locator('#limpar-filtros').click();
  await expect(page.locator('#lista tbody tr')).toHaveCount(10);
});

test('datas e escola filtram os registros sem alterar os indicadores globais', async ({ page }) => {
  await page.addInitScript((hoje) => {
    localStorage.setItem('escola-notificacao:demo:ocorrencias', JSON.stringify([
      { id: 1, escola: 'ABEL DOS REIS', data_ocorrencia: hoje, gravidade: 'AMARELO', registrado_por: 'DIRETOR', tipo: null, descricao: null, status: 'ABERTA' },
      { id: 2, escola: 'ALBERTO SANTOS DUMONT', data_ocorrencia: '2020-01-01', gravidade: 'VERMELHO', registrado_por: 'DIRETOR', tipo: null, descricao: null, status: 'ABERTA' },
    ]));
  }, hojeISO());
  await page.goto('/#ocorrencias');
  await expect(page.locator('#lista tbody tr')).toHaveCount(2);
  await page.locator('#filtro-periodo').selectOption('7');
  await expect(page.locator('#lista tbody tr')).toHaveCount(1);
  await page.locator('#filtro-escola').selectOption('ALBERTO SANTOS DUMONT');
  await expect(page.locator('#lista')).toContainText('Nenhuma ocorrência encontrada');
  await page.getByRole('tab', { name: 'Visão geral' }).click();
  await expect(page.locator('#metrica-total')).toHaveText('2');
});

test('navegação por teclado, layout responsivo e estados vazios acessíveis', async ({ page }) => {
  await page.goto('/#visao-geral');
  await expect(page.locator('#metrica-total')).toHaveText('0');
  await page.getByRole('tab', { name: 'Visão geral' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Ocorrências' })).toBeFocused();
  await expect(page.locator('#painel-ocorrencias')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Novo registro' })).toBeFocused();
  for (const rota of ['inicio', 'visao-geral', 'ocorrencias', 'registrar', 'relatorio']) {
    await page.goto(`/#${rota}`);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const resultados = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(resultados.violations.map((v) => ({ id: v.id, descricao: v.description, elementos: v.nodes.map((n) => n.target) }))).toEqual([]);
  }
});

test('gera CSV compatível com planilhas e protege células com fórmulas', () => {
  const csv = gerarCSV([['=1+1', '+SUM(A1)', '-2', '@teste', ' \t=1', 'Texto "entre aspas"', 'ação;escola']]);
  expect(csv).toContain("'=1+1");
  expect(csv).toContain("'+SUM(A1)");
  expect(csv).toContain("'-2");
  expect(csv).toContain("'@teste");
  expect(csv).toContain('"Texto ""entre aspas"""');
  expect(csv.startsWith('\uFEFF')).toBe(true);
});
