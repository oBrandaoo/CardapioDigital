# Instruções do projeto — Cardápio Musical

Estas regras registram decisões de produto do Cardápio Musical. Trate a seção **Regras imutáveis do produto** como requisitos obrigatórios. Não as remova, enfraqueça, contorne ou altere por conveniência técnica, refatoração ou inferência. Só altere uma regra quando o usuário pedir explicitamente a mudança daquela regra. Se uma solicitação entrar em conflito com uma regra, pare o trabalho dependente e peça esclarecimento; não escolha silenciosamente qual instrução prevalece.

## Regras imutáveis do produto

1. **Produto web responsivo, mobile-first.** O público acessa a página pública do músico/apresentação por QR code, sem login. O músico entra em uma área autenticada. Aplicativos nativos não fazem parte do escopo inicial.
2. **Catálogo centralizado.** Músicas e cifras vêm de um catálogo central mantido pela plataforma em seu próprio banco de dados. O músico seleciona músicas desse catálogo para seu repertório/apresentação. Não depender de uma API externa de cifras em tempo de uso e não substituir o catálogo central por cadastros isolados de cada músico.
   - Cada cifra será armazenada como texto simples (TXT) no banco central e vinculada ao cadastro da música correspondente. A carga e o gerenciamento do acervo serão implementados em uma etapa posterior.
3. **Acervo inicial pequeno e autorizado.** No início, publicar apenas músicas/cifras revisadas cuja origem e autorização de uso estejam documentadas. Não fazer scraping, copiar cifras de sites públicos ou presumir que algo pode ser republicado por estar disponível na internet.
4. **Sem áudio no produto inicial.** O produto pode exibir informações de música e cifras aprovadas, mas não toca, transmite nem hospeda gravações. A ausência de áudio não prova que a exibição de letras, partituras, cifras ou arranjos esteja autorizada; bloqueie a publicação de conteúdo sem situação de direitos aprovada.
5. **Pedidos avulsos.** Cada pedido pago é uma cobrança própria. Não implementar carteira, saldo pré-pago ou créditos acumulados no MVP.
6. **Gratuito ou até R$ 5 por pedido.** O músico pode deixar pedidos gratuitos ou definir cobrança por música até o limite de R$ 5 por pedido. Validar o limite no servidor; nunca confiar apenas no preço enviado pelo navegador.
7. **Divisão igual nos pedidos pagos.** Depois de descontados os impostos aplicáveis, dividir o valor-base restante igualmente: 50% para a plataforma e 50% para o músico. A definição de quais tributos incidem, como são apurados e como são alocados deve ser validada por orientação contábil antes de implementar cálculos fiscais. Tarifas do provedor de pagamento não são impostos; o tratamento dessas tarifas, reembolsos e chargebacks ainda precisa de decisão explícita. Não confundir nem combinar essas deduções.
8. **Licença anual separada e sob controle interno.** A plataforma vende ao músico uma licença anual do software. O sistema registra e controla internamente o estado e o período da licença; ela não entra na divisão 50/50 dos pedidos musicais. Não implementar cobrança integrada ou renovação automática da licença sem decisão explícita do usuário. A forma de cobrança da licença permanece em aberto.
9. **Acesso condicionado à licença.** Conceder ou renovar o período de acesso conforme o estado da licença registrado internamente e confirmado pelo processo administrativo definido pela plataforma. Manter o controle da licença separado dos pagamentos de pedidos, inclusive no banco de dados e nos relatórios.
10. **Confirmação confiável de pagamentos.** O estado pago deve vir de webhook validado e/ou consulta autenticada ao provedor. Não liberar pedido pago, comissão ou licença com base apenas no retorno do navegador. Processar notificações de forma idempotente.
11. **Provedor de pagamento ainda não está fechado.** A integração precisa suportar divisão de um pagamento entre a plataforma e o músico. Mercado Pago é uma opção a avaliar, não uma escolha irreversível. Antes de codificar a integração, confirmar elegibilidade, meios de pagamento, tarifas e comportamento do split.
12. **Contas de músicos provisionadas internamente.** A equipe da plataforma cria as contas de músicos depois de validar internamente o acesso. Não oferecer cadastro público ou autoatendimento de contas. A criação da conta não substitui a ativação interna da licença anual.

## Direitos e dados do catálogo

- Para cada item, guardar pelo menos título, artista/compositores quando conhecidos, origem, versão, estado de revisão, base/autorização de uso, território e eventuais limites de exibição.
- Somente itens aprovados podem ser consultados pelo público. Itens pendentes, expirados, contestados ou sem autorização documentada permanecem privados e não entram em pedidos públicos.
- Uma licença para tocar uma música ao vivo não deve ser presumida como licença para armazenar e exibir sua cifra/letra na plataforma. A equipe deve tratar essas utilizações separadamente e encaminhar dúvidas de direitos ao usuário para validação apropriada.
- Autorização e pagamento não são sinônimos: não presumir que sempre existe uma taxa fixa por música, nem que o uso é gratuito. Registrar os termos efetivos da autorização/licença concedida para cada conteúdo.
- Se os direitos de uma música não estiverem claros, não inventar autorização nem publicar o conteúdo: sinalizar o bloqueio e continuar com itens aprovados.
- Para demonstrações locais, podem ser usados apenas exercícios harmônicos sintéticos criados para o projeto, claramente identificados e sem letras, gravações ou associação com obras de terceiros. Não usar esses dados de teste como catálogo de produção.

## Segurança e acesso

- Visitantes podem ler somente páginas públicas e itens aprovados necessários ao fluxo.
- Músicos só podem administrar seu perfil, repertório, apresentações e pedidos autorizados para sua conta.
- Edições do catálogo central são administrativas e auditáveis; o público e músicos não podem alterar a fonte oficial do catálogo.
- Aplicar autorização no servidor e no banco (incluindo RLS se Supabase/Postgres for usado). Segredos do provedor e credenciais privilegiadas nunca vão para o navegador.
- Validar preço, estado da apresentação, disponibilidade da música e limites de pedido no servidor. Proteger criação de pedido público contra abuso e duplicação.

## Arquitetura e decisões ainda abertas

- A recomendação inicial é uma aplicação web em monólito modular, banco relacional e serviços gerenciados. Next.js/TypeScript e Supabase/PostgreSQL são opções recomendadas, mas ainda não foram aprovadas como regras imutáveis; confirmar antes de iniciar implementação que as dependa.
- Não introduzir microserviços, aplicativo nativo, saldo pré-pago, reprodução de áudio, catálogo ilimitado ou cobrança automática sem pedido explícito do usuário.
- A razão 50/50 após impostos está definida. Quais impostos incidem e como calculá-los exige validação contábil; o tratamento de tarifas do provedor, reembolsos e chargebacks continua pendente.
- Um pagamento simulado pode existir somente em desenvolvimento local, deve ter estado próprio distinto de `paid` e não representa cobrança, repasse ou confirmação de provedor. Não habilitar essa simulação em produção.
- A licença anual será controlada internamente. A forma de cobrança/registro de pagamento da licença continua pendente; não presumir checkout integrado.
- Contas de músicos são criadas pela equipe após validação interna. Manter o cadastro aberto desativado no provedor de autenticação e não reintroduzir auto cadastro público sem pedido explícito do usuário.
- A origem/licença e o volume do catálogo inicial continuam pendentes. Estimativas de software não incluem obtenção de direitos, pagamentos de royalties, transcrição, revisão editorial nem carga em massa do acervo.
- O tratamento de reembolso/cancelamento de pedido e a política de pedidos pagos que o músico não consegue tocar ainda precisam ser definidos antes do fluxo de produção.

## Instruções de trabalho no terminal

@C:\Users\Rafael Brandão\.codex\RTK.md

Prefira os subcomandos filtrados do RTK para reduzir a saída de buscas, leituras, Git, npm e testes (`rtk rg`, `rtk read`, `rtk git`, `rtk npm`, `rtk test`). `rtk proxy` não comprime a saída: reserve-o para comandos sem filtro próprio ou quando precisar do resultado completo. Se a sandbox bloquear o executável, siga as permissões da sessão e use o comando original quando necessário.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
