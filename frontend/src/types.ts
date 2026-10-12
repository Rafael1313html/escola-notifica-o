export type Gravidade = 'AMARELO' | 'VERMELHO';
export type Registrante = 'DIRETOR' | 'VICE_DIRETOR' | 'OUTROS';

export interface Escola {
  id: number;
  nome: string;
}

export interface Ocorrencia {
  id: number;
  escola: string;
  data_ocorrencia: string; // AAAA-MM-DD
  tipo: string | null;
  descricao: string | null;
  gravidade: Gravidade;
  registrado_por: Registrante;
  registrado_por_outro: string | null;
  status: string;
  criado_em: string;
}

export interface ItemRelatorio {
  escola: string;
  total_vermelhas: number;
}

export interface NovaOcorrencia {
  escola_id: number;
  data_ocorrencia: string;
  tipo: string;
  descricao: string;
  gravidade: Gravidade;
  registrado_por: Registrante;
  registrado_por_outro: string;
}
