# Cardápio Musical

Aplicação web mobile-first para músicos organizarem uma apresentação e receberem pedidos gratuitos por uma página pública acessada via QR code. As regras de produto estão em [AGENTS.md](./AGENTS.md); trate-as como invariantes.

## Requisitos locais

- Node.js 20.9 ou superior.
- Projeto Supabase para autenticação e banco PostgreSQL.

## Preparar o ambiente

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local`.
3. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os dados do projeto Supabase.
4. Preencha `SUPABASE_SERVICE_ROLE_KEY` e `REQUEST_TOKEN_SECRET` no servidor. Nunca exponha essas duas chaves com prefixo `NEXT_PUBLIC_`.
5. Aplique `supabase/migrations/202610040001_initial_schema.sql` no projeto Supabase.
6. Inicie o ambiente local com `npm run dev`.

## Contas de músicos

O cadastro público está desativado por decisão do produto. Um administrador autenticado pode convidar músicos em `/admin/licencas` depois de validar internamente o acesso. O convite usa `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor; o músico confirma o convite e define sua própria senha. O gatilho do banco cria o perfil e uma licença anual pendente. A equipe libera o painel pelo controle interno de licenças.

Antes de enviar convites, mantenha desativados os cadastros abertos em Supabase Auth e configure o **Site URL** do Supabase para corresponder a `NEXT_PUBLIC_SITE_URL`. Nos modelos de e-mail do Supabase, use estes links:

- **Invite user:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
- **Reset Password:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

Essas rotas mostram uma confirmação antes de validar o token. A página `/recuperar-senha` envia o e-mail de recuperação. O envio depende do provedor de e-mail configurado no Supabase; configure SMTP próprio antes de uso em produção.

Sem Supabase configurado, a página inicial, `/demo` e o perfil de demonstração `/m/banda-mare` continuam disponíveis. Eles não usam músicas ou cifras protegidas.

## Acesso administrativo

Um administrador precisa receber `app_metadata.role = admin` no Supabase Auth e entrar novamente. A área `/admin/licencas` permite ativar, suspender e controlar a validade anual internamente; `/admin/catalogo` mantém o acervo autorizado.

O catálogo central ainda não recebe músicas iniciais. Não adicione letras, cifras ou arranjos sem registrar origem, autorização, território e revisão. Apenas músicas aprovadas e válidas no Brasil podem ser consultadas. A cifra completa só é concedida a usuários autenticados; o público recebe apenas título e artista.

## Limites desta etapa

- Pedidos públicos gratuitos são criados por uma função de servidor, que valida apresentação ativa, licença, repertório e estado dos direitos. O banco aplica um limite inicial de cinco pedidos por navegador assinado a cada dez minutos e bloqueia pedidos repetidos da mesma música por dois minutos. Esse limite reduz duplicações e rajadas simples; uma camada de proteção contra bots deve ser definida antes de divulgação pública em grande escala.
- O navegador recebe um cookie assinado de visitante sem nome, telefone ou e-mail obrigatório. Revise retenção e política de privacidade antes do lançamento público.
- Pedidos pagos, divisão de valores, cálculo tributário e reembolsos não estão integrados. O fluxo de pedidos atual aceita apenas músicas gratuitas.
- A licença anual é controlada internamente; o produto não cobra a licença.
- A prévia em `/demo` é fictícia e não persiste pedidos.
