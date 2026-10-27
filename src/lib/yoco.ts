import crypto from "node:crypto";

const DEFAULT_YOCO_LINK = "https://pay.yoco.com/obsessed-ltd";

/**
 * Enforces an allowlist on the Yoco payment host to prevent Open Redirect vulnerabilities.
 */
function getSafeYocoPaymentPageUrl(): string {
  const candidate = (
    process.env.NEXT_PUBLIC_YOCO_PAYMENT_LINK || DEFAULT_YOCO_LINK
  ).trim();
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname === "pay.yoco.com" ||
        parsed.hostname === "payments.yoco.com")
    ) {
      return parsed.toString();
    }
  } catch {
    // Fall through to safe default
  }
  return DEFAULT_YOCO_LINK;
}

export const YOCO_PAYMENT_PAGE_URL = getSafeYocoPaymentPageUrl();

export interface YocoCheckoutSessionInput {
  orderId: string;
  amountZarCents: number;
  customerEmail: string;
  customerName: string;
  hmacSignature: string;
  originUrl: string;
}

export interface YocoCheckoutSessionResult {
  ok: boolean;
  mode: "live" | "test" | "payment-link";
  checkoutId: string;
  redirectUrl: string;
  error?: string;
}

/**
 * Builds the live Yoco Payment Link URL (https://pay.yoco.com/obsessed-ltd)
 * pre-filled with the server-verified ZAR amount, order reference, and customer details.
 */
export function buildYocoPaymentLinkUrl(
  input: YocoCheckoutSessionInput
): string {
  const amountRands = (input.amountZarCents / 100).toFixed(2);
  const nameParts = input.customerName.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const url = new URL(getSafeYocoPaymentPageUrl());
  url.searchParams.set("amount", amountRands);
  url.searchParams.set("currency", "ZAR");
  url.searchParams.set("reference", input.orderId);
  if (firstName) url.searchParams.set("firstName", firstName);
  if (lastName) url.searchParams.set("lastName", lastName);
  if (input.customerEmail) url.searchParams.set("email", input.customerEmail);

  return url.toString();
}

/**
 * Creates a Yoco Online Checkout session.
 * - If YOCO_SECRET_KEY (sk_live_... or sk_test_...) is configured, uses the Yoco Checkout API.
 * - Otherwise, uses the live Obsessed LTD Yoco Payment Page (https://pay.yoco.com/obsessed-ltd)
 *   pre-populated with the verified ZAR amount and order reference.
 */
export async function createYocoCheckoutSession(
  input: YocoCheckoutSessionInput
): Promise<YocoCheckoutSessionResult> {
  const secretKey = process.env.YOCO_SECRET_KEY?.trim();
  const paymentLinkUrl = buildYocoPaymentLinkUrl(input);

  if (
    !secretKey ||
    secretKey.includes("replace_with_your_yoco_secret_key")
  ) {
    return {
      ok: true,
      mode: "payment-link",
      checkoutId: `yoco_link_${input.orderId.toLowerCase()}`,
      redirectUrl: paymentLinkUrl,
    };
  }

  const mode: "live" | "test" =
    secretKey.startsWith("sk_live_") || secretKey.startsWith("yoco_live_")
      ? "live"
      : "test";

  const baseUrl = input.originUrl || "http://localhost:3000";

  try {
    const response = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secretKey}`,
        "Idempotency-Key": `obsd_${input.orderId}`,
      },
      body: JSON.stringify({
        amount: input.amountZarCents,
        currency: "ZAR",
        successUrl: `${baseUrl}/?yoco_status=success&order_id=${encodeURIComponent(input.orderId)}`,
        cancelUrl: `${baseUrl}/?yoco_status=cancelled&order_id=${encodeURIComponent(input.orderId)}`,
        failureUrl: `${baseUrl}/?yoco_status=failed&order_id=${encodeURIComponent(input.orderId)}`,
        metadata: {
          orderId: input.orderId,
          hmacSignature: input.hmacSignature,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          store: "Obsessed LTD (OBSD)",
        },
      }),
    });

    if (!response.ok) {
      return {
        ok: true,
        mode: "payment-link",
        checkoutId: `yoco_link_${input.orderId.toLowerCase()}`,
        redirectUrl: paymentLinkUrl,
      };
    }

    const data = (await response.json()) as {
      id: string;
      redirectUrl?: string;
    };

    return {
      ok: true,
      mode,
      checkoutId: data.id,
      redirectUrl: data.redirectUrl || paymentLinkUrl,
    };
  } catch {
    return {
      ok: true,
      mode: "payment-link",
      checkoutId: `yoco_link_${input.orderId.toLowerCase()}`,
      redirectUrl: paymentLinkUrl,
    };
  }
}

/**
 * Verifies Yoco webhook signatures (webhook-id, webhook-timestamp, webhook-signature)
 * using HMAC-SHA256 and constant-time comparison to prevent spoofing and replay attacks.
 */
export function verifyYocoWebhookSignature(params: {
  rawBody: string;
  webhookId: string;
  webhookTimestamp: string;
  webhookSignature: string;
  webhookSecret?: string;
}): boolean {
  const secret = (
    params.webhookSecret ||
    process.env.YOCO_WEBHOOK_SECRET ||
    ""
  ).trim();
  if (
    !secret ||
    !params.webhookId ||
    !params.webhookTimestamp ||
    !params.webhookSignature
  ) {
    return false;
  }

  // Reject replay attacks older than 5 minutes (300 seconds)
  const timestampSec = Number(params.webhookTimestamp);
  if (!Number.isFinite(timestampSec)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestampSec) > 300) {
    return false;
  }

  const cleanSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(cleanSecret, "base64");
  const signedContent = `${params.webhookId}.${params.webhookTimestamp}.${params.rawBody}`;

  const expectedBase64 = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  const expectedBuf = Buffer.from(expectedBase64, "utf8");

  const candidates = params.webhookSignature.split(" ");
  for (const entry of candidates) {
    const parts = entry.split(",");
    const sigPart = parts.length === 2 ? parts[1] : parts[0];
    if (!sigPart) continue;
    const candidateBuf = Buffer.from(sigPart, "utf8");
    if (
      candidateBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      return true;
    }
  }

  return false;
}
