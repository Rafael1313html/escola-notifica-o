import type { Escola, Gravidade, Indicadores, ItemRelatorio, NovaOcorrencia, Ocorrencia } from './types';

const nomesEscolas = [
  'ABEL DOS REIS',
  'AGENOR MEDEIROS PROFESSOR',
  'ALBERTO FERRIANI PROFESSOR',
  'ALBERTO JOSE GONCALVES DOM',
  'ALBERTO SANTOS DUMONT',
  'ALCIDES CORREA PROFESSOR',
  'ALPHEU DOMINIGUETTI PROFESSOR',
  'AMELIA DOS SANTOS MUSA PROFESSORA',
  'ANTONIO AUGUSTO LOPES DE OLIVEIRA JUNIOR',
  'ANTONIO BARREIROS PROFESSOR',
  'ANTONIO DIEDERICHSEN',
  'ARTHUR PIRES CORONEL',
  'AYMAR BAPTISTA PRADO PROFESSOR DOUTOR',
  'BAIRRO FRANCISCO CASTILHO',
  'BARROS CONEGO',
  'BAUDILIO BIAGI',
  'BENEDITO MACIEL ARANTES PROFESSOR',
  'CANDIDO PORTINARI',
  'CEEJA CECILIA DULTRA CARAM PROFESSORA',
  'CID DE OLIVEIRA LEITE PROFESSOR',
  'CORDELIA RIBEIRO RAGOZO PROFESSORA',
  'DEPUTADO ANTONIO CALIXTO',
  'DJANIRA VELHO PROFESSORA',
  'DOMINGOS JOAO BAPTISTA SPINELLI PROFESSOR DOUTOR',
  'DR THOMAZ ALBERTO WHATELY',
  'EDGARDO CAJADO DOUTOR',
  'ESPLANADA DA ESTACAO',
  'EUGENIA VILHENA DE MORAIS PROFESSORA',
  'EXPEDICIONARIOS BRASILEIROS',
  'FABIO BARRETO',
  'FERNANDO CAMPOS ROSAS PROFESSOR',
  'FRANCISCO BONFIM',
  'FRANCISCO DA CUNHA JUNQUEIRA DOUTOR',
  'FRANCISCO FERREIRA DE FREITAS',
  'FRANCISCO GOMES PROFESSOR',
  'FRANCISCO MATARAZZO CONDE',
  'GALDINO DE CASTRO',
  'GERALDO CORREIA DE CARVALHO DOUTOR',
  'GERALDO TORRANO PROFESSOR',
  'GERALDO TRISTAO DE LIMA PROFESSOR',
  'GETULIO VARGAS DOUTOR',
  'GLETE DE ALCANTARA PROFESSORA',
  'GLORIA DOS SANTOS FONSECA PROFESSORA',
  'GUIMARAES JUNIOR DOUTOR',
  'HELIO LOURENCO DE OLIVEIRA PROFESSOR',
  'HELY LOPES MEIRELLES',
  'HERMINIA GUGLIANO PROFESSORA',
  'IRENE DIAS RIBEIRO PROFESSORA',
  'JARDIM DAS ROSAS',
  'JARDIM DIVA TARLA DE CARVALHO',
  'JARDIM PAIVA I',
  'JENNY DE TOLEDO PIZA SCHROEDER PROFESSORA',
  'JESUS GUILHERME GIACOMINI',
  'JOAO AUGUSTO DE MELLO PROFESSOR',
  'JOAO DE SOUZA CAMPOS CORONEL',
  'JOAO PALMA GUIAO DOUTOR',
  'JOAO RODRIGUES GUIAO DOUTOR',
  'JOAQUIM ALVES FERREIRA MONSENHOR',
  'JORGE RODINI LUIZ PROFESSOR',
  'JOSE ALEIXO DA SILVA PASSOS CORONEL',
  'JOSE BOMPANI VEREADOR',
  'JOSE COSTA DEPUTADO',
  'JOSE LIMA PEDREIRA DE FREITAS PROFESSORA',
  'JOVEM FELIPE GUI ROCHA',
  'JULIETA FERNANDA SOUSA TARANTO',
  'LAUDELINA DE CAMPOS MELO',
  'MACARIO DE ALMEIDA CONEGO',
  'MADRE TERESA DE CALCUTA',
  'MARIA VIRGINIA MANSUR BIAGI PROFESSORA',
  'MEIRA JUNIOR DOUTOR',
  'MESSIAS DA FONSECA DOUTOR',
  'MIGUEL JORGE',
  'NEUSA MARIA DO BEM PROFESSORA',
  'ORLANDO JURCA DEPUTADO',
  'ORLANDO VITALIANO VEREADOR',
  'OSCAR DE MOURA LACERDA PROFESSOR DOUTOR',
  'OTONIEL MOTA',
  'PARQUE DOS SERVIDORES',
  'PROFESSOR DIVO MARINO',
  'PROFESSOR LAURO BIGELLI',
  'PROFESSOR PAULO CESAR CARNIEL GIOVANNETTI',
  'PROFESSORA NAIR GUILHERMINA PINHEIRO NOGUEIRA - NAIRZINHA',
  'PROFESSORA SUELI TEREZINHA DANHONE',
  'RAFAEL LEME FRANCO PROFESSOR',
  'RITA FERRAZ CASELLI PROFESSORA',
  'ROMEU ALBERTI DOM',
  'ROMUALDO MONTEIRO DE BARROS PROFESSOR',
  'ROSANGELA BASILE PROFESSORA',
  'RUBEN CLAUDIO MOREIRA PROFESSOR',
  'SALUSTIANO LEMOS',
  'SERRA AZUL',
  'SILVIO DE ALMEIDA',
  'SIMAO DA SILVA',
  'SINHA JUNQUEIRA DONA',
  'TEOFILO SIQUEIRA',
  'VEIGA DE MIRANDA MINISTRO',
  'VEREADOR JOSE VELLONI',
  'VERGINIO MELLONI',
  'VICENTE TEODORO DE SOUZA PROFESSOR',
  'VIRGILIO GARCIA CAPITAO',
  'WALTER FERREIRA PROFESSOR',
  'WALTER PAIVA PROFESSOR',
  'WASHINGTON LUIZ DOUTOR',
];

export const escolasDemo: Escola[] = nomesEscolas.map((nome, i) => ({ id: i + 1, nome }));

const chave = 'escola-notificacao:demo:ocorrencias';
let memoria: Ocorrencia[] = [];

function ler(): Ocorrencia[] {
  try {
    const valor = localStorage.getItem(chave);
    if (valor) {
      const itens: unknown = JSON.parse(valor);
      if (Array.isArray(itens) && itens.every((item) => item && typeof item === 'object' &&
        Number.isSafeInteger(item.id) && typeof item.escola === 'string' &&
        typeof item.data_ocorrencia === 'string' && ['AMARELO', 'VERMELHO'].includes(item.gravidade))) {
        memoria = itens as Ocorrencia[];
      }
    }
  } catch {
    // O modo de demonstração continua funcionando enquanto esta página estiver aberta.
  }
  return memoria;
}

function gravar(itens: Ocorrencia[]): void {
  memoria = itens;
  try {
    localStorage.setItem(chave, JSON.stringify(itens));
  } catch {
    // Sem armazenamento local, os registros ficam apenas na memória desta página.
  }
}

export async function listarOcorrenciasDemo(gravidade: Gravidade | ''): Promise<Ocorrencia[]> {
  return ler()
    .filter((item) => !gravidade || item.gravidade === gravidade)
    .sort((a, b) => b.data_ocorrencia.localeCompare(a.data_ocorrencia) || b.id - a.id);
}

export async function listarRelatorioDemo(): Promise<ItemRelatorio[]> {
  const ocorrencias = ler();
  return escolasDemo
    .map((escola) => ({
      escola: escola.nome,
      total_vermelhas: ocorrencias.filter(
        (item) => item.gravidade === 'VERMELHO' && item.escola === escola.nome,
      ).length,
    }))
    .sort((a, b) => b.total_vermelhas - a.total_vermelhas || a.escola.localeCompare(b.escola));
}

export async function listarIndicadoresDemo(): Promise<Indicadores> {
  const itens = ler();
  const meses = new Map<string, Indicadores['meses'][number]>();
  itens.forEach((item) => {
    const mes = item.data_ocorrencia.slice(0, 7);
    const agregado = meses.get(mes) || { mes, total: 0, vermelhas: 0, amarelas: 0 };
    agregado.total += 1;
    if (item.gravidade === 'VERMELHO') agregado.vermelhas += 1;
    else agregado.amarelas += 1;
    meses.set(mes, agregado);
  });
  return {
    total_ocorrencias: itens.length,
    total_vermelhas: itens.filter((item) => item.gravidade === 'VERMELHO').length,
    total_amarelas: itens.filter((item) => item.gravidade === 'AMARELO').length,
    escolas_com_registros: new Set(itens.map((item) => item.escola)).size,
    total_escolas: escolasDemo.length,
    meses: [...meses.values()],
  };
}

export async function criarOcorrenciaDemo(dados: NovaOcorrencia): Promise<{ id: number }> {
  const escola = escolasDemo.find((item) => item.id === dados.escola_id);
  if (!escola) throw new Error('Escolha uma escola válida.');
  const ocorrencias = ler();
  const id = ocorrencias.reduce((maior, item) => Math.max(maior, item.id), 0) + 1;
  ocorrencias.push({
    id,
    escola: escola.nome,
    data_ocorrencia: dados.data_ocorrencia,
    tipo: dados.tipo || null,
    descricao: dados.descricao || null,
    gravidade: dados.gravidade,
    registrado_por: dados.registrado_por,
    registrado_por_outro: dados.registrado_por === 'OUTROS' ? dados.registrado_por_outro : null,
    status: 'ABERTA',
    criado_em: new Date().toISOString(),
  });
  gravar(ocorrencias);
  return { id };
}
