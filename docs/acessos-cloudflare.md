# Contagem de acessos no Cloudflare

O contador global deve ficar no **Cloudflare Web Analytics**, protegido pelo login e pelas permissões da conta do administrador. Não existe um papel ADM na aplicação atual. Esconder um contador em uma tela local não criaria proteção de acesso.

## Habilitar no projeto existente

1. Abra o [projeto escola-notificacao](https://dash.cloudflare.com/4f629e0de9a41d35b1e4d2bbb042738e/pages/view/escola-notificacao) com a conta proprietária.
2. Em **Metrics**, encontre **Web Analytics** e clique em **Enable**.
3. Publique novamente o projeto depois de habilitar. O Cloudflare insere o script de medição automaticamente no HTML da próxima implantação.
4. Abra [Web Analytics da conta](https://dash.cloudflare.com/4f629e0de9a41d35b1e4d2bbb042738e/web-analytics), selecione o site e consulte visitas, visualizações de página e o período desejado. Os dados podem levar alguns minutos para aparecer.

O link público de teste é [escola-notificacao.pages.dev](https://escola-notificacao.pages.dev/). O UML está em [uml.html](https://escola-notificacao.pages.dev/uml.html).

## Interpretação das métricas

- Uma requisição de arquivo não equivale a uma visita: a página pode carregar CSS, scripts, fontes e imagens em várias requisições.
- Web Analytics mede acessos pelo navegador; bloqueadores e falhas de conexão podem impedir o envio.
- Registros de ocorrências, descrições e conteúdo dos anexos não precisam ser enviados ao serviço de analytics.
- Nenhum contador em `localStorage` é apresentado como total global. O armazenamento da demonstração pertence a cada navegador.
- A aplicação não contém tokens administrativos do Cloudflare. O acesso às métricas depende da autenticação no Cloudflare.

## Estado da configuração

Web Analytics foi habilitado na conta proprietária para o projeto `escola-notificacao`. A nova implantação permite a inserção automática do beacon pelo Cloudflare. A verificação operacional deve conferir o script `static.cloudflareinsights.com/beacon.min.js` no HTML publicado e o envio de eventos ao serviço de medição. Uma publicação bem-sucedida do site, sozinha, não comprova a entrega dos eventos.

Referências oficiais: [Web Analytics no Pages](https://developers.cloudflare.com/pages/how-to/web-analytics/) e [Configurar Web Analytics](https://developers.cloudflare.com/web-analytics/get-started/).
