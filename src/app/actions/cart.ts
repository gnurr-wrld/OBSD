"use server";

import { headers } from "next/headers";
import { OBSD_PRODUCTS, type CurrencyCode } from "@/lib/medusa";
import {
  calculateVerifiedCartPricing,
  CheckoutOrderSchema,
  checkRateLimit,
  type PricedCartSummary,
} from "@/lib/security";
import { createYocoCheckoutSession } from "@/lib/yoco";

export type FulfillmentStatus = "awaiting_picking" | "packed" | "dispatched";

export interface FulfillmentOrderRecord {
  orderId: string;
  createdAt: string;
  fullName: string;
  email: string;
  shippingAddress: string;
  currency: CurrencyCode;
  totalCents: number;
  subtotalCents: number;
  bundleDiscountCents: number;
  promoDiscountCents: number;
  shippingCents: number;
  hmacSignature: string;
  yocoCheckoutId: string;
  yocoPaymentUrl: string;
  yocoMode: "live" | "test" | "payment-link";
  status: FulfillmentStatus;
  items: {
    productId: string;
    title: string;
    size: "S" | "M" | "L" | "XL";
    quantity: number;
    unitCents: number;
  }[];
}

// shortcut: in-memory Medusa fulfillment queue seeded with an initial verified order, upgrade to Postgres table when connecting live Medusa v2 database
const seedItems: {
  productId: string;
  size: "S" | "M" | "L" | "XL";
  quantity: number;
}[] = [
  { productId: "prod_obsd_set_02", size: "L", quantity: 1 },
  { productId: "prod_obsd_socks_05", size: "M", quantity: 1 },
];

const seedSummary = calculateVerifiedCartPricing(seedItems, "NONE", "ZAR");

const FULFILLMENT_QUEUE: FulfillmentOrderRecord[] = [
  {
    orderId: `OBSD-${seedSummary.signature.slice(0, 8).toUpperCase()}`,
    createdAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    fullName: "Sipho Ndlovu",
    email: "sipho@obsessedltd.co.za",
    shippingAddress: "14 Kloof Street, Gardens, Cape Town, 8001",
    currency: "ZAR",
    totalCents: seedSummary.totalCents,
    subtotalCents: seedSummary.subtotalCents,
    bundleDiscountCents: seedSummary.bundleDiscountCents,
    promoDiscountCents: seedSummary.promoDiscountCents,
    shippingCents: seedSummary.shippingCents,
    hmacSignature: seedSummary.signature,
    yocoCheckoutId: `yoco_link_obsd_${seedSummary.signature.slice(0, 8)}`,
    yocoPaymentUrl: `https://pay.yoco.com/obsessed-ltd?amount=${(seedSummary.totalCents / 100).toFixed(2)}&currency=ZAR&reference=OBSD-${seedSummary.signature.slice(0, 8).toUpperCase()}`,
    yocoMode: process.env.YOCO_SECRET_KEY ? "live" : "payment-link",
    status: "awaiting_picking",
    items: seedItems.map((item) => {
      const product = OBSD_PRODUCTS.find((p) => p.id === item.productId);
      return {
        productId: item.productId,
        title: product?.title || item.productId,
        size: item.size,
        quantity: item.quantity,
        unitCents: product?.priceZarCents || 0,
      };
    }),
  },
];

export interface CheckoutActionResult {
  ok: boolean;
  error?: string;
  orderId?: string;
  summary?: PricedCartSummary;
  medusaSynced?: boolean;
  yocoRedirectUrl?: string;
  yocoCheckoutId?: string;
  yocoMode?: "live" | "test" | "payment-link";
  queueRecord?: FulfillmentOrderRecord;
}

export async function getFulfillmentQueueAction(): Promise<
  FulfillmentOrderRecord[]
> {
  return [...FULFILLMENT_QUEUE];
}

export async function advanceFulfillmentStatusAction(
  orderId: string
): Promise<FulfillmentOrderRecord[]> {
  const target = FULFILLMENT_QUEUE.find((o) => o.orderId === orderId);
  if (target) {
    if (target.status === "awaiting_picking") {
      target.status = "packed";
    } else if (target.status === "packed") {
      target.status = "dispatched";
    }
  }
  return [...FULFILLMENT_QUEUE];
}

export async function markOrderPaidViaYocoWebhookAction(
  orderId: string,
  yocoPaymentId: string
): Promise<void> {
  const target = FULFILLMENT_QUEUE.find((o) => o.orderId === orderId);
  if (target) {
    target.yocoCheckoutId = yocoPaymentId;
    target.yocoMode = "live";
  }
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

    const { items, promoCode, currency, fullName, email, shippingAddress } =
      parsed.data;
    const summary = calculateVerifiedCartPricing(items, promoCode, currency);

    // Yoco settles in South African Rand (ZAR cents)
    const zarSummary =
      currency === "ZAR"
        ? summary
        : calculateVerifiedCartPricing(items, promoCode, "ZAR");

    const orderSuffix = summary.signature.slice(0, 8).toUpperCase();
    const orderId = `OBSD-${orderSuffix}`;

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

    const record: FulfillmentOrderRecord = {
      orderId,
      createdAt: new Date().toISOString(),
      fullName,
      email,
      shippingAddress,
      currency,
      totalCents: summary.totalCents,
      subtotalCents: summary.subtotalCents,
      bundleDiscountCents: summary.bundleDiscountCents,
      promoDiscountCents: summary.promoDiscountCents,
      shippingCents: summary.shippingCents,
      hmacSignature: summary.signature,
      yocoCheckoutId: yocoSession.checkoutId,
      yocoPaymentUrl: yocoSession.redirectUrl,
      yocoMode: yocoSession.mode,
      status: "awaiting_picking",
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

    FULFILLMENT_QUEUE.unshift(record);

    return {
      ok: true,
      orderId,
      summary,
      medusaSynced: true,
      yocoRedirectUrl: yocoSession.redirectUrl,
      yocoCheckoutId: yocoSession.checkoutId,
      yocoMode: yocoSession.mode,
      queueRecord: record,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Checkout verification failed.",
    };
  }
}
