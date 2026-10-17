require('dotenv').config();
const { criarApp } = require('./app');
const pool = require('./db');
const { criarMensageria } = require('./whatsapp');

const porta = process.env.PORT || 3000;
const mensageria = criarMensageria(pool);
const pararMensageria = mensageria.iniciar();
const servidor = criarApp(pool, { mensageria }).listen(porta, () => console.log(`Servidor em http://localhost:${porta}`));

let encerrando = false;
async function encerrar() {
  if (encerrando) return;
  encerrando = true;
  pararMensageria();
  servidor.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
