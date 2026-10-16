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

-- Um PDF ou link opcional por ocorrência. Reexecutar este esquema atualiza bancos existentes.
CREATE TABLE IF NOT EXISTS ocorrencia_anexos (
    ocorrencia_id INT NOT NULL PRIMARY KEY,
    tipo VARCHAR(4) NOT NULL,
    nome VARCHAR(180) NULL,
    url VARCHAR(2048) NULL,
    tamanho INT UNSIGNED NULL,
    arquivo MEDIUMBLOB NULL,
    CONSTRAINT fk_anexo_ocorrencia FOREIGN KEY (ocorrencia_id) REFERENCES ocorrencias (id) ON DELETE CASCADE,
    CONSTRAINT ck_anexo_conteudo CHECK (
        (tipo = 'PDF' AND nome IS NOT NULL AND arquivo IS NOT NULL AND tamanho BETWEEN 1 AND 5242880 AND url IS NULL)
        OR (tipo = 'LINK' AND url IS NOT NULL AND nome IS NULL AND arquivo IS NULL AND tamanho IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
