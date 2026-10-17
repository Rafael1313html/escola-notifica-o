// Gera os diagramas vetoriais usados na apresentação e nas exportações.
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.join(__dirname, '..');
const xml = (valor) => String(valor).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const cores = { entidade: '#e7f5f5', enum: '#fff3d8', mensageria: '#e7efff' };
const modelo = [
  ['Escola', 40, 140, 300, 165, 'entidade', ['+ id: int {PK}', '+ nome: string [150] {único}']],
  ['Ocorrencia', 480, 110, 490, 370, 'entidade', ['+ id: int {PK}', '+ escola_id: int {FK}', '+ data_ocorrencia: date', '+ tipo: string [100] ?', '+ descricao: string [5000] ?', '+ gravidade: Gravidade', '+ registrado_por: Registrante', '+ registrado_por_outro: string ?', '+ status: string = ABERTA', '+ criado_em: timestamp']],
  ['Anexo', 1170, 110, 570, 270, 'entidade', ['+ ocorrencia_id: int {PK,FK}', '+ tipo: TipoAnexo', '+ nome: string [180] ?', '+ url: string [2048] ?', '+ tamanho: int ?', '+ arquivo: MEDIUMBLOB ?']],
  ['Registrante', 40, 390, 300, 170, 'enum', ['DIRETOR', 'VICE_DIRETOR', 'OUTROS']],
  ['Gravidade', 480, 530, 280, 145, 'enum', ['AMARELO', 'VERMELHO']],
  ['TipoAnexo', 1170, 440, 280, 145, 'enum', ['PDF', 'LINK']],
  ['DestinatarioWhatsApp', 40, 760, 390, 220, 'mensageria', ['+ id: string {PK}', '+ numero: string [15]', '/ nome: string {derivado}', '/ cargo: string {derivado}']],
  ['AvisoWhatsApp', 620, 760, 500, 270, 'mensageria', ['+ id: bigint {PK}', '+ ocorrencia_id: int {FK}', '+ destinatario_id: string {FK}', '+ numero: string [15]', '+ status: StatusEnvioWhatsApp', '+ mensagem_id: string ?', '+ atualizado_em: timestamp']],
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
  <desc id="uml-descricao">Uma escola registra ocorrências. Cada ocorrência pode ter um anexo e gerar até seis avisos, um por destinatário configurado. Cada aviso tem um estado de envio. Os seis responsáveis recebem um link no WhatsApp pessoal. O modelo representa as tabelas implementadas.</desc>
  ${estilo}<defs><marker id="uml-dependencia" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M1 1 11 6 1 11" fill="none" stroke="#456177" stroke-width="1.5"/></marker></defs>
  <rect width="1800" height="1100" fill="#f5f8fb"/>
  <text x="40" y="42" font-size="21" font-weight="bold">CONVIVA SP · REGISTRO E MENSAGERIA</text>
  <text x="40" y="74" class="nota">Modelo de domínio · dados persistidos no servidor · avisos individuais com link da ocorrência</text>
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

const participantes = [['Escola', 130], ['Sistema', 440], ['Banco e fila', 750], ['API WhatsApp', 1060], ['Responsáveis', 1370]];
const seta = (x1, x2, y, texto, tracejada = false) => `<path d="M${x1} ${y}H${x2}" fill="none" stroke="#456177" stroke-width="2" ${tracejada ? 'stroke-dasharray="7 5"' : ''} marker-end="url(#seq-seta)"/><text x="${(x1 + x2) / 2}" y="${y - 13}" text-anchor="middle" font-size="17">${texto}</text>`;
const sequencia = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 820" role="img" aria-labelledby="seq-titulo seq-descricao">
  <title id="seq-titulo">Sequência UML: registrar e enviar o link da ocorrência</title>
  <desc id="seq-descricao">A escola confirma o cadastro. O sistema salva ocorrência e avisos na mesma transação e devolve o protocolo. Depois processa a fila e envia um modelo com o link pela API WhatsApp. Os responsáveis abrem o registro no navegador. Não há recebimento de respostas, webhook de mensagens ou chat interno.</desc>
  ${estilo}<defs><marker id="seq-seta" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#456177"/></marker></defs>
  <rect width="1500" height="820" fill="#f5f8fb"/>
  <text x="35" y="40" font-size="22" font-weight="bold">DO CADASTRO AO LINK NO WHATSAPP PESSOAL</text>
  ${participantes.map(([nome, x]) => `<rect x="${x - 105}" y="75" width="210" height="60" rx="8" fill="#e7f5f5" stroke="#6b879e"/><text x="${x}" y="112" text-anchor="middle" font-size="21" font-weight="bold">${nome}</text><path d="M${x} 135V750" stroke="#8195a5" stroke-dasharray="6 7"/>`).join('\n')}
  <rect x="430" y="180" width="20" height="200" fill="#d9eafa" stroke="#6b879e"/>
  ${seta(130, 430, 190, '1. Confirmar ocorrência')}
  ${seta(450, 750, 260, '2. Salvar registro e seis avisos')}
  ${seta(750, 450, 325, '3. Confirmar transação', true)}
  ${seta(430, 130, 390, '4. Retornar protocolo', true)}
  <rect x="700" y="435" width="755" height="175" rx="8" fill="none" stroke="#6b879e"/>
  <text x="715" y="460" font-size="15" font-weight="bold">loop · um aviso por número configurado</text>
  ${seta(750, 1060, 510, '5. Modelo aprovado + link')}
  ${seta(1060, 1370, 580, '6. Aviso no WhatsApp pessoal')}
  ${seta(1370, 440, 680, '7. Tocar no link e consultar a ocorrência no navegador')}
  <text x="35" y="785" class="nota">Somente envio · sem respostas, webhook de mensagens ou chat interno · integração depende da ativação na Meta</text>
</svg>\n`;
for (const [arquivo, conteudo] of [['frontend/src/uml-diagrama.svg', classes], ['docs/classes-uml.svg', classes],
  ['frontend/src/uml-sequencia.svg', sequencia], ['docs/sequencia-uml.svg', sequencia]]) {
  fs.writeFileSync(path.join(raiz, arquivo), conteudo);
}
console.log('Diagramas de classes e de sequência UML gerados.');
