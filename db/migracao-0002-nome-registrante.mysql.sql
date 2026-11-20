ALTER TABLE ocorrencias
  ADD COLUMN registrado_por_nome VARCHAR(100) NOT NULL DEFAULT '' AFTER registrado_por;
