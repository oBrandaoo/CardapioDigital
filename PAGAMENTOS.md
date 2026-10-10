# Integração de pagamentos — avaliação dos provedores

O fluxo atual cria um pedido por música e usa confirmação simulada apenas em desenvolvimento. Pedidos gratuitos entram diretamente na fila. Em produção, pedidos pagos ainda não têm checkout e não podem entrar na fila sem confirmação confiável do provedor.

## Pagar.me: split e custo dos pedidos pequenos

A [documentação do split v5](https://docs.pagar.me/docs/pedidos-com-split) confirma pedidos com mais de um recebedor, divisão por valor ou percentual e cadastro prévio dos recebedores e suas contas bancárias. Ela informa que o recurso está disponível apenas para clientes PSP. A [referência de Pix v5](https://docs.pagar.me/reference/pix-2) apresenta um pedido Pix com split, sujeito à habilitação da conta. A [documentação de recebedores](https://docs.pagar.me/reference/recebedores-1) exige dados cadastrais e descreve os estados de credenciamento dos músicos.

O **1% mostrado no exemplo** da documentação de split é a comissão fictícia do marketplace naquela venda, não uma tarifa anunciada pela Pagar.me. A [oferta pública](https://website.pagar.me/ofertas) informa, para o plano Essencial: Pix 0,99%, crédito à vista 4,19%, cartão em 6 vezes 13,63%, cartão em 12 vezes 20,95% e mensalidade gratuita. O recebimento anunciado é em um dia, com possível retenção de até 30 dias para novos vendedores durante análise. A mesma página lista o split no plano Flex, cujas taxas são **customizadas**; portanto, não usar as taxas Essencial como preço contratado de uma integração com split.

Em um pedido de R$ 5, as taxas percentuais Essencial corresponderiam aproximadamente a R$ 0,05 no Pix e R$ 0,21 no crédito à vista, antes de impostos e de eventuais condições adicionais. Parcelamento não faz sentido no pedido avulso de até R$ 5 e fica fora do caminho inicial. Solicitar proposta escrita para Pix com split: percentual e eventual valor fixo por transação, tarifa de recebedor/saque, antecipação, chargeback, estorno, prazo de liquidação e valor mínimo.

A [referência do split v5](https://docs.pagar.me/reference/split-1) permite definir qual recebedor suporta a tarifa de processamento, eventual centavo residual e responsabilidade por chargeback. Esses parâmetros precisam seguir uma decisão explícita da operação. A regra do produto continua sendo 50/50 **após os impostos aplicáveis**; tarifa do provedor deve ser registrada separadamente e não pode ser tratada como imposto. A contabilidade precisa definir a base tributária e como aplicar essa regra em centavos antes de fixar valores no pedido real.

**Caminho técnico candidato:** habilitar a conta PSP/Flex e recebedores, cobrar cada pedido por Pix com split, confirmar o pagamento por evento e consulta autenticada, e só então liberar o pedido ao músico. A elegibilidade, o contrato de tarifas e a política de estorno precisam estar fechados antes de ativar cobranças.

### Preparação implementada sem CNPJ ativo

A migration `202610100003_payment_provider_foundation.sql` reserva tabelas privadas para identificação dos recebedores, uma tentativa de pagamento por pedido e eventos do provedor. O registro de licença anual continua separado. Impostos, parcelas 50/50 e tarifa têm campos distintos; nenhuma parcela fiscal é preenchida automaticamente.

O módulo `src/lib/payments/pagarme.ts` contém chamadas servidor a servidor para criar um pedido Pix com dois recebedores e consultar um pedido pela API v5. Ele exige que o código chamador forneça valores de split explícitos e quem suporta tarifa e chargeback. O módulo aceita **somente chave de teste** (`sk_test_`) e ainda não é chamado pelo fluxo público. Não há cobrança, webhook ativo, coleta de dados pessoais ou alteração do estado `paid` nesta etapa.

Ao obter a conta, confirmar a modalidade PSP com Pix e split, cadastrar o recebedor da plataforma e cada músico, e obter a proposta Flex. A [API de pedidos v5](https://docs.pagar.me/reference/criar-pedido-2) exige os dados do comprador para PSP, inclusive endereço e telefone; a [referência de Pix](https://docs.pagar.me/reference/pix-2) também exige nome, e-mail, documento e telefone. Isso requer uma etapa de checkout e revisão da política de privacidade. Após fixar o cálculo fiscal em centavos, responsabilidade por tarifa/chargeback e política de pedidos não tocados, conectar o módulo ao fluxo, persistir o pedido externo e só confirmar o pagamento após consulta autenticada ao [pedido na Pagar.me](https://docs.pagar.me/reference/obter-pedido), processando eventos repetidos de forma idempotente. As [chaves de teste e produção](https://docs.pagar.me/reference/autentica%C3%A7%C3%A3o-2) usam o mesmo endpoint; a liberação de chave real exige uma alteração explícita no adaptador.

## InfinitePay: o que a documentação pública confirma

A [documentação oficial do Checkout Integrado](https://www.infinitepay.io/checkout-documentacao) descreve `POST /links` para gerar um checkout por pedido, com preço em centavos, `order_nsu`, URL de retorno e webhook. Ela também descreve `POST /payment_check` para conferir um pagamento com `handle`, `order_nsu`, `transaction_nsu` e `slug`. O retorno do navegador e o corpo do webhook não devem, isoladamente, mudar um pedido para `paid`; é preciso reconciliar a resposta do provedor com o pedido e o valor registrado no banco. A [Central de Ajuda](https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-integrado-da-infinitepay) confirma o fluxo de checkout integrado e o uso de webhook.

**Bloqueio atual:** não encontrei na documentação pública do checkout um parâmetro de split, vínculo de duas contas recebedoras ou regra de repasse automático para plataforma e músico na mesma transação. A documentação apresenta uma única InfiniteTag como vendedor. Isso não prova que a InfinitePay não ofereça split por contrato ou API privada; exige confirmação escrita e documentação técnica antes de integrar cobranças reais. Também é preciso confirmar o mecanismo de autenticação/assinatura para consulta e webhook, pois a página pública não o especifica.

Não substituir o split exigido pelo produto por uma cobrança integral na conta da plataforma seguida de Pix manual ou automático. Esse seria outro modelo operacional e financeiro, que depende de decisão explícita.

## Alternativa em avaliação: plataforma recebe e repassa depois

É tecnicamente possível cobrar o pedido na conta da plataforma e registrar um valor a pagar ao músico para posterior transferência. Isso **não é split do gateway** e muda o risco e a conciliação financeira. A [FAQ do Banco Central](https://www.bcb.gov.br/estabilidadefinanceira/faq-liquidacao-centralizada) distingue a plataforma que intermedeia uma venda e recebe/repassa ao vendedor da empresa que vende o serviço ao consumidor em nome próprio. A [Solução de Consulta Cosit nº 16/2020](https://normas.receita.fazenda.gov.br/sijut2consulta/anexoOutros.action?idArquivoBinario=55994) distingue, para serviços, receita de comissão na intermediação e receita sobre o valor integral quando a empresa organiza/presta o serviço em nome próprio. A classificação do Cardápio Musical depende dos contratos, notas e operação efetiva; não basta chamar a transferência de "repasse".

Antes de adotar esse modelo, definir com orientação jurídica e contábil: quem é o prestador perante o público; quem emite cada documento fiscal; qual parcela é receita da plataforma; tributos e eventuais retenções para músicos PF/PJ; quem suporta tarifas, estornos, chargebacks e pedidos não tocados; prazo e valor mínimo de repasse; e como tratar um saldo a pagar quando a conta da plataforma estiver bloqueada ou sem fundos. O [contrato de afiliação da InfinitePay](https://www.infinitepay.io/legal/contrato-de-afiliacao) identifica o cliente afiliado como responsável pela venda, pelos documentos fiscais e por disputas, e permite transferências a terceiros a partir da conta; isso não equivale, por si só, à aprovação do uso do Checkout Integrado para receber vendas de músicos e repassá-las. Confirmar o enquadramento com a InfinitePay.

Se aprovado, o software precisará de um razão de pagamentos e repasses por pedido: valor cobrado, identificação da transação, tarifa do provedor, base fiscal, imposto/retenção aplicável, parcela da plataforma, parcela do músico, vencimento do repasse, transferência, estorno/chargeback e conciliação. O cálculo deve usar centavos e a regra 50/50 **após os impostos aplicáveis**, sem confundir tarifas com impostos. A licença anual permanece isolada. Nenhum repasse deve ser criado a partir do retorno do navegador; o pagamento deve ser confirmado por consulta confiável ao provedor, e eventos repetidos devem ser idempotentes.

## O que falta decidir antes de integrar um gateway

1. Confirmar com a InfinitePay se há split de uma cobrança entre a plataforma e o músico, quais contas podem recebê-lo e como habilitar/testar a integração. Se não houver, escolher outro provedor compatível.
2. Definir os meios de pagamento do MVP e conferir tarifas e valor mínimo viável para pedidos de até R$ 5.
3. Validar com a contabilidade quais impostos incidem e como compõem a base da divisão 50/50. Definir separadamente quem arca com as tarifas do provedor.
4. Definir o tratamento de reembolsos, chargebacks e pedidos pagos que não forem tocados.

Essas decisões precisam resultar em uma regra de cálculo em centavos, incluindo arredondamento. A comissão do provedor, a comissão da plataforma e os impostos devem permanecer identificáveis separadamente nos registros e relatórios. A licença anual continua fora do fluxo de pedidos.

## Alternativa documentada: Mercado Pago Split 1:1

A [documentação oficial de pré-requisitos](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites) informa que o vendedor precisa cumprir identificação KYC 6 e autorizar a conexão por OAuth. O [fluxo de integração](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace) usa credenciais de cada vendedor e permite definir `marketplace_fee` no Checkout Pro ou `application_fee` no Checkout Transparente. A documentação descreve o desconto da tarifa do Mercado Pago do lado do vendedor antes da comissão do marketplace; esse comportamento precisa ser confrontado com a regra do produto antes de fixar valores de split. Ela também descreve limitações de reembolso que precisam entrar na política operacional.

O [Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/create-configuration) é uma opção de redirecionamento a avaliar primeiro, sujeito à confirmação dos meios disponíveis na conta. As [notificações Webhook](https://www.mercadopago.com.br/developers/pt/docs/split-payments/additional-content/your-integrations/notifications/webhooks?scope=prod) exigem validação da origem; a aplicação também deve consultar o pagamento autenticadamente e processar eventos repetidos de forma idempotente. O retorno do navegador nunca confirma um pedido.

## Ordem de implementação após as decisões

1. Conectar o músico ao provedor em ambiente de teste e guardar as credenciais somente no servidor.
2. Criar um checkout avulso para cada pedido, usando o preço registrado no banco e uma chave de idempotência.
3. Registrar a referência do pagamento e os eventos do provedor sem misturá-los com a licença anual.
4. Validar o Webhook, consultar o pagamento no provedor e liberar a fila apenas após confirmação. Reconciliar notificações perdidas ou repetidas.
5. Cobrir cancelamento, reembolso e chargeback conforme a política aprovada; só então habilitar cobranças reais.

A integração em ambiente de teste pode começar quando os itens da primeira seção e a elegibilidade das contas estiverem resolvidos. Nenhuma credencial de produção ou cobrança real deve ser ativada como consequência da implementação de teste.
