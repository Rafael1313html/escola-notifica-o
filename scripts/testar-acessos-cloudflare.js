const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('../frontend/node_modules/playwright');

async function testar() {
  const base = 'http://127.0.0.1:8787';
  const senha = require('dotenv').parse(fs.readFileSync('.env')).ADMIN_WHATSAPP_KEY;
  const headers = { Authorization: `Bearer ${senha}`, 'Content-Type': 'application/json' };
  const pedir = async (caminho, method = 'GET', dados, auth = headers) => {
    const r = await fetch(`${base}/api/${caminho}`, { method, headers: auth,
      body: dados === undefined ? undefined : JSON.stringify(dados) });
    return { status: r.status, corpo: await r.json() };
  };
  const original = (await pedir('admin/whatsapp')).corpo;
  assert.equal(original.destinatarios.length, 6);
  const ids = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const configuracao = structuredClone(original);
    configuracao.destinatarios[0].numero = '5511988887777';
    assert.equal((await pedir('admin/whatsapp', 'PUT', configuracao)).status, 200);
    for (const escola_id of [1, 2]) {
      const criado = await pedir('ocorrencias', 'POST', { escola_id, data_ocorrencia: '2026-01-10',
        gravidade: 'AMARELO', registrado_por: 'DIRETOR', descricao: `Teste de acesso ${crypto.randomUUID()}` }, {});
      assert.equal(criado.status, 201); ids.push(criado.corpo.id);
    }
    for (const rota of ['ocorrencias', `ocorrencias/${ids[0]}`, `ocorrencias/${ids[0]}/anexo`, 'indicadores', 'relatorios/vermelhas-por-escola']) {
      assert.equal((await pedir(rota, 'GET', undefined, {})).status, 401);
    }
    const gerados = await pedir(`admin/ocorrencias/${ids[0]}/links`, 'POST');
    const url = new URL(gerados.corpo.links.find((l) => l.destinatario === 'marcela').url);
    const token = new URLSearchParams(url.hash.split('?')[1]).get('acesso');
    const pessoal = { Authorization: `Link ${token}`, 'Content-Type': 'application/json' };
    assert.equal((await pedir(`ocorrencias/${ids[1]}`, 'GET', undefined, pessoal)).status, 200);
    assert.equal((await pedir(`admin/ocorrencias/${ids[0]}`, 'DELETE', undefined, pessoal)).status, 401);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const erros = []; page.on('pageerror', (e) => erros.push(e.message));
      await page.goto(`${base}/#ocorrencias`, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('#painel-registrar').isVisible(), true);
      assert.equal(await page.locator('[data-painel="ocorrencias"]').isVisible(), false);
      await page.goto(`${base}/${url.hash}`, { waitUntil: 'networkidle' });
      await page.locator('#detalhes-dialog[open]').waitFor();
      assert.ok(!page.url().includes('acesso='));
      assert.equal(await page.getByRole('button', { name: 'Editar registro', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Apagar registro', exact: true }).count(), 0);
      assert.equal(await page.locator('#aba-whatsapp').isVisible(), false);
      await page.getByRole('button', { name: 'Fechar detalhes' }).click();
      await page.evaluate((id) => { location.hash = `#ocorrencias/${id}`; }, ids[1]);
      await page.locator('#detalhes-dialog[open]').waitFor();
      assert.equal(await page.locator('#detalhes-titulo').textContent(), `EN-${String(ids[1]).padStart(6, '0')}`);
      await page.getByRole('button', { name: 'Fechar detalhes' }).click();
      await page.getByRole('tab', { name: 'Relatórios' }).click();
      await page.getByRole('button', { name: 'Sair do acesso' }).click();
      assert.equal(await page.locator('[data-painel="ocorrencias"]').isVisible(), false);
      assert.equal(await page.locator('#detalhes-conteudo').textContent(), '');
      assert.equal(await page.locator('#lista table').count(), 0);
      assert.deepEqual(erros, []);
      await context.close();
    }
    const page = await browser.newPage();
    await page.goto(`${base}/#whatsapp`);
    await page.locator('#whatsapp-chave').fill(senha);
    await page.locator('#whatsapp-acesso button').click();
    await page.locator('#whatsapp-form').waitFor();
    await page.getByRole('tab', { name: 'Ocorrências' }).click();
    await page.getByRole('button', { name: `Ver detalhes do registro EN-${String(ids[0]).padStart(6, '0')}` }).click();
    await page.getByRole('button', { name: 'Editar registro', exact: true }).click();
    await page.locator('#editar-descricao').fill('Revisado exclusivamente pelo ADM');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await page.locator('#detalhes-dialog').waitFor({ state: 'hidden' });
    assert.equal((await pedir(`ocorrencias/${ids[0]}`)).corpo.descricao, 'Revisado exclusivamente pelo ADM');
    await page.getByRole('button', { name: `Ver detalhes do registro EN-${String(ids[0]).padStart(6, '0')}` }).click();
    await page.getByRole('button', { name: 'Apagar registro', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
    await page.locator('#detalhes-dialog').waitFor({ state: 'hidden' });
    assert.equal((await pedir(`ocorrencias/${ids[0]}`)).status, 404);
    configuracao.destinatarios[0].numero = '';
    await pedir('admin/whatsapp', 'PUT', configuracao);
    assert.equal((await pedir(`ocorrencias/${ids[1]}`, 'GET', undefined, pessoal)).status, 401);
    console.log('Worker real: escola sem consultas; responsável consulta toda a rede; somente ADM edita e exclui. Desktop e celular aprovados.');
  } finally {
    for (const id of ids) await pedir(`admin/ocorrencias/${id}`, 'DELETE');
    await pedir('admin/whatsapp', 'PUT', original);
    await browser.close();
  }
}
testar().catch((e) => { console.error(e.stack); process.exitCode = 1; });
