-- Configuração compartilhada e fila persistente. Não contém credenciais do provedor.
CREATE TABLE IF NOT EXISTS whatsapp_destinatarios (
    id VARCHAR(20) NOT NULL PRIMARY KEY,
    numero VARCHAR(15) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO whatsapp_destinatarios (id) VALUES
('marcela'), ('alexandra'), ('susana'), ('mercia'), ('monica'), ('camila');

CREATE TABLE IF NOT EXISTS whatsapp_envios (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ocorrencia_id INT NOT NULL,
    destinatario_id VARCHAR(20) NOT NULL,
    numero VARCHAR(15) NOT NULL,
    status VARCHAR(15) NOT NULL DEFAULT 'PENDENTE',
    mensagem_id VARCHAR(255) NULL,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_whatsapp_ocorrencia FOREIGN KEY (ocorrencia_id) REFERENCES ocorrencias (id) ON DELETE CASCADE,
    CONSTRAINT fk_whatsapp_destinatario FOREIGN KEY (destinatario_id) REFERENCES whatsapp_destinatarios (id),
    UNIQUE KEY uq_whatsapp_destino (ocorrencia_id, destinatario_id),
    INDEX idx_whatsapp_status (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
