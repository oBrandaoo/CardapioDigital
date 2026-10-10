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

Cada item pendente aparece no catálogo administrativo. A equipe pode validar os dados de até 30 músicas por página de uma vez, sem cifra ou documentação de direitos, usando o filtro **Dados a revisar**. A revisão individual permite corrigir título, artista e gênero, além de adicionar uma cifra TXT opcional. A validação dos dados mantém o registro privado. A migração `202610100002_catalog_metadata_review.sql` adiciona esse controle independente da publicação e permite publicar músicas sem cifra. Para publicar, use a tela separada **Publicação** e registre a autorização documentada para os dados da música e, quando houver, para a cifra. A migração `202610060002_catalog_song_audit.sql` bloqueia novas duplicatas por título, artista e versão e registra criação, edição e mudança de estado com o administrador responsável. A migração `202610060003_simplify_catalog_rights.sql` substitui o antigo campo de origem pela referência da autorização e remove a coluna de território e seus filtros. Como o campo anterior podia conter apenas uma origem sem licença, a migração coloca músicas já aprovadas em estado pendente para nova revisão. Aplique as migrations em ordem antes de usar a importação e a revisão.

## Limites desta etapa

As decisões e a sequência para a integração real estão em [PAGAMENTOS.md](./PAGAMENTOS.md).

- Pedidos públicos gratuitos são criados por uma função de servidor, que valida apresentação ativa, licença, repertório e estado dos direitos. O banco aplica um limite inicial de cinco pedidos por navegador assinado a cada dez minutos e bloqueia pedidos repetidos da mesma música por dois minutos. Esse limite reduz duplicações e rajadas simples; uma camada de proteção contra bots deve ser definida antes de divulgação pública em grande escala.
- O navegador recebe um cookie assinado de visitante sem nome, telefone ou e-mail obrigatório. Revise retenção e política de privacidade antes do lançamento público.
- Pedidos pagos têm confirmação simulada apenas no ambiente de desenvolvimento; não há cobrança real. Divisão de valores, cálculo tributário e reembolsos ainda não estão integrados. Em produção, pedidos pagos permanecem indisponíveis.
- A licença anual é controlada internamente; o produto não cobra a licença.
- As prévias em `/demo` e `/demo/publico` são fictícias e não persistem pedidos.
