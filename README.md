# Escola notificação

Registro de ocorrências escolares. Node.js + Express + MySQL, com front-end em TypeScript (Vite).

## Como rodar

1. Copie `.env.example` para `.env` e coloque a senha do seu MySQL em `DB_PASSWORD`.
2. Na pasta principal:
   ```
   npm install
   npm run db:init   # cria o banco, as tabelas e carrega as 103 escolas
   npm start         # http://localhost:3000
   ```
3. Em outro terminal, o front-end em desenvolvimento:
   ```
   cd frontend
   npm install
   npm run dev       # http://localhost:5173
   ```

Para servir tudo em um só endereço: `cd frontend && npm run build`, depois `npm start` na pasta principal.

Alternativa ao `npm run db:init`: abra `db/mysql_completo.sql` no MySQL Workbench e execute (raio).

## Rotas

| Método | Rota | O que faz |
|---|---|---|
| GET | /api/escolas | Lista as escolas |
| POST | /api/ocorrencias | Registra uma ocorrência |
| GET | /api/ocorrencias?gravidade=VERMELHO | Lista ocorrências (filtros: gravidade, escola_id) |
| GET | /api/relatorios/vermelhas-por-escola | Total de ocorrências vermelhas por escola |

## Regras do banco

- `gravidade`: `AMARELO` ou `VERMELHO`.
- `registrado_por`: `DIRETOR`, `VICE_DIRETOR` ou `OUTROS`; só um por ocorrência.
- `registrado_por_outro` é obrigatório quando for `OUTROS` e fica vazio nos demais casos.
- As regras `CHECK` só são aplicadas no MySQL 8.0.16 ou mais novo.
