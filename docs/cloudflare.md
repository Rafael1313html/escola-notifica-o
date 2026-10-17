# Publicação do sistema no Cloudflare

O frontend do projeto `escola-notificacao` usa Cloudflare Pages. As Pages Functions encaminham `/api/*` ao Worker `escola-notificacao-api`. O Worker grava os dados no banco D1 `escola-notificacao`; o cron do mesmo Worker processa a fila de avisos a cada minuto.

## Acessos

- **Escola:** registrar uma ocorrência e receber seu protocolo. Não pode consultar histórico, indicadores, relatórios ou documentos de nenhuma escola, nem editar ou excluir registros.
- **Responsáveis:** Marcela, Alexandra, Susana, Mercia, Monica e Camila recebem links pessoais após cadastrar seus números. Um link válido libera consulta de todas as ocorrências, documentos, indicadores e relatórios da rede. Não permite alterar ou excluir registros nem configurar números.
- **ADM:** clicar em **ADM** e informar a senha. Pode consultar a rede, editar e apagar registros, configurar os seis números e gerar links pessoais nos detalhes de uma ocorrência. A senha é um secret `ADMIN_WHATSAPP_KEY` do Worker, com pelo menos 32 caracteres, fora do Git e do frontend.
- **Links pessoais:** assinatura HMAC-SHA256, validade de sete dias e versão do cadastro do destinatário. A API confere assinatura, prazo e número ativo a cada consulta. Alterar ou remover um número revoga seus links anteriores; trocar a senha ADM revoga todos. O link é uma credencial de consulta da rede: encaminhá-lo também permite acesso a quem o recebe. Compartilhe apenas com o responsável indicado.
- **Sair:** usar **Sair do acesso**, **Bloquear configuração** ou recarregar a página. O navegador descarta credenciais e dados privados. Para entrar novamente, o responsável reabre o link original; o ADM informa a senha. A credencial do link é retirada da URL antes do carregamento de recursos externos e não fica em armazenamento do navegador.

O cadastro continua público, mas todas as consultas são autorizadas no servidor, inclusive PDFs, exportações e indicadores. Ocultar abas não concede nem substitui autorização. Os endpoints `PATCH /api/admin/ocorrencias/:id` e `DELETE /api/admin/ocorrencias/:id` exigem senha ADM. A edição valida novamente os campos e preserva o documento; a exclusão remove o registro, documento e avisos vinculados. Alterar ou excluir um registro não dispara mensagens adicionais.

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

Com o Worker local na porta 8787, execute `npm run test:cloudflare`. Esse teste abre Chrome em desktop e celular, verifica os três perfis e testa edição e exclusão pelo ADM. Os registros de teste e a configuração temporária são removidos ou restaurados ao terminar. Ele usa somente o banco local.

Referências: [D1 e batches transacionais](https://developers.cloudflare.com/d1/worker-api/d1-database/), [limites do D1](https://developers.cloudflare.com/d1/platform/limits/), [cron do Worker](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
