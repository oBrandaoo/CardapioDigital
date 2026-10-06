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
| Visitante | `/m/[slug]`, pelo QR code | Vê o repertório disponível e pede uma música sem login. |
| Músico | `/painel` e `/painel/repertorio` | Com licença ativa, gerencia perfil, apresentação, repertório, QR code e pedidos. Abre cifras aprovadas em uma página individual. |
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

O catálogo central ainda não recebe músicas iniciais. Não adicione letras, cifras ou arranjos sem registrar origem, autorização, território e revisão. Apenas músicas aprovadas e válidas no Brasil podem ser consultadas. A cifra completa só é concedida a usuários autenticados; o público recebe apenas título e artista.

## Limites desta etapa

- Pedidos públicos gratuitos são criados por uma função de servidor, que valida apresentação ativa, licença, repertório e estado dos direitos. O banco aplica um limite inicial de cinco pedidos por navegador assinado a cada dez minutos e bloqueia pedidos repetidos da mesma música por dois minutos. Esse limite reduz duplicações e rajadas simples; uma camada de proteção contra bots deve ser definida antes de divulgação pública em grande escala.
- O navegador recebe um cookie assinado de visitante sem nome, telefone ou e-mail obrigatório. Revise retenção e política de privacidade antes do lançamento público.
- Pedidos pagos têm confirmação simulada apenas no ambiente de desenvolvimento; não há cobrança real. Divisão de valores, cálculo tributário e reembolsos ainda não estão integrados. Em produção, pedidos pagos permanecem indisponíveis.
- A licença anual é controlada internamente; o produto não cobra a licença.
- As prévias em `/demo` e `/demo/publico` são fictícias e não persistem pedidos.
