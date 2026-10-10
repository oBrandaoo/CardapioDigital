# Integração de pagamentos — decisões para a próxima etapa

O fluxo atual cria um pedido por música e usa confirmação simulada apenas em desenvolvimento. Pedidos gratuitos entram diretamente na fila. Em produção, pedidos pagos ainda não têm checkout e não podem entrar na fila sem confirmação confiável do provedor.

## O que falta decidir antes de integrar um gateway

1. Escolher um provedor com split 1:1 disponível para a plataforma e para os músicos, confirmando elegibilidade, cadastro e credenciais de teste.
2. Definir os meios de pagamento do MVP e conferir tarifas e valor mínimo viável para pedidos de até R$ 5.
3. Validar com a contabilidade quais impostos incidem e como compõem a base da divisão 50/50. Definir separadamente quem arca com as tarifas do provedor.
4. Definir o tratamento de reembolsos, chargebacks e pedidos pagos que não forem tocados.

Essas decisões precisam resultar em uma regra de cálculo em centavos, incluindo arredondamento. A comissão do provedor, a comissão da plataforma e os impostos devem permanecer identificáveis separadamente nos registros e relatórios. A licença anual continua fora do fluxo de pedidos.

## Primeira opção a avaliar: Mercado Pago Split 1:1

A [documentação oficial de pré-requisitos](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites) informa que o vendedor precisa cumprir identificação KYC 6 e autorizar a conexão por OAuth. O [fluxo de integração](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace) usa credenciais de cada vendedor e permite definir `marketplace_fee` no Checkout Pro ou `application_fee` no Checkout Transparente. A documentação descreve o desconto da tarifa do Mercado Pago do lado do vendedor antes da comissão do marketplace; esse comportamento precisa ser confrontado com a regra do produto antes de fixar valores de split. Ela também descreve limitações de reembolso que precisam entrar na política operacional.

O [Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/create-configuration) é uma opção de redirecionamento a avaliar primeiro, sujeito à confirmação dos meios disponíveis na conta. As [notificações Webhook](https://www.mercadopago.com.br/developers/pt/docs/split-payments/additional-content/your-integrations/notifications/webhooks?scope=prod) exigem validação da origem; a aplicação também deve consultar o pagamento autenticadamente e processar eventos repetidos de forma idempotente. O retorno do navegador nunca confirma um pedido.

## Ordem de implementação após as decisões

1. Conectar o músico ao provedor em ambiente de teste e guardar as credenciais somente no servidor.
2. Criar um checkout avulso para cada pedido, usando o preço registrado no banco e uma chave de idempotência.
3. Registrar a referência do pagamento e os eventos do provedor sem misturá-los com a licença anual.
4. Validar o Webhook, consultar o pagamento no provedor e liberar a fila apenas após confirmação. Reconciliar notificações perdidas ou repetidas.
5. Cobrir cancelamento, reembolso e chargeback conforme a política aprovada; só então habilitar cobranças reais.

A integração em ambiente de teste pode começar quando os itens da primeira seção e a elegibilidade das contas estiverem resolvidos. Nenhuma credencial de produção ou cobrança real deve ser ativada como consequência da implementação de teste.
