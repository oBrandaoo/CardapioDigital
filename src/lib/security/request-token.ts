import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "cardapio_request_visitor";

function signatureFor(token: string, secret: string) {
  return createHmac("sha256", secret).update(token).digest("base64url");
}

function readValidToken(value: string | undefined, secret: string) {
  if (!value) return null;
  const [token, signature, ...extra] = value.split(".");
  if (extra.length || !token || !signature || !/^[0-9a-f-]{36}$/i.test(token)) return null;

  const expected = Buffer.from(signatureFor(token, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return token;
}

export async function getRequestVisitorToken() {
  const secret = process.env.REQUEST_TOKEN_SECRET;
  if (!secret || secret.length < 32) return null;

  const cookieStore = await cookies();
  const currentValue = cookieStore.get(cookieName)?.value;
  const currentToken = readValidToken(currentValue, secret);
  if (currentToken) return currentToken;

  const token = randomUUID();
  cookieStore.set(cookieName, `${token}.${signatureFor(token, secret)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  return token;
}
