PRAGMA foreign_keys = ON;
CREATE TABLE escolas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE);
CREATE TABLE ocorrencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido TEXT NOT NULL UNIQUE,
  escola_id INTEGER NOT NULL REFERENCES escolas(id),
  data_ocorrencia TEXT NOT NULL,
  tipo TEXT,
  descricao TEXT,
  gravidade TEXT NOT NULL CHECK (gravidade IN ('AMARELO', 'VERMELHO')),
  registrado_por TEXT NOT NULL CHECK (registrado_por IN ('DIRETOR', 'VICE_DIRETOR', 'OUTROS')),
  registrado_por_outro TEXT,
  status TEXT NOT NULL DEFAULT 'ABERTA',
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((registrado_por = 'OUTROS' AND registrado_por_outro IS NOT NULL)
    OR (registrado_por <> 'OUTROS' AND registrado_por_outro IS NULL))
);
CREATE INDEX idx_ocorrencias_gravidade ON ocorrencias(gravidade);
CREATE INDEX idx_ocorrencias_data ON ocorrencias(data_ocorrencia DESC, id DESC);
CREATE TABLE ocorrencia_anexos (
  ocorrencia_id INTEGER PRIMARY KEY REFERENCES ocorrencias(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  nome TEXT,
  url TEXT,
  tamanho INTEGER,
  CHECK ((tipo = 'PDF' AND nome IS NOT NULL AND tamanho BETWEEN 1 AND 5242880 AND url IS NULL)
    OR (tipo = 'LINK' AND url IS NOT NULL AND nome IS NULL AND tamanho IS NULL))
);
CREATE TABLE anexo_partes (
  ocorrencia_id INTEGER NOT NULL REFERENCES ocorrencia_anexos(ocorrencia_id) ON DELETE CASCADE,
  posicao INTEGER NOT NULL,
  arquivo BLOB NOT NULL,
  PRIMARY KEY (ocorrencia_id, posicao)
);
CREATE TABLE whatsapp_destinatarios (id TEXT PRIMARY KEY, numero TEXT NOT NULL DEFAULT '');
INSERT INTO whatsapp_destinatarios(id) VALUES ('marcela'), ('alexandra'), ('susana'), ('mercia'), ('monica'), ('camila');
CREATE TABLE whatsapp_envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ocorrencia_id INTEGER NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
  destinatario_id TEXT NOT NULL REFERENCES whatsapp_destinatarios(id),
  numero TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','PROCESSANDO','ACEITO','FALHOU','INCERTO')),
  mensagem_id TEXT,
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ocorrencia_id, destinatario_id)
);
CREATE INDEX idx_whatsapp_pendentes ON whatsapp_envios(status, id);
