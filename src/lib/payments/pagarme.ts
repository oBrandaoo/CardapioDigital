import "server-only";

const API_URL = "https://api.pagar.me/core/v5";

export type PagarmeOrder = {
  id: string;
  code: string;
  amount: number;
  currency: string;
  status: string;
  charges?: Array<{
    id: string;
    amount: number;
    paid_amount?: number;
    status: string;
    payment_method?: string;
    last_transaction?: { qr_code?: string; qr_code_url?: string; expires_at?: string };
  }>;
};

type PagarmeCustomer = {
  name: string;
  email: string;
  document: string;
  type: "individual" | "company";
  address: {
    line_1: string;
    zip_code: string;
    city: string;
    state: string;
    country: "BR";
  };
  phones: {
    mobile_phone: { country_code: "55"; area_code: string; number: string };
  };
};

type CreatePixSplitOrderInput = {
  requestId: string;
  amountCents: number;
  description: string;
  customer: PagarmeCustomer;
  platformRecipientId: string;
  musicianRecipientId: string;
  platformAmountCents: number;
  musicianAmountCents: number;
  feePayer: "platform" | "musician";
  chargebackPayer: "platform" | "musician";
};

function secretKey() {
  const key = process.env.PAGARME_SECRET_KEY;
  // This adapter is intentionally limited to sandbox until commercial and
  // fiscal rules, onboarding, refunds and webhook reconciliation are approved.
  if (!key?.startsWith("sk_test_")) throw new Error("Pagar.me sandbox is not configured");
  return key;
}

async function pagarmeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${secretKey()}:`).toString("base64")}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Pagar.me API returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function getPagarmeOrder(orderId: string) {
  if (!/^or_[A-Za-z0-9]+$/.test(orderId)) throw new Error("Invalid Pagar.me order ID");
  return pagarmeRequest<PagarmeOrder>(`/orders/${orderId}`);
}

export async function createPagarmePixSplitOrder(input: CreatePixSplitOrderInput) {
  if (!/^[0-9a-f-]{36}$/i.test(input.requestId)) throw new Error("Invalid request ID");
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > 500) {
    throw new Error("Invalid request amount");
  }
  if (!Number.isInteger(input.platformAmountCents) || !Number.isInteger(input.musicianAmountCents)
    || input.platformAmountCents < 1 || input.musicianAmountCents < 1
    || input.platformAmountCents + input.musicianAmountCents !== input.amountCents) {
    throw new Error("Invalid split amounts");
  }
  if (!/^rp_[A-Za-z0-9]+$/.test(input.platformRecipientId)
    || !/^rp_[A-Za-z0-9]+$/.test(input.musicianRecipientId)
    || input.platformRecipientId === input.musicianRecipientId) {
    throw new Error("Invalid recipients");
  }

  return pagarmeRequest<PagarmeOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      code: input.requestId,
      closed: true,
      items: [{ code: input.requestId, amount: input.amountCents, description: input.description.slice(0, 80), quantity: 1 }],
      customer: input.customer,
      payments: [{
        payment_method: "pix",
        pix: { expires_in: 900 },
        split: ([
          [input.platformRecipientId, input.platformAmountCents, "platform"],
          [input.musicianRecipientId, input.musicianAmountCents, "musician"],
        ] as const).map(([recipient_id, amount, role]) => ({
          type: "flat",
          amount,
          recipient_id,
          options: {
            charge_processing_fee: role === input.feePayer,
            charge_remainder_fee: role === input.feePayer,
            liable: role === input.chargebackPayer,
          },
        })),
      }],
    }),
  });
}
