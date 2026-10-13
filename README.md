# Escola notificação

Sistema de registro de ocorrências escolares. Node.js, Express, MySQL e front-end TypeScript com Vite.

## Rodar localmente

1. Copie `.env.example` para `.env` e configure o acesso ao MySQL.
2. Na pasta principal, execute:

   ```sh
   npm install
   npm run db:init
   npm run build
   npm start
   ```

3. Acesse `http://localhost:3000`.

Para desenvolver o front-end com recarga automática, rode `npm run dev` dentro de `frontend` e mantenha o servidor Node ativo na porta 3000.

## Publicar no Railway

O `railway.json` configura o build, o início da aplicação e a rota de saúde. O build compila o front-end e o servidor Express entrega os arquivos gerados. O comando de início cria as tabelas e cadastra as 103 escolas de forma repetível.

1. Envie este repositório ao GitHub e crie um projeto Railway conectado a ele.
2. No Railway, adicione um serviço **MySQL** ao mesmo projeto.
3. Configure no serviço da aplicação estas variáveis, como referências às variáveis do serviço MySQL (ajuste `MySQL` ao nome dado ao serviço):

   ```text
   DB_HOST=${{MySQL.MYSQLHOST}}
   DB_PORT=${{MySQL.MYSQLPORT}}
   DB_USER=${{MySQL.MYSQLUSER}}
   DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   DB_NAME=${{MySQL.MYSQLDATABASE}}
   ```

4. Gere um domínio público para o serviço da aplicação nas configurações de rede do Railway.
5. Abra o domínio para testar.

O app não tem autenticação: quem tiver o link pode consultar e criar registros. Use somente dados fictícios no ambiente público de teste; não insira nomes, descrições ou informações reais de estudantes. Nunca envie o arquivo `.env` ao GitHub.

## Rotas da API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/escolas` | Lista as escolas |
| POST | `/api/ocorrencias` | Registra uma ocorrência |
| GET | `/api/ocorrencias?gravidade=VERMELHO` | Lista ocorrências, com filtros opcionais `gravidade` e `escola_id` |
| GET | `/api/relatorios/vermelhas-por-escola` | Total de ocorrências vermelhas por escola |
| GET | `/health` | Verificação de disponibilidade |

## Regras do banco

- `gravidade`: `AMARELO` ou `VERMELHO`.
- `registrado_por`: `DIRETOR`, `VICE_DIRETOR` ou `OUTROS`; somente um por ocorrência.
- `registrado_por_outro` é obrigatório quando `registrado_por` for `OUTROS` e fica vazio nos demais casos.
- As regras `CHECK` exigem MySQL 8.0.16 ou mais recente.
