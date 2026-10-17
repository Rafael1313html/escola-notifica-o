// Cria o banco, as tabelas e carrega as escolas: npm run db:init
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const pool = require('../src/db');

async function main() {
  const { database, ...semBanco } = pool.config;
  if (!/^\w+$/.test(database)) throw new Error('DB_NAME deve ter só letras, números e _');

  const conexao = await mysql.createConnection({ ...semBanco, multipleStatements: true });
  try {
    await conexao.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conexao.changeUser({ database });
    for (const arquivo of ['schema.sql', 'seed_escolas.sql', 'whatsapp.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'db', arquivo), 'utf8');
      await conexao.query(sql);
      console.log(`Executado: ${arquivo}`);
    }
    const [linhas] = await conexao.query('SELECT COUNT(*) AS total FROM escolas');
    for (const tabela of ['whatsapp_destinatarios', 'whatsapp_envios']) {
      const [colunas] = await conexao.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'acesso_versao'`, [database, tabela]);
      if (!colunas.length) await conexao.query(`ALTER TABLE ${tabela} ADD COLUMN acesso_versao INT NOT NULL DEFAULT 0`);
    }
    console.log(`Escolas cadastradas: ${linhas[0].total}`);
  } finally {
    await conexao.end();
  }
}

main()
  .catch((erro) => {
    console.error('Erro ao iniciar o banco:', erro.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
