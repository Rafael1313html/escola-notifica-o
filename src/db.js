require('dotenv').config();
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'escola_notificacao',
  charset: 'utf8mb4',
  // DATE volta como texto AAAA-MM-DD, sem conversão de fuso horário.
  dateStrings: true,
};

const pool = mysql.createPool({
  ...config,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
module.exports.config = config;
