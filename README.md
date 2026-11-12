# Cardápio Musical

Aplicação web mobile-first para músicos organizarem apresentações e receberem pedidos por uma página pública acessada via QR code. As regras de produto estão em [AGENTS.md](./AGENTS.md); trate-as como invariantes.

## Requisitos locais

- Node.js 20.9 ou superior.
- Projeto Supabase para autenticação e banco PostgreSQL.

## Preparar o ambiente

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local`.
3. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os dados do projeto Supabase.
4. Preencha `SUPABASE_SERVICE_ROLE_KEY` e `REQUEST_TOKEN_SECRET` no servidor. Nunca exponha essas duas chaves com prefixo `NEXT_PUBLIC_`.
5. Aplique as migrations de `supabase/migrations/` em ordem no projeto Supabase de desenvolvimento.
6. Inicie o ambiente local com `npm run dev`.

## Páginas e papéis

| Quem acessa | Páginas principais | O que faz |
| --- | --- | --- |
| Visitante | `/m/[slug]`, pelo QR code, e `/m/[slug]/musicas` | Pesquisa o catálogo aprovado por gênero e consulta o repertório do cantor. Só pode pedir músicas do repertório, sem login. |
| Músico | `/painel`, `/painel/repertorio` e `/painel/apresentacoes` | Com licença ativa, gerencia perfil, apresentação, repertório, QR code e pedidos. Consulta o histórico de apresentações e abre cifras aprovadas em uma página individual. |
| Equipe administrativa | `/admin`, `/admin/licencas` e `/admin/catalogo` | Convida músicos, controla licenças anuais e mantém o catálogo central autorizado. O acesso vem do perfil `admin`, sem depender da licença de músico. |

A página inicial (`/`) explica as três áreas. Músicos e administradores usam o mesmo login em `/entrar`; o sistema envia cada um à sua área. `/demo` mostra um painel de músico fictício e `/demo/publico` mostra a prévia da página aberta pelo QR code. As prévias não enviam pedidos nem recebem pagamentos.

## Contas de músicos

O cadastro público está desativado por decisão do produto. Um administrador autenticado pode convidar músicos em `/admin/licencas` depois de validar internamente o acesso. O convite usa `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor; o músico confirma o convite e define sua própria senha. O gatilho do banco cria o perfil e uma licença anual pendente. A equipe libera o painel pelo controle interno de licenças.

Antes de enviar convites, mantenha desativados os cadastros abertos em Supabase Auth e configure o **Site URL** do Supabase para corresponder a `NEXT_PUBLIC_SITE_URL`. Nos modelos de e-mail do Supabase, use estes links:

- **Invite user:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
- **Reset Password:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

Essas rotas mostram uma confirmação antes de validar o token. A página `/recuperar-senha` envia o e-mail de recuperação. O envio depende do provedor de e-mail configurado no Supabase; configure SMTP próprio antes de uso em produção.

As prévias `/demo` e `/demo/publico` funcionam com ou sem Supabase configurado. Elas usam conteúdo sintético e não dependem de um perfil real no banco.

## Acesso administrativo

Um administrador precisa receber `app_metadata.role = admin` no Supabase Auth e entrar novamente. O login abre `/admin`, que dá acesso à gestão de licenças e ao catálogo. A conta administrativa não precisa de licença anual de músico.

O catálogo central ainda não recebe músicas iniciais. Não adicione letras, cifras ou arranjos sem registrar a referência e os termos da autorização e concluir a revisão. Apenas músicas aprovadas e com autorização vigente podem ser consultadas. A cifra completa só é concedida a usuários autenticados; o público recebe apenas título, artista e gênero. A migração `202610060001_catalog_genres.sql` adiciona o gênero principal; músicas anteriores ficam como “Não informado” até a equipe classificá-las em `/admin/catalogo`.

### Importação do catálogo

Em `/admin/catalogo/importar`, a equipe envia o [modelo CSV](./public/modelo-catalogo.csv) preenchido e até dez cifras `.txt` em UTF-8 por lote. O CSV usa ponto e vírgula. Compositores ficam vazios e a versão interna recebe “Original”. `arquivo_txt` é opcional; quando preenchido, deve corresponder exatamente ao nome de um TXT enviado. `referencia_autorizacao` e `autorizacao` também podem ficar vazios na importação, pois serão exigidos na publicação. A validade, quando informada, usa `AAAA-MM-DD`. A prévia aponta campos inválidos, TXT ausentes quando referenciados e possíveis duplicatas; se houver erro, o lote inteiro é bloqueado. A importação grava todas as músicas como `pending`, fora do catálogo público.

Em `/admin/catalogo/musicbrainz`, a equipe pode buscar um artista no MusicBrainz, selecionar gravações ou importar todas as páginas do artista como rascunhos privados. A importação completa processa 25 gravações por vez, mostra o progresso e pode ser pausada ou retomada no mesmo navegador após uma falha. A busca usa a API pública no servidor, sem OAuth ou chave de API, e reserva intervalos de pelo menos 1,1 segundo entre chamadas para respeitar o limite do serviço. Registros repetidos são ignorados. A migração `202610100001_musicbrainz_metadata_drafts.sql` permite que rascunhos permaneçam sem cifra, mas exige cifra antes da aprovação. Complete o TXT e a autorização documentada na fila de revisão; metadados do MusicBrainz não autorizam a publicação de uma cifra.

Para importar listas inteiras sem abrir o navegador, use o script `scripts/importar-artistas.mts`, que aplica as mesmas regras da tela acima. Ele lê uma lista Markdown (`lista-artistas-sertanejo.md`, `lista-artistas-mpb.md`), identifica cada artista desmarcado (`- [ ]`) no MusicBrainz, importa todas as gravações como rascunhos `pending` e marca `[X]` ao concluir cada artista. O script usa `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do `.env`/`.env.local` e registra como responsável (`created_by`) o único usuário com `app_metadata.role = 'admin'` ou o definido em `IMPORT_ADMIN_EMAIL`. O intervalo entre chamadas é reservado pela mesma função do banco usada pela tela, então as duas podem rodar ao mesmo tempo.

```bash
npm run importar:mpb                      # ou importar:sertanejo
npm run importar:artistas -- lista.md --genero "Samba"
npm run importar:artistas -- lista-artistas-mpb.md --simular   # só identifica os artistas, sem gravar
npm run importar:artistas -- lista-artistas-mpb.md --genero MPB --artista "Djavan"
```

Interromper e rodar de novo é seguro: duplicatas são ignoradas pelo banco e o artista só é marcado depois de concluído. Quando o nome não for encontrado ou houver homônimos, o script lista os candidatos e pula o artista; anote o identificador correto na linha (`- [ ] Simone <!-- mbid: ... -->`) e rode de novo.

Cada item pendente aparece no catálogo administrativo. A equipe pode validar os dados de até 100 músicas por página de uma vez, sem cifra ou documentação de direitos, usando o filtro **Dados a revisar**. A revisão individual permite corrigir título, artista e gênero, além de adicionar uma cifra TXT opcional. A validação dos dados mantém o registro privado. A migração `202610100002_catalog_metadata_review.sql` adiciona esse controle independente da publicação e permite publicar músicas sem cifra. Para publicar, use a tela separada **Publicação** e registre a autorização documentada para os dados da música e, quando houver, para a cifra. A migração `202610060002_catalog_song_audit.sql` bloqueia novas duplicatas por título, artista e versão e registra criação, edição e mudança de estado com o administrador responsável. A migração `202610060003_simplify_catalog_rights.sql` substitui o antigo campo de origem pela referência da autorização e remove a coluna de território e seus filtros. Como o campo anterior podia conter apenas uma origem sem licença, a migração coloca músicas já aprovadas em estado pendente para nova revisão. Aplique as migrations em ordem antes de usar a importação e a revisão.

A migração `202611100001_catalog_duplicate_index.sql` troca a verificação de duplicatas exatas por um índice único (antes, cada inserção percorria o catálogo inteiro). A migração `202611100002_catalog_duplicate_cleanup.sql` adiciona ferramentas para remover duplicatas aproximadas depois de uma importação em massa. Essas duplicatas ignoram acentos, maiúsculas e pontuação, sufixos de versão no título ("(Ao Vivo)", "- Remastered 2011", "(feat. X)") e participações no artista ("feat.", "part."). Créditos conjuntos como "A & B" continuam distintos. No SQL Editor do Supabase:

```sql
select * from private.remove_catalog_duplicates();               -- só contagem, não apaga
select * from private.catalog_song_duplicates
  order by dedupe_key, group_rank limit 200;                      -- grupos: keep / remove / review
select * from private.remove_catalog_duplicates(true);           -- apaga um lote de até 5.000; repita até removed = 0
vacuum analyze public.catalog_songs;
```

Em cada grupo, fica o registro mais completo: aprovado, com cifra, com autorização, em uso, revisado e com o título mais curto. Só são apagados rascunhos pendentes sem cifra, sem autorização e fora de repertórios e pedidos. Os demais aparecem como `review` para decisão manual. Cada remoção fica no histórico da música mantida como "Duplicata mesclada".

### Limpeza dos metadados importados

Desde a migração `202611110001_catalog_metadata_cleanup.sql`, a importação (script e tela) já grava títulos sem sufixos de versão ("Sozinho (Ao Vivo)" → "Sozinho"), tira participações do artista ("A feat. B" → "A"), usa " & " quando o MusicBrainz não informa separador entre dois artistas e pula gravações com mais de 3 artistas e medleys. As regras ficam em `src/lib/catalog/recording-metadata.ts`. Para corrigir o que já foi importado, rode no SQL Editor, nesta ordem:

```sql
select * from private.remove_catalog_duplicates(true);    -- repita até removed = 0
select * from private.clean_catalog_metadata();           -- prévia: coletivas/medleys e títulos a renomear
select * from private.clean_catalog_metadata(true);       -- um lote; repita até removed e renamed = 0
select * from private.remove_catalog_duplicates(true);    -- resolve os blocked_renames que sobrarem
select * from private.catalog_artist_suspects;            -- nomes colados, ex.: "JobimVinicius"
select * from private.rename_catalog_artist('Nome Errado', 'Nome Certo');
vacuum analyze public.catalog_songs;
```

`clean_catalog_metadata` só altera rascunhos intocados: pendentes, sem cifra, sem autorização, nunca validados e fora de repertórios e pedidos. Remoções e renomeações ficam no histórico (`catalog_song_audit`). A lista de nomes suspeitos também traz nomes reais como "BaianaSystem": confira antes de renomear.

### Recorte das mais conhecidas

`npm run marcar:populares` marca em `catalog_songs.popularity_rank` as músicas mais ouvidas de cada artista das listas, pela contagem de execuções do ListenBrainz. O script não aprova nem publica nada. O recorte aparece no filtro **Mais conhecidas** de `/admin/catalogo`. O ListenBrainz exige um token gratuito: crie uma conta, copie o token em https://listenbrainz.org/settings/ e defina `LISTENBRAINZ_TOKEN` no `.env.local`.

```bash
npm run marcar:populares -- lista-artistas-mpb.md lista-artistas-sertanejo.md --simular   # mostra as mais ouvidas, sem gravar
npm run marcar:populares -- lista-artistas-mpb.md lista-artistas-sertanejo.md --top 30
```

Cada execução recalcula o recorte inteiro, então passe todas as listas juntas. Rode depois da limpeza: a correspondência é feita pela mesma chave das duplicatas (título e artista sem acentos, sufixos e participações), e gravações que ficaram de fora da importação não são marcadas.

### Publicação em lote das mais conhecidas

No filtro **Mais conhecidas** de `/admin/catalogo` (100 músicas por página):

1. **Selecionar dados a validar** → **Validar dados**. Isso confirma título, artista e gênero e mantém as músicas privadas.
2. **Selecionar prontas para publicar**, marcar a confirmação → **Publicar**. As músicas recebem a autorização de metadados factuais (Decisão interna nº 1/2026, válida até 11/11/2027, texto em `src/lib/catalog/metadata-authorization.ts`).

O servidor só publica músicas pendentes, com dados validados, do recorte e sem cifra. Músicas com cifra precisam da publicação individual com a autorização da cifra. Depois de 11/11/2027, o catálogo público esconde essas músicas automaticamente e a publicação em lote fica bloqueada até uma nova decisão. O botão **Retirar todas publicadas com esta autorização** tira todas do público de uma vez, marcando-as como contestadas.

## Limites desta etapa

As decisões e a sequência para a integração real estão em [PAGAMENTOS.md](./PAGAMENTOS.md).

- Pedidos públicos gratuitos são criados por uma função de servidor, que valida apresentação ativa, licença, repertório e estado dos direitos. O banco aplica um limite inicial de cinco pedidos por navegador assinado a cada dez minutos e bloqueia pedidos repetidos da mesma música por dois minutos. Esse limite reduz duplicações e rajadas simples; uma camada de proteção contra bots deve ser definida antes de divulgação pública em grande escala.
- O navegador recebe um cookie assinado de visitante sem nome, telefone ou e-mail obrigatório. Revise retenção e política de privacidade antes do lançamento público.
- Pedidos pagos têm confirmação simulada apenas no ambiente de desenvolvimento; não há cobrança real. Divisão de valores, cálculo tributário e reembolsos ainda não estão integrados. Em produção, pedidos pagos permanecem indisponíveis.
- A migration `202610100003_payment_provider_foundation.sql` e `src/lib/payments/pagarme.ts` preparam registros privados e um adaptador Pagar.me v5 restrito à chave de teste. O checkout público e a confirmação real continuam desligados até habilitação PSP/split, definição fiscal, política de estorno e dados exigidos do comprador. Não coloque chave de produção no `.env` nesta etapa.
- A licença anual é controlada internamente; o produto não cobra a licença.
- As prévias em `/demo` e `/demo/publico` são fictícias e não persistem pedidos.
