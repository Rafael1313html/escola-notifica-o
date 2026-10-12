-- Esquema MySQL 8: escolas e ocorrencias

CREATE TABLE IF NOT EXISTS escolas (
    id   INT NOT NULL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    UNIQUE KEY uq_escolas_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ocorrencias (
    id                   INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    escola_id            INT NOT NULL,
    data_ocorrencia      DATE NOT NULL,
    tipo                 VARCHAR(100) NULL,
    descricao            TEXT NULL,
    gravidade            VARCHAR(8) NOT NULL,
    registrado_por       VARCHAR(12) NOT NULL,
    registrado_por_outro VARCHAR(100) NULL,
    status               VARCHAR(30) NOT NULL DEFAULT 'ABERTA',
    criado_em            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ocorrencias_escola FOREIGN KEY (escola_id) REFERENCES escolas (id),
    CONSTRAINT ck_gravidade CHECK (gravidade IN ('AMARELO', 'VERMELHO')),
    CONSTRAINT ck_registrado_por CHECK (registrado_por IN ('DIRETOR', 'VICE_DIRETOR', 'OUTROS')),
    -- o campo "outro" so existe quando registrado_por = 'OUTROS'
    CONSTRAINT ck_outro CHECK (
        (registrado_por = 'OUTROS' AND registrado_por_outro IS NOT NULL)
        OR (registrado_por <> 'OUTROS' AND registrado_por_outro IS NULL)
    ),
    INDEX idx_ocorrencias_gravidade (gravidade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
