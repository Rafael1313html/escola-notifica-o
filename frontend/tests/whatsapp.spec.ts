import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('cadastro de números fica oculto sem ADM, inclusive na demonstração e no link direto', async ({ page }) => {
  let pedidos = 0;
  await page.route('**/api/admin/whatsapp', async (route) => {
    pedidos++;
    await route.fulfill({ status: 401, json: { erros: ['Chave ADM inválida.'] } });
  });
  await page.addInitScript(() => {
    localStorage.setItem('escola-notificacao:whatsapp-demo', JSON.stringify({ marcela: '5511999990000' }));
    localStorage.setItem('adm', 'true');
  });
  await page.goto('/#visao-geral');
  await expect(page.getByRole('tab', { name: 'Canal direto com a diretoria' })).toHaveCount(0);
  await expect(page.locator('#whatsapp-campos input')).toHaveCount(0);
  expect(pedidos).toBe(0);
  await page.getByRole('button', { name: 'ADM: acesso do administrador', exact: true }).click();
  await page.getByLabel('Chave de acesso ADM', { exact: true }).fill('incorreta');
  await page.getByRole('button', { name: 'Acessar configuração' }).click();
  await expect(page.locator('#whatsapp-acesso-status')).toHaveText('Chave ADM inválida.');
  await expect(page.locator('#painel-whatsapp')).not.toBeVisible();
  await expect(page.locator('#whatsapp-campos input')).toHaveCount(0);
  expect(pedidos).toBe(1);
  await page.goto('/#whatsapp');
  await expect(page.getByRole('dialog', { name: 'Acesso do administrador' })).toBeVisible();
  await expect(page.locator('#painel-whatsapp')).not.toBeVisible();
  await expect(page.locator('#aba-whatsapp')).toBeHidden();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('somente ADM validado no servidor consulta e salva seis números; bloquear e recarregar removem acesso', async ({ page }) => {
  const destinatarios = [
    ['marcela', 'Marcela', 'Dirigente'], ['alexandra', 'Alexandra', 'Supervisora'], ['susana', 'Susana', 'Supervisora'],
    ['mercia', 'Mercia', 'PEC · ADM'], ['monica', 'Monica', 'PEC'], ['camila', 'Camila', 'CEC'],
  ].map(([id, nome, cargo]) => ({ id, nome, cargo, numero: '' }));
  let revogado = false;
  await page.route('**/api/admin/whatsapp', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer teste-chave-adm');
    if (revogado) return route.fulfill({ status: 401, json: { erros: ['Chave ADM inválida.'] } });
    if (route.request().method() === 'PUT') {
      const dados = route.request().postDataJSON().destinatarios as { id: string; numero: string }[];
      for (const item of destinatarios) item.numero = dados.find((d) => d.id === item.id)!.numero;
      return route.fulfill({ json: { salvo: true } });
    }
    await route.fulfill({ json: { ativo: false, envios: [], destinatarios } });
  });
  const entrar = async () => {
    if (!(await page.locator('#whatsapp-acesso-dialog').isVisible())) {
      await page.getByRole('button', { name: 'ADM: acesso do administrador', exact: true }).click();
    }
    await page.getByLabel('Chave de acesso ADM', { exact: true }).fill('teste-chave-adm');
    await page.getByRole('button', { name: 'Acessar configuração' }).click();
    await expect(page.locator('#whatsapp-form')).toBeVisible();
  };
  await page.goto('/#visao-geral');
  await entrar();
  await expect(page.getByRole('heading', { name: 'Canal direto com a diretoria', exact: true })).toBeVisible();
  await expect(page.locator('#whatsapp-campos input')).toHaveCount(6);
  await expect(page.locator('#whatsapp-chave')).toHaveValue('');
  await page.getByLabel('Dirigente · Marcela', { exact: true }).fill('+55 (11) 99999-0000');
  await page.getByLabel('Supervisora · Alexandra', { exact: true }).fill('+55 (11) 99999-0001');
  await page.getByRole('button', { name: 'Salvar números' }).click();
  await expect(page.locator('#whatsapp-status')).toContainText('Números salvos');
  await page.reload();
  await expect(page.locator('#whatsapp-campos input')).toHaveCount(0);
  await expect(page.locator('#aba-whatsapp')).toBeHidden();
  await entrar();
  await expect(page.getByLabel('Dirigente · Marcela', { exact: true })).toHaveValue('5511999990000');
  await expect(page.getByLabel('Supervisora · Susana', { exact: true })).toHaveValue('');
  await page.getByLabel('Supervisora · Susana', { exact: true }).fill('5511999990000');
  await page.getByRole('button', { name: 'Salvar números' }).click();
  await expect(page.locator('#whatsapp-status')).toContainText('número diferente');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const acessibilidade = await new AxeBuilder({ page }).analyze();
  expect(acessibilidade.violations).toEqual([]);
  await page.locator('.topo [data-alternar-tema]').click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Bloquear configuração' }).click();
  await expect(page.locator('#aba-whatsapp')).toBeHidden();
  await expect(page.locator('#whatsapp-campos input')).toHaveCount(0);
  await expect(page.locator('#painel-whatsapp')).not.toBeVisible();
  await entrar();
  revogado = true;
  await page.getByRole('button', { name: 'Atualizar situação' }).click();
  await expect(page.locator('#aba-whatsapp')).toBeHidden();
  await expect(page.locator('#whatsapp-campos input')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage).includes('teste-chave-adm'))).toBe(false);
});

test('fechar acesso ADM durante a validação impede que resposta atrasada libere cadastro', async ({ page }) => {
  let responder: (() => void) | undefined;
  const liberacao = new Promise<void>((resolve) => { responder = resolve; });
  let recebeuPedido = false;
  await page.route('**/api/admin/whatsapp', async (route) => {
    recebeuPedido = true;
    await liberacao;
    await route.fulfill({ json: { ativo: false, envios: [], destinatarios: [] } });
  });
  await page.goto('/#whatsapp');
  await page.getByLabel('Chave de acesso ADM', { exact: true }).fill('teste-chave-adm');
  await page.getByRole('button', { name: 'Acessar configuração' }).click();
  await expect.poll(() => recebeuPedido).toBe(true);
  await page.getByRole('button', { name: 'Fechar acesso ADM' }).click();
  await expect(page.locator('#whatsapp-acesso-dialog')).not.toBeVisible();
  responder!();
  await expect(page.getByRole('button', { name: 'Acessar configuração', includeHidden: true })).toBeEnabled();
  await expect(page.locator('#aba-whatsapp')).toBeHidden();
  await expect(page.locator('#whatsapp-campos input')).toHaveCount(0);
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
