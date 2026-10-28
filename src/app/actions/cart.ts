"use server";

import { headers } from "next/headers";
import { OBSD_PRODUCTS, type CurrencyCode } from "@/lib/medusa";
import {
  calculateVerifiedCartPricing,
  CheckoutOrderSchema,
  checkRateLimit,
  generateSecureOrderId,
  OrderIdSchema,
  signOrderIntent,
  verifyOrderIntent,
  YocoReceiptSchema,
  type PricedCartSummary,
} from "@/lib/security";
import {
  createYocoCheckoutSession,
  verifyYocoCheckoutSessionOnServer,
} from "@/lib/yoco";
import {
  deleteOrderFile,
  readOrderFile,
  writeOrderFile,
} from "@/lib/order-inbox";

export type PaymentVerificationStatus =
  | "awaiting_yoco_payment"
  | "paid_verified";

export interface OrderRecord {
  orderId: string;
  createdAt: string;
  paidAt?: string;
  customer: {
    fullName: string;
    email: string;
    phone: string;
  };
  shipping: {
    street: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };
  currency: CurrencyCode;
  amountZarCents: number;
  totalCents: number;
  subtotalCents: number;
  bundleDiscountCents: number;
  promoDiscountCents: number;
  shippingCents: number;
  hmacSignature: string;
  yocoCheckoutId: string;
  yocoPaymentUrl: string;
  yocoReference?: string;
  yocoMode: "live" | "test" | "payment-link";
  paymentStatus: PaymentVerificationStatus;
  items: {
    productId: string;
    title: string;
    size: "S" | "M" | "L" | "XL";
    quantity: number;
    unitCents: number;
  }[];
}

export interface CheckoutActionResult {
  ok: boolean;
  error?: string;
  orderId?: string;
  paymentToken?: string;
  summary?: PricedCartSummary;
  yocoRedirectUrl?: string;
  yocoCheckoutId?: string;
  yocoMode?: "live" | "test" | "payment-link";
}

/**
 * Moves a verified order from orders/pending into orders/paid (the internal inbox for manufacturers).
 */
async function promoteToPaid(
  pending: OrderRecord,
  yocoReference: string
): Promise<OrderRecord> {
  const paid: OrderRecord = {
    ...pending,
    paymentStatus: "paid_verified",
    paidAt: new Date().toISOString(),
    yocoReference,
  };
  await writeOrderFile("paid", paid.orderId, paid);
  await deleteOrderFile("pending", paid.orderId);
  return paid;
}

/**
 * Asks Yoco directly whether the order's hosted checkout was paid for the exact ZAR amount.
 */
async function checkYocoPaid(
  pending: OrderRecord
): Promise<{ paid: boolean; reference?: string }> {
  if (!pending.yocoCheckoutId.startsWith("ch_")) return { paid: false };
  const res = await verifyYocoCheckoutSessionOnServer(pending.yocoCheckoutId);
  const amountMatches =
    res.amountZarCents === undefined ||
    res.amountZarCents === pending.amountZarCents;
  return {
    paid: res.verifiedPaid && amountMatches,
    reference: res.paymentId || pending.yocoCheckoutId,
  };
}

/**
 * Called by Verified Yoco Webhook (POST /api/webhooks/yoco) on payment.succeeded.
 */
export async function markOrderPaidViaYocoWebhookAction(
  orderId: string,
  yocoPaymentId: string
): Promise<void> {
  const parsedId = OrderIdSchema.safeParse(orderId);
  if (!parsedId.success) return;
  if (await readOrderFile<OrderRecord>("paid", parsedId.data)) return;
  const pending = await readOrderFile<OrderRecord>("pending", parsedId.data);
  if (pending) await promoteToPaid(pending, yocoPaymentId);
}

/**
 * "I've paid" button: verifies the signed paymentToken AND confirms with the Yoco API
 * before the order is written to the paid inbox. A token alone is never enough.
 */
export async function confirmYocoPaymentAction(rawInput: unknown): Promise<{
  ok: boolean;
  error?: string;
  order?: OrderRecord;
}> {
  try {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for") || "local-client";
    const limit = checkRateLimit(`yoco-confirm:${ip}`, 15, 60_000);
    if (!limit.allowed) {
      return {
        ok: false,
        error: "Too many verification attempts. Please wait a moment.",
      };
    }

    const parsed = YocoReceiptSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        error:
          parsed.error.issues[0]?.message ||
          "Invalid payment confirmation data.",
      };
    }

    const { orderId, paymentToken } = parsed.data;

    const alreadyPaid = await readOrderFile<OrderRecord>("paid", orderId);
    if (alreadyPaid) return { ok: true, order: alreadyPaid };

    const pending = await readOrderFile<OrderRecord>("pending", orderId);
    if (!pending) {
      return { ok: false, error: "Pending order not found or session expired." };
    }

    const isValidIntent = verifyOrderIntent(
      {
        orderId: pending.orderId,
        amountZarCents: pending.amountZarCents,
        email: pending.customer.email,
        cartSignature: pending.hmacSignature,
      },
      paymentToken
    );
    if (!isValidIntent) {
      return {
        ok: false,
        error: "Cryptographic payment token verification failed.",
      };
    }

    const yoco = await checkYocoPaid(pending);
    if (!yoco.paid) {
      return {
        ok: false,
        error:
          "Yoco has not confirmed this payment yet. Complete payment on the Yoco page, then try again.",
      };
    }

    return { ok: true, order: await promoteToPaid(pending, yoco.reference!) };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Payment verification failed.",
    };
  }
}

/**
 * Verifies an order when the customer returns from Yoco Hosted Checkout (?yoco_status=success&order_id=OBSD-...).
 */
export async function verifyYocoReturnOrderAction(
  rawOrderId: string
): Promise<{ ok: boolean; paid: boolean; order?: OrderRecord }> {
  const parsedId = OrderIdSchema.safeParse(rawOrderId);
  if (!parsedId.success) return { ok: false, paid: false };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") || "local-client";
  if (!checkRateLimit(`yoco-return:${ip}`, 15, 60_000).allowed) {
    return { ok: false, paid: false };
  }

  const orderId = parsedId.data;
  const alreadyPaid = await readOrderFile<OrderRecord>("paid", orderId);
  if (alreadyPaid) return { ok: true, paid: true, order: alreadyPaid };

  const pending = await readOrderFile<OrderRecord>("pending", orderId);
  if (!pending) return { ok: false, paid: false };

  const yoco = await checkYocoPaid(pending);
  if (yoco.paid) {
    return {
      ok: true,
      paid: true,
      order: await promoteToPaid(pending, yoco.reference!),
    };
  }
  return { ok: true, paid: false, order: pending };
}

export async function quoteCartAction(
  rawItems: unknown,
  promoCode: "NONE" | "OBSD10" | "SANCTUARY" = "NONE",
  currency: CurrencyCode = "ZAR"
): Promise<{ ok: boolean; summary?: PricedCartSummary; error?: string }> {
  try {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for") || "local-client";
    const limit = checkRateLimit(`quote:${ip}`, 60, 60_000);
    if (!limit.allowed) {
      return {
        ok: false,
        error: "Too many pricing requests. Please pause a moment.",
      };
    }

    const summary = calculateVerifiedCartPricing(rawItems, promoCode, currency);
    return { ok: true, summary };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Unable to verify cart pricing.",
    };
  }
}

/**
 * Step 1 of Checkout: validates cart + address, calculates the authoritative ZAR total,
 * creates the Yoco checkout, and stages the order in orders/pending.
 * Orders only reach orders/paid once Yoco confirms payment.
 */
export async function submitOrderAction(
  rawPayload: unknown
): Promise<CheckoutActionResult> {
  try {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for") || "local-client";
    const origin = hdrs.get("origin") || "";
    const host = hdrs.get("host") || "";

    // CSRF / Origin check when headers are present
    if (origin && host && !origin.includes(host)) {
      return {
        ok: false,
        error: "Cross-origin checkout request rejected by security policy.",
      };
    }

    const limit = checkRateLimit(`checkout:${ip}`, 8, 60_000);
    if (!limit.allowed) {
      return {
        ok: false,
        error:
          "Rate limit exceeded on checkout. Please wait 60 seconds before retrying.",
      };
    }

    const parsed = CheckoutOrderSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return {
        ok: false,
        error: `Validation failed (${firstIssue.path.join(".")}): ${firstIssue.message}`,
      };
    }

    const {
      items,
      promoCode,
      currency,
      fullName,
      email,
      phone,
      shippingAddress,
      city,
      province,
      postalCode,
      country,
    } = parsed.data;
    const summary = calculateVerifiedCartPricing(items, promoCode, currency);

    // Yoco settles in South African Rand (ZAR cents)
    const zarSummary =
      currency === "ZAR"
        ? summary
        : calculateVerifiedCartPricing(items, promoCode, "ZAR");

    const orderId = generateSecureOrderId();

    const yocoSession = await createYocoCheckoutSession({
      orderId,
      amountZarCents: zarSummary.totalCents,
      customerEmail: email,
      customerName: fullName,
      hmacSignature: summary.signature,
      originUrl: origin || "http://localhost:3000",
    });

    if (!yocoSession.ok) {
      return {
        ok: false,
        error: yocoSession.error || "Yoco payment initialization failed.",
      };
    }

    const paymentToken = signOrderIntent({
      orderId,
      amountZarCents: zarSummary.totalCents,
      email,
      cartSignature: summary.signature,
    });

    const pendingRecord: OrderRecord = {
      orderId,
      createdAt: new Date().toISOString(),
      customer: { fullName, email, phone },
      shipping: {
        street: shippingAddress,
        city,
        province,
        postalCode,
        country,
      },
      currency,
      amountZarCents: zarSummary.totalCents,
      totalCents: summary.totalCents,
      subtotalCents: summary.subtotalCents,
      bundleDiscountCents: summary.bundleDiscountCents,
      promoDiscountCents: summary.promoDiscountCents,
      shippingCents: summary.shippingCents,
      hmacSignature: summary.signature,
      yocoCheckoutId: yocoSession.checkoutId,
      yocoPaymentUrl: yocoSession.redirectUrl,
      yocoMode: yocoSession.mode,
      paymentStatus: "awaiting_yoco_payment",
      items: items.map((item) => {
        const product = OBSD_PRODUCTS.find((p) => p.id === item.productId);
        const unitCents =
          currency === "ZAR"
            ? product?.priceZarCents || 0
            : product?.priceUsdCents || 0;
        return {
          productId: item.productId,
          title: product?.title || item.productId,
          size: item.size,
          quantity: item.quantity,
          unitCents,
        };
      }),
    };

    await writeOrderFile("pending", orderId, pendingRecord);

    return {
      ok: true,
      orderId,
      paymentToken,
      summary,
      yocoRedirectUrl: yocoSession.redirectUrl,
      yocoCheckoutId: yocoSession.checkoutId,
      yocoMode: yocoSession.mode,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Checkout verification failed.",
    };
  }
}
