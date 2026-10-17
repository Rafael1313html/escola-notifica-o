-- Mudar ou desativar o número revoga os links emitidos na versão anterior.
ALTER TABLE whatsapp_destinatarios ADD COLUMN acesso_versao INTEGER NOT NULL DEFAULT 0;
ALTER TABLE whatsapp_envios ADD COLUMN acesso_versao INTEGER NOT NULL DEFAULT 0;
