# Publicação do sistema no Cloudflare

O frontend do projeto `escola-notificacao` usa Cloudflare Pages. As Pages Functions encaminham `/api/*` ao Worker `escola-notificacao-api`. O Worker grava os dados no banco D1 `escola-notificacao`; o cron do mesmo Worker processa a fila de avisos a cada minuto.

## Acessos

- **Comum:** abrir o sistema, registrar e consultar ocorrências, indicadores, documentos e relatórios. Esse acesso não exige senha.
- **ADM:** clicar em **ADM**, informar a senha e configurar os seis números. A API exige a senha em toda consulta e alteração administrativa. A senha é um secret `ADMIN_WHATSAPP_KEY` do Worker, com pelo menos 32 caracteres, e não faz parte do Git nem do frontend.
- **Sair:** usar **Bloquear configuração** ou recarregar a página. O navegador descarta a senha e remove os campos administrativos.

## Implantação

Execute os comandos na raiz do repositório, com Node.js 24:

```sh
npm ci
npx wrangler login
npm run cloudflare:migrate
npm --prefix frontend ci
npm --prefix frontend run build
npm run cloudflare:deploy
npx wrangler secret put ADMIN_WHATSAPP_KEY --config cloudflare/wrangler.jsonc
```

O arquivo `cloudflare/wrangler.jsonc` aponta para o banco criado na conta proprietária. Em outra conta, crie outro banco D1 e ajuste `account_id` e `database_id`. A migração cadastra as 103 escolas e os seis destinatários com números inicialmente vazios. Não importa nem apaga registros do MySQL local.

No Pages, mantenha `frontend/dist` como saída e o comando `npm --prefix frontend ci && npm --prefix frontend run build:demo`. Configure **somente no ambiente de produção**:

```text
API_ORIGIN=https://escola-notificacao-api.rafanathur.workers.dev
VITE_SHARED_BACKEND=true
```

`VITE_SHARED_BACKEND=true` transforma esse build em cliente do backend compartilhado. Prévias e demonstrações sem essa variável continuam usando dados locais ao navegador. O diretório `functions` precisa acompanhar a publicação do Pages. Não coloque a senha em variáveis `VITE_`.

Após mudanças, gere o frontend e publique novamente o Worker com `npm run cloudflare:deploy`. O push em `main` atualiza o Pages pela integração Git. O Worker da API tem configuração separada, portanto o push sozinho não o atualiza.

## Dados e anexos

Ocorrência, anexo e avisos são inseridos por um único batch transacional do D1. Um erro desfaz todas as inserções. PDFs de até 5 MB são armazenados em partes de 512 KB, respeitando o limite de 2 MB por BLOB do D1. As consultas retornam apenas metadados; o download recompõe os bytes originais. O modelo de domínio mostra um único anexo, mesmo quando o armazenamento usa partes.

O MySQL e os dados da antiga demonstração continuam separados. Os dados locais do navegador não são enviados ao novo banco automaticamente.

## WhatsApp

O cadastro de números funciona antes de ativar a Meta. `WHATSAPP_ENABLED=false` mantém o envio desativado. Para ativá-lo, forneça `WHATSAPP_TOKEN` como secret do Worker; configure `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_TEMPLATE` e `WHATSAPP_TEMPLATE_LANGUAGE` em `vars`. Mantenha `APP_PUBLIC_URL` no endereço público do Pages. Depois de habilitar o remetente e aprovar o modelo com cinco parâmetros descrito em [whatsapp.md](whatsapp.md), altere `WHATSAPP_ENABLED` para `true` e publique o Worker.

O cron verifica até seis avisos por minuto. A tomada condicional de cada item impede processamento duplicado. Falhas ou resultados incertos não são reenviados automaticamente. O sistema somente envia avisos; não recebe respostas nem confirma entrega no aparelho.

## Verificação

```sh
npm test
npm --prefix frontend run build
npm run cloudflare:dev
```

Para testar o ADM localmente, coloque o secret em `cloudflare/.dev.vars`, ignorado pelo Git. Execute antes as migrações com `npx wrangler d1 migrations apply DB --local --config cloudflare/wrangler.jsonc`. Os testes de D1 usam SQLite isolado e validam transações, PDF de 5 MB, proteção ADM e concorrência da fila. Não alteram o banco publicado.

Referências: [D1 e batches transacionais](https://developers.cloudflare.com/d1/worker-api/d1-database/), [limites do D1](https://developers.cloudflare.com/d1/platform/limits/), [cron do Worker](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
