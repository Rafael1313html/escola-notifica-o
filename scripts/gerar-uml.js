// Gera os diagramas vetoriais usados na apresentação e nas exportações.
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.join(__dirname, '..');
const xml = (valor) => String(valor).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const cores = { entidade: '#e7f5f5', enum: '#fff3d8', mensageria: '#e7efff' };
const modelo = [
  ['Escola', 40, 140, 300, 165, 'entidade', ['+ id: int {PK}', '+ nome: string [150] {único}']],
  ['Ocorrencia', 480, 110, 490, 370, 'entidade', ['+ id: int {PK}', '+ escola_id: int {FK}', '+ data_ocorrencia: date', '+ tipo: string [100] ?', '+ descricao: string [5000] ?', '+ gravidade: Gravidade', '+ registrado_por: Registrante', '+ registrado_por_outro: string ?', '+ status: string = ABERTA', '+ criado_em: timestamp']],
  ['Anexo', 1170, 110, 570, 270, 'entidade', ['+ ocorrencia_id: int {PK,FK}', '+ tipo: TipoAnexo', '+ nome: string [180] ?', '+ url: string [2048] ?', '+ tamanho: int ?', '+ arquivo: binario ?']],
  ['Registrante', 40, 390, 300, 170, 'enum', ['DIRETOR', 'VICE_DIRETOR', 'OUTROS']],
  ['Gravidade', 480, 530, 280, 145, 'enum', ['AMARELO', 'VERMELHO']],
  ['TipoAnexo', 1170, 440, 280, 145, 'enum', ['PDF', 'LINK']],
  ['DestinatarioWhatsApp', 40, 760, 390, 245, 'mensageria', ['+ id: string {PK}', '+ numero: string [15]', '+ acesso_versao: int', '/ nome: string {derivado}', '/ cargo: string {derivado}']],
  ['AvisoWhatsApp', 620, 760, 500, 295, 'mensageria', ['+ id: bigint {PK}', '+ ocorrencia_id: int {FK}', '+ destinatario_id: string {FK}', '+ numero: string [15]', '+ acesso_versao: int', '+ status: StatusEnvioWhatsApp', '+ mensagem_id: string ?', '+ atualizado_em: timestamp']],
  ['StatusEnvioWhatsApp', 1360, 690, 380, 230, 'enum', ['PENDENTE', 'PROCESSANDO', 'ACEITO', 'FALHOU', 'INCERTO']],
];
function card([nome, x, y, largura, altura, tipo, atributos]) {
  return `<g class="classe" data-classe="${nome}" transform="translate(${x} ${y})">
    <rect class="moldura" width="${largura}" height="${altura}" rx="10"/>
    <path fill="${cores[tipo]}" d="M10 1h${largura - 20}q9 0 9 9v64H1V10q0-9 9-9"/>
    <text class="estereotipo" x="${largura / 2}" y="25">${tipo === 'enum' ? '«enumeration»' : '«entidade»'}</text>
    <text class="titulo" x="${largura / 2}" y="55">${nome}</text><path class="relacao" d="M0 74H${largura}"/>
    ${atributos.map((a, i) => `<text class="atributo" x="18" y="${103 + i * 25}">${xml(a)}</text>`).join('\n')}
  </g>`;
}
const estilo = `<style>text{font-family:Arial,sans-serif;fill:#24364b}.moldura{fill:#fff;stroke:#6b879e;stroke-width:1.5}.titulo{font-size:23px;font-weight:bold;text-anchor:middle}.estereotipo{font-size:14px;text-anchor:middle;fill:#456177}.atributo{font:17px monospace}.relacao{fill:none;stroke:#456177;stroke-width:2}.rotulo{font-size:17px}.nota{font-size:17px;fill:#456177}.classe{cursor:pointer}.classe:hover .moldura{stroke:#12636d;stroke-width:4}</style>`;
const classes = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 1100" role="img" aria-labelledby="uml-titulo uml-descricao">
  <title id="uml-titulo">Conviva SP: classes do registro e dos avisos WhatsApp</title>
  <desc id="uml-descricao">Uma escola registra ocorrências. Cada ocorrência pode ter um anexo e gerar até seis avisos. Os avisos levam ao painel ADM; somente usuários com a chave do servidor consultam registros.</desc>
  ${estilo}<defs><marker id="uml-dependencia" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M1 1 11 6 1 11" fill="none" stroke="#456177" stroke-width="1.5"/></marker></defs>
  <rect width="1800" height="1100" fill="#f5f8fb"/>
  <text x="40" y="42" font-size="21" font-weight="bold">CONVIVA SP · REGISTRO E MENSAGERIA</text>
  <text x="40" y="74" class="nota">Modelo de domínio · dados persistidos no servidor · avisos com link para o painel ADM</text>
  <g class="relacao"><path d="M340 240H480"/><path d="M996 240H1170"/>
    <path d="M900 506V760"/><path d="M430 870H620"/>
    <path d="M510 480V500H340" stroke-dasharray="7 5" marker-end="url(#uml-dependencia)"/>
    <path d="M730 480V530" stroke-dasharray="7 5" marker-end="url(#uml-dependencia)"/>
    <path d="M1350 380V440" stroke-dasharray="7 5" marker-end="url(#uml-dependencia)"/>
    <path d="M1120 875H1360" stroke-dasharray="7 5" marker-end="url(#uml-dependencia)"/>
  </g>
  <path d="m970 240 13-9 13 9-13 9Z" fill="#456177"/><path d="m900 480 9 13-9 13-9-13Z" fill="#456177"/>
  <g class="rotulo"><text x="350" y="225">1</text><text x="435" y="225">0..*</text><text x="370" y="270">registra</text>
    <text x="1005" y="225">1</text><text x="1120" y="225">0..1</text><text x="1030" y="270">compõe</text>
    <text x="916" y="525">1</text><text x="916" y="742">0..6</text><text x="920" y="620">gera avisos</text>
    <text x="445" y="854">1</text><text x="570" y="854">0..*</text><text x="462" y="900">recebe</text></g>
  ${modelo.map(card).join('\n')}
  <text x="40" y="650" class="nota">ADM configura seis números:</text>
  <text x="40" y="680" class="nota">Marcela · Alexandra · Susana</text>
  <text x="40" y="708" class="nota">Mercia · Monica · Camila</text>
  <text x="40" y="1075" class="nota">PK: chave primária · FK: referência · ?: opcional · /: derivado · losango: composição · tracejado: dependência de tipo</text>
</svg>\n`;

const participantes = [['Equipe escolar', 140], ['API Worker', 430], ['D1 e fila', 730], ['Worker Cron', 1030], ['API WhatsApp', 1330], ['Equipe ADM', 1630]];
const ator = (x, y, nome) => `<g fill="none" stroke="#456177" stroke-width="2"><circle cx="${x}" cy="${y}" r="16"/><path d="M${x} ${y + 16}v48m-28-29h56m-28 29-24 38m24-38 24 38"/></g><text x="${x}" y="${y + 132}" text-anchor="middle" font-size="22" font-weight="bold">${nome}</text>`;
const caso = (x, y, rx, nome) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="52" fill="#fff" stroke="#6b879e" stroke-width="2"/><text x="${x}" y="${y + 7}" text-anchor="middle" font-size="22">${nome}</text>`;
const casos = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" role="img" aria-labelledby="casos-titulo casos-descricao">
  <title id="casos-titulo">Casos de uso UML: escola e ADM</title>
  <desc id="casos-descricao">A escola registra ocorrências e não consulta histórico. Somente o ADM autenticado consulta registros, relatórios e documentos, configura destinatários e altera ou apaga registros. Avisos abrem o painel, sem conceder acesso. A API verifica autorização em toda leitura.</desc>
  ${estilo}<defs><marker id="casos-seta" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M1 1 11 6 1 11" fill="none" stroke="#456177" stroke-width="1.5"/></marker></defs>
  <rect width="1600" height="1000" fill="#f5f8fb"/>
  <text x="40" y="45" font-size="24" font-weight="bold">QUEM USA O SISTEMA E O QUE PODE FAZER</text>
  <rect x="300" y="100" width="1000" height="800" rx="12" fill="#edf4f8" stroke="#6b879e" stroke-width="2"/>
  <text x="800" y="140" text-anchor="middle" font-size="23" font-weight="bold">escola-notificação · Conviva SP</text>
  <rect x="330" y="550" width="940" height="320" rx="10" fill="#e7efff" stroke="#6b879e" stroke-dasharray="6 5"/>
  <text x="800" y="577" text-anchor="middle" font-size="18" font-weight="bold">ÁREA EXCLUSIVA DO ADM</text>
  <g fill="none" stroke="#456177" stroke-width="2"><path d="M143 235 370 270"/><path d="M1452 235 1240 270"/><path d="M143 655 360 640"/><path d="M143 655H240V790H360"/><path d="M143 655H260V375H1040V322"/><path d="M1380 675H1340V460H1050"/></g>
  ${ator(115, 200, 'Equipe escolar')}${ator(115, 620, 'ADM')}${ator(1480, 200, 'ADM autorizado')}
  ${caso(570, 270, 200, 'Registrar ocorrência')}${caso(1040, 270, 200, 'Consultar e relatar')}
  <text x="480" y="400" text-anchor="middle" font-size="18">Escola: somente cadastrar</text>
  <text x="1040" y="185" text-anchor="middle" font-size="18">ADM: toda a rede</text>
  <text x="1040" y="205" text-anchor="middle" font-size="18">Aviso: acesso exige senha ADM</text>
  ${caso(800, 460, 250, 'Enviar aviso com link')}
  ${caso(570, 640, 210, 'Configurar seis números')}${caso(1050, 650, 210, 'Autenticar ADM')}${caso(570, 790, 210, 'Consultar envios')}
  ${caso(1050, 790, 210, 'Alterar / apagar registro')}
  <path d="M1050 738V702" class="relacao" stroke-dasharray="7 5" marker-end="url(#casos-seta)"/>
  <text x="1160" y="724" text-anchor="middle" font-size="16">«include»</text>
  <path d="M240 790V855H1050V842" class="relacao"/>
  <path d="M740 409 620 321" class="relacao" stroke-dasharray="7 5" marker-end="url(#casos-seta)"/>
  <text x="770" y="351" text-anchor="middle" font-size="17">«extend»</text>
  <text x="870" y="399" text-anchor="middle" font-size="17">[integração ativa]</text>
  <path d="M780 640 840 650" class="relacao" stroke-dasharray="7 5" marker-end="url(#casos-seta)"/>
  <text x="812" y="623" text-anchor="middle" font-size="16">«include»</text>
  <path d="M780 790H810V730H980V700" class="relacao" stroke-dasharray="7 5" marker-end="url(#casos-seta)"/>
  <text x="900" y="723" text-anchor="middle" font-size="16">«include»</text>
  <text x="800" y="887" text-anchor="middle" font-size="16">Somente o ADM altera, apaga ou configura destinatários.</text>
  <rect x="1380" y="630" width="200" height="90" rx="8" fill="#fff" stroke="#6b879e"/>
  <text x="1480" y="660" text-anchor="middle" font-size="15">«serviço externo»</text><text x="1480" y="690" text-anchor="middle" font-size="21" font-weight="bold">API WhatsApp</text>
  <text x="40" y="953" class="nota">Somente ADM consulta ocorrências · avisos abrem o painel e exigem senha · escola sem acesso ao histórico.</text>
</svg>\n`;
const seta = (x1, x2, y, texto, tracejada = false) => `<path d="M${x1} ${y}H${x2}" fill="none" stroke="#456177" stroke-width="2" ${tracejada ? 'stroke-dasharray="7 5"' : ''} marker-end="url(#seq-seta)"/><text x="${(x1 + x2) / 2}" y="${y - 13}" text-anchor="middle" font-size="17">${texto}</text>`;
const sequencia = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 900" role="img" aria-labelledby="seq-titulo seq-descricao">
  <title id="seq-titulo">Sequência UML: registrar, avisar e exigir autenticação ADM</title>
  <desc id="seq-descricao">A equipe escolar envia o cadastro. A API Worker salva ocorrência, anexo e avisos no D1. O cron envia aviso genérico com link do painel. Somente o ADM autenticado consulta os dados; o link não concede acesso.</desc>
  ${estilo}<defs><marker id="seq-seta" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#456177"/></marker></defs>
  <rect width="1800" height="900" fill="#f5f8fb"/>
  <text x="35" y="40" font-size="22" font-weight="bold">DO CADASTRO AO PAINEL ADM</text>
  ${participantes.map(([nome, x]) => `<rect x="${x - 110}" y="75" width="220" height="60" rx="8" fill="#e7f5f5" stroke="#6b879e"/><text x="${x}" y="112" text-anchor="middle" font-size="21" font-weight="bold">${nome}</text><path d="M${x} 135V810" stroke="#8195a5" stroke-dasharray="6 7"/>`).join('\n')}
  <rect x="420" y="180" width="20" height="200" fill="#d9eafa" stroke="#6b879e"/>
  ${seta(140, 420, 190, '1. Confirmar registro')}
  ${seta(440, 730, 260, '2. Registro, anexo e avisos')}
  ${seta(730, 440, 325, '3. Confirmar batch atômico', true)}
  ${seta(420, 140, 390, '4. Retornar protocolo', true)}
  <rect x="695" y="430" width="1055" height="255" rx="8" fill="none" stroke="#6b879e"/>
  <text x="710" y="453" font-size="15" font-weight="bold">loop · cron a cada minuto · integração ativa · um aviso por número preenchido</text>
  ${seta(1030, 730, 500, '5. Buscar e assumir pendente')}
  ${seta(730, 1030, 550, '6. Dados do aviso', true)}
  ${seta(1030, 1330, 600, '7. Modelo + link do painel')}
  ${seta(1330, 1630, 650, '8. Aviso para equipe ADM')}
  ${seta(1630, 430, 755, '9. Abrir painel; API exige chave ADM')}
  <text x="35" y="863" class="nota">API verifica cada consulta e documento · escola sem acesso ao histórico · ADM com acesso à rede · envio depende da Meta</text>
</svg>\n`;
for (const [arquivo, conteudo] of [['frontend/src/uml-diagrama.svg', classes], ['docs/classes-uml.svg', classes],
  ['frontend/src/uml-casos.svg', casos], ['docs/casos-uso-uml.svg', casos],
  ['frontend/src/uml-sequencia.svg', sequencia], ['docs/sequencia-uml.svg', sequencia]]) {
  fs.writeFileSync(path.join(raiz, arquivo), conteudo);
}
console.log('Diagramas de casos de uso, classes e sequência UML gerados.');
