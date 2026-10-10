# Integração de pagamentos — avaliação da InfinitePay

O fluxo atual cria um pedido por música e usa confirmação simulada apenas em desenvolvimento. Pedidos gratuitos entram diretamente na fila. Em produção, pedidos pagos ainda não têm checkout e não podem entrar na fila sem confirmação confiável do provedor.

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
