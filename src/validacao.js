const GRAVIDADES = ['AMARELO', 'VERMELHO'];
const REGISTRANTES = ['DIRETOR', 'VICE_DIRETOR', 'OUTROS'];

function hojeISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function idValido(valor) {
  return (typeof valor === 'number' || typeof valor === 'string') &&
    /^[1-9]\d*$/.test(String(valor)) && Number.isSafeInteger(Number(valor));
}

function dataValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T12:00:00Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor &&
    valor >= '1000-01-01' && valor <= hojeISO();
}

function validarOcorrencia(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    return { erros: ['Envie um objeto JSON com os dados da ocorrência.'] };
  }
  const erros = [];
  if (!idValido(corpo.escola_id)) erros.push('Escolha uma escola válida.');
  if (!dataValida(corpo.data_ocorrencia)) erros.push('Informe uma data válida, igual ou anterior a hoje.');
  if (!GRAVIDADES.includes(corpo.gravidade)) erros.push('Escolha a gravidade: amarelo ou vermelho.');
  if (!REGISTRANTES.includes(corpo.registrado_por)) erros.push('Escolha quem registrou.');
  const textos = {};
  for (const [campo, limite, rotulo] of [
    ['tipo', 100, 'O tipo'], ['descricao', 5000, 'A descrição'],
    ['registrado_por_outro', 100, 'O nome ou cargo'],
  ]) {
    const valor = corpo[campo];
    if (valor != null && typeof valor !== 'string') {
      erros.push(`${rotulo} deve ser um texto.`);
    } else {
      textos[campo] = (valor || '').trim();
      if (textos[campo].length > limite) erros.push(`${rotulo} deve ter até ${limite} caracteres.`);
    }
  }
  if (corpo.registrado_por === 'OUTROS' && !textos.registrado_por_outro) erros.push('Informe quem registrou.');
  return {
    erros,
    dados: erros.length ? null : {
      escola_id: Number(corpo.escola_id), data_ocorrencia: corpo.data_ocorrencia,
      gravidade: corpo.gravidade, registrado_por: corpo.registrado_por,
      tipo: textos.tipo || null, descricao: textos.descricao || null,
      registrado_por_outro: corpo.registrado_por === 'OUTROS' ? textos.registrado_por_outro : null,
    },
  };
}

module.exports = { GRAVIDADES, hojeISO, idValido, dataValida, validarOcorrencia };
