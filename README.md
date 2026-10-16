# Escola notificação

Sistema de registro de ocorrências escolares. Node.js, Express, MySQL e front-end TypeScript com Vite.

## Interface

A entrada usa fotografia escolar, cartão branco, botão azul e fonte Montserrat. A logo Conviva SP fornecida em `logo.jpeg` substitui a anterior na entrada, na navegação e no ícone da página. Os recursos são servidos localmente, com fontes e licença em `frontend/public/assets`.

- Painel com indicadores de todo o histórico e evolução dos últimos seis meses.
- Consulta dos 200 registros mais recentes, com busca, filtros por escola, gravidade e período, paginação e detalhes.
- Formulário com validação, mensagens por campo e confirmação com número do registro.
- Descrição de até 5.000 caracteres, com resumo de até 300 caracteres no painel e texto completo nos detalhes e no CSV.
- Um documento opcional por nova ocorrência: arquivo PDF de até 5 MB ou link HTTP/HTTPS. A consulta exibe o anexo nos detalhes, com download do PDF ou abertura do link.
- Relatório de classificação vermelha por escola e exportação CSV dos resultados selecionados.
- Navegação por teclado, suporte a celular, preferência por movimento reduzido e impressão.
- Botão de tema claro/escuro na entrada e no topo do painel, com preferência salva por navegador. Na primeira visita, acompanha o tema do dispositivo. A impressão mantém fundo claro.

A tela de entrada abre o painel da aplicação. Ela não autentica usuários nem integra o Gov.br. A identidade visual não indica homologação oficial. Antes do uso com dados reais, ainda é necessário implementar autenticação e controle de acesso.

## Apresentação ao cliente e arquitetura

Abra `/apresentacao.html` com a aplicação iniciada, ou use **Como o sistema funciona** na lateral. A página traz o fluxo de uso, o diagrama da arquitetura e um botão para imprimir ou salvar em PDF. Veja os diagramas Mermaid e detalhes técnicos em [docs/arquitetura.md](docs/arquitetura.md).

## Armazenamento de documentos

No modo com servidor, o PDF fica na tabela `ocorrencia_anexos` do MySQL, vinculado ao ID da ocorrência. A gravação usa uma transação para salvar ocorrência e anexo juntos. Listagens carregam somente metadados; o arquivo é transferido ao baixar. Links são armazenados como endereços, sem copiar o documento da origem.

Para atualizar um banco já existente, execute `npm run db:init`. Isso cria a tabela de anexos sem apagar ocorrências. O arquivo `db/mysql_completo.sql` também inclui a tabela para uso no Workbench.

Na demonstração, os registros e metadados continuam em `localStorage`; PDFs ficam em IndexedDB no navegador. Falhas de persistência recusam o envio. Limpar dados do navegador remove os registros e arquivos locais.

## Rodar localmente

Use Node.js 20.19 ou superior na linha 20, ou Node.js 22.12 ou superior, para compilar o front-end.

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

## Demonstração no GitHub Pages

O workflow `.github/workflows/pages.yml` publica a interface automaticamente após um push em `main`. Na primeira publicação, abra **Settings → Pages** no repositório e selecione **GitHub Actions** como origem. O endereço do projeto será `https://rafael1313html.github.io/escola-notifica-o/`.

Essa demonstração funciona sem servidor e sem MySQL. Os registros ficam no armazenamento local do navegador de cada visitante; não são compartilhados entre pessoas e podem ser apagados ao limpar os dados do navegador. Use somente dados fictícios. O GitHub Pages em repositório privado depende do plano da conta; se a publicação for bloqueada pelo plano, conecte o repositório privado ao Cloudflare Pages e use `npm --prefix frontend ci && npm --prefix frontend run build:demo` como comando de build e `frontend/dist` como diretório de saída. O Cloudflare Pages publica em um domínio `pages.dev`.

## Publicar o backend no Railway

O `railway.json` configura o build, o início da aplicação e a rota de saúde. O build compila o front-end e o servidor Express entrega os arquivos gerados. O comando de início cria as tabelas e cadastra as 103 escolas de forma repetível.

1. Crie um projeto Railway conectado a este repositório.
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
5. Abra o domínio para testar o backend compartilhado e persistente.

O app não tem autenticação: quem tiver o link pode consultar e criar registros. Use somente dados fictícios no ambiente público de teste; não insira nomes, descrições ou informações reais de estudantes. Nunca envie o arquivo `.env` ao GitHub.

## Rotas da API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/escolas` | Lista as escolas |
| GET | `/api/indicadores` | Totais de todo o histórico e agregados mensais dos últimos seis meses |
| POST | `/api/ocorrencias` | Registra uma ocorrência |
| GET | `/api/ocorrencias?gravidade=VERMELHO` | Lista ocorrências, com filtros opcionais `gravidade` e `escola_id` |
| GET | `/api/ocorrencias/:id/anexo` | Baixa o PDF vinculado à ocorrência; retorna 404 quando não existe |
| GET | `/api/relatorios/vermelhas-por-escola` | Total de ocorrências vermelhas por escola |
| GET | `/health` | Verificação de disponibilidade |

## Regras do banco

- `gravidade`: `AMARELO` ou `VERMELHO`.
- `registrado_por`: `DIRETOR`, `VICE_DIRETOR` ou `OUTROS`; somente um por ocorrência.
- `registrado_por_outro` é obrigatório quando `registrado_por` for `OUTROS` e fica vazio nos demais casos.
- As regras `CHECK` exigem MySQL 8.0.16 ou mais recente.

## Validação

```sh
npm test
npm --prefix frontend run build
npm --prefix frontend exec playwright install chromium
npm --prefix frontend run test:e2e
```

Os testes da API usam um banco simulado, sem alterar o MySQL configurado. Os testes de navegador usam o modo de demonstração em contextos isolados, cobrindo cadastro, filtros, paginação, detalhes, exportação, teclado e verificações automáticas de acessibilidade no desktop e no celular. Com Chrome já instalado, defina `PLAYWRIGHT_BROWSER_CHANNEL=chrome` para utilizá-lo.

A API valida datas de calendário, bloqueia datas futuras, limita o tamanho dos textos e retorna erros públicos sem detalhes internos do banco. As datas de referência seguem `America/Sao_Paulo`. As exportações escapam campos e neutralizam textos que poderiam ser interpretados como fórmulas por planilhas.
