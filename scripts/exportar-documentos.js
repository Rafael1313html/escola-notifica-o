const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../frontend/node_modules/playwright');

async function exportar() {
  const base = process.env.EXPORT_BASE_URL || 'http://127.0.0.1:8787';
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await page.addInitScript(() => localStorage.setItem('escola-notificacao:tema', 'claro'));
    await page.goto(`${base}/uml.html`, { waitUntil: 'networkidle' });
    await page.locator('#uml-casos-mapa svg').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: 'docs/classes-uml.pdf', printBackground: true, preferCSSPageSize: true });
    await page.screenshot({ path: 'docs/uml-apresentacao.png', fullPage: true });
    for (const [origem, destino] of [['uml-casos.svg', 'casos-uso-uml.png'], ['uml-diagrama.svg', 'classes-uml.png'], ['uml-sequencia.svg', 'sequencia-uml.png']]) {
      const svg = fs.readFileSync(path.join('frontend/src', origem), 'utf8');
      const png = await page.evaluate(async (texto) => {
        const documento = new DOMParser().parseFromString(texto, 'image/svg+xml').documentElement;
        const [, , largura, altura] = documento.getAttribute('viewBox').split(' ').map(Number);
        const url = URL.createObjectURL(new Blob([texto], { type: 'image/svg+xml' }));
        try {
          const imagem = new Image(); imagem.src = url; await imagem.decode();
          const canvas = document.createElement('canvas'); canvas.width = largura * 2; canvas.height = altura * 2;
          canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/png').split(',')[1];
        } finally { URL.revokeObjectURL(url); }
      }, svg);
      fs.writeFileSync(path.join('docs', destino), Buffer.from(png, 'base64'));
    }
    await page.goto(`${base}/mensageria.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: 'docs/mensageria-arquitetura.pdf', printBackground: true, preferCSSPageSize: true, scale: 0.85 });
    await page.screenshot({ path: 'docs/mensageria-arquitetura.png', fullPage: true });
    console.log('UML e arquitetura exportados em PDF e PNG.');
  } finally { await browser.close(); }
}

exportar().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
