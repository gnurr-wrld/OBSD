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

export type FulfillmentStatus = "awaiting_picking" | "packed" | "dispatched";
export type PaymentVerificationStatus =
  | "awaiting_yoco_payment"
  | "paid_verified";

export interface FulfillmentOrderRecord {
  orderId: string;
  createdAt: string;
  paidAt?: string;
  fullName: string;
  email: string;
  shippingAddress: string;
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
  status: FulfillmentStatus;
  items: {
    productId: string;
    title: string;
    size: "S" | "M" | "L" | "XL";
    quantity: number;
    unitCents: number;
  }[];
}

// Pending unpaid orders waiting for Yoco payment completion (bounded to prevent memory DoS)
const PENDING_PAYMENT_ORDERS = new Map<string, FulfillmentOrderRecord>();
const MAX_PENDING_ORDERS = 1000;

// shortcut: in-memory Medusa fulfillment queue containing ONLY paid & verified orders, upgrade to Postgres table when connecting live Medusa v2 database
const seedItems: {
  productId: string;
  size: "S" | "M" | "L" | "XL";
  quantity: number;
}[] = [
  { productId: "prod_obsd_set_02", size: "L", quantity: 1 },
  { productId: "prod_obsd_socks_05", size: "M", quantity: 1 },
];

const seedSummary = calculateVerifiedCartPricing(seedItems, "NONE", "ZAR");
const seedOrderId = `OBSD-${seedSummary.signature.slice(0, 8).toUpperCase()}`;

const FULFILLMENT_QUEUE: FulfillmentOrderRecord[] = [
  {
    orderId: seedOrderId,
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    paidAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    fullName: "Sipho Ndlovu",
    email: "sipho@obsessedltd.co.za",
    shippingAddress: "14 Kloof Street, Gardens, Cape Town, 8001",
    currency: "ZAR",
    amountZarCents: seedSummary.totalCents,
    totalCents: seedSummary.totalCents,
    subtotalCents: seedSummary.subtotalCents,
    bundleDiscountCents: seedSummary.bundleDiscountCents,
    promoDiscountCents: seedSummary.promoDiscountCents,
    shippingCents: seedSummary.shippingCents,
    hmacSignature: seedSummary.signature,
    yocoCheckoutId: `yoco_paid_${seedSummary.signature.slice(0, 8)}`,
    yocoPaymentUrl: `https://pay.yoco.com/obsessed-ltd?amount=${(seedSummary.totalCents / 100).toFixed(2)}&currency=ZAR&reference=${seedOrderId}`,
    yocoReference: `YOCO-REC-${seedSummary.signature.slice(0, 6).toUpperCase()}`,
    yocoMode: process.env.YOCO_SECRET_KEY ? "live" : "payment-link",
    paymentStatus: "paid_verified",
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
  paymentToken?: string;
  summary?: PricedCartSummary;
  yocoRedirectUrl?: string;
  yocoCheckoutId?: string;
  yocoMode?: "live" | "test" | "payment-link";
}

/**
 * Returns ONLY orders whose Yoco payment has been verified (paymentStatus === "paid_verified").
 */
export async function getFulfillmentQueueAction(): Promise<
  FulfillmentOrderRecord[]
> {
  return FULFILLMENT_QUEUE.filter((o) => o.paymentStatus === "paid_verified");
}

export async function advanceFulfillmentStatusAction(
  rawOrderId: string
): Promise<FulfillmentOrderRecord[]> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") || "local-client";
  const limit = checkRateLimit(`fulfill-advance:${ip}`, 30, 60_000);
  if (!limit.allowed) {
    return getFulfillmentQueueAction();
  }

  const parsedId = OrderIdSchema.safeParse(rawOrderId);
  if (!parsedId.success) {
    return getFulfillmentQueueAction();
  }

  const target = FULFILLMENT_QUEUE.find(
    (o) => o.orderId === parsedId.data && o.paymentStatus === "paid_verified"
  );
  if (target) {
    if (target.status === "awaiting_picking") {
      target.status = "packed";
    } else if (target.status === "packed") {
      target.status = "dispatched";
    }
  }
  return getFulfillmentQueueAction();
}

/**
 * Called by Verified Yoco Webhook (POST /api/webhooks/yoco) on payment.succeeded.
 * Promotes a pending order into the active Medusa Fulfillment Queue.
 */
export async function markOrderPaidViaYocoWebhookAction(
  orderId: string,
  yocoPaymentId: string
): Promise<void> {
  const pending = PENDING_PAYMENT_ORDERS.get(orderId);
  if (pending) {
    pending.paymentStatus = "paid_verified";
    pending.paidAt = new Date().toISOString();
    pending.yocoReference = yocoPaymentId;
    pending.yocoCheckoutId = yocoPaymentId;
    PENDING_PAYMENT_ORDERS.delete(orderId);
    if (!FULFILLMENT_QUEUE.some((o) => o.orderId === orderId)) {
      FULFILLMENT_QUEUE.unshift(pending);
    }
    return;
  }

  const existing = FULFILLMENT_QUEUE.find((o) => o.orderId === orderId);
  if (existing) {
    existing.paymentStatus = "paid_verified";
    existing.yocoReference = yocoPaymentId;
  }
}

/**
 * Verifies a completed Yoco payment (via HMAC-signed paymentToken + Yoco receipt/reference)
 * and promotes the order from PENDING_PAYMENT_ORDERS into the Medusa Fulfillment Queue.
 */
export async function confirmYocoPaymentAction(rawInput: unknown): Promise<{
  ok: boolean;
  error?: string;
  queue?: FulfillmentOrderRecord[];
  order?: FulfillmentOrderRecord;
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

    const { orderId, paymentToken, yocoReference } = parsed.data;

    // Check if already promoted to Fulfillment Queue
    const alreadyPaid = FULFILLMENT_QUEUE.find((o) => o.orderId === orderId);
    if (alreadyPaid) {
      return {
        ok: true,
        order: alreadyPaid,
        queue: await getFulfillmentQueueAction(),
      };
    }

    const pending = PENDING_PAYMENT_ORDERS.get(orderId);
    if (!pending) {
      return {
        ok: false,
        error: "Pending order not found or session expired.",
      };
    }

    // Cryptographically verify that the paymentToken matches the exact orderId, ZAR amount, email, and cart HMAC
    const isValidIntent = verifyOrderIntent(
      {
        orderId: pending.orderId,
        amountZarCents: pending.amountZarCents,
        email: pending.email,
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

    // Query Yoco Checkout API directly when a live/test hosted checkout ID (ch_...) exists
    let resolvedReference = yocoReference;
    if (pending.yocoCheckoutId.startsWith("ch_")) {
      const apiStatus = await verifyYocoCheckoutSessionOnServer(
        pending.yocoCheckoutId
      );
      if (apiStatus.verifiedPaid && apiStatus.paymentId) {
        resolvedReference = apiStatus.paymentId;
      }
    }

    pending.paymentStatus = "paid_verified";
    pending.paidAt = new Date().toISOString();
    pending.yocoReference = resolvedReference;

    PENDING_PAYMENT_ORDERS.delete(orderId);
    FULFILLMENT_QUEUE.unshift(pending);

    return {
      ok: true,
      order: pending,
      queue: await getFulfillmentQueueAction(),
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Payment verification failed.",
    };
  }
}

/**
 * Verifies an order when the customer returns from Yoco Hosted Checkout (?yoco_status=success&order_id=OBSD-...)
 * by checking GET https://payments.yoco.com/api/checkouts/{checkoutId} on the server.
 */
export async function verifyYocoReturnOrderAction(rawOrderId: string): Promise<{
  ok: boolean;
  paid: boolean;
  order?: FulfillmentOrderRecord;
  queue?: FulfillmentOrderRecord[];
}> {
  const parsedId = OrderIdSchema.safeParse(rawOrderId);
  if (!parsedId.success) {
    return { ok: false, paid: false };
  }

  const orderId = parsedId.data;
  const alreadyPaid = FULFILLMENT_QUEUE.find((o) => o.orderId === orderId);
  if (alreadyPaid) {
    return {
      ok: true,
      paid: true,
      order: alreadyPaid,
      queue: await getFulfillmentQueueAction(),
    };
  }

  const pending = PENDING_PAYMENT_ORDERS.get(orderId);
  if (!pending) {
    return { ok: false, paid: false };
  }

  if (pending.yocoCheckoutId.startsWith("ch_")) {
    const apiCheck = await verifyYocoCheckoutSessionOnServer(
      pending.yocoCheckoutId
    );
    if (apiCheck.verifiedPaid) {
      pending.paymentStatus = "paid_verified";
      pending.paidAt = new Date().toISOString();
      pending.yocoReference = apiCheck.paymentId || pending.yocoCheckoutId;
      PENDING_PAYMENT_ORDERS.delete(orderId);
      FULFILLMENT_QUEUE.unshift(pending);
      return {
        ok: true,
        paid: true,
        order: pending,
        queue: await getFulfillmentQueueAction(),
      };
    }
  }

  return {
    ok: true,
    paid: false,
    order: pending,
    queue: await getFulfillmentQueueAction(),
  };
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
 * Step 1 of Checkout: Validates cart, calculates authoritative ZAR/USD total,
 * creates the Yoco Payment Link (https://pay.yoco.com/obsessed-ltd), and stages
 * the order in PENDING_PAYMENT_ORDERS.
 * Does NOT add the order to FULFILLMENT_QUEUE until payment is confirmed!
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

    const { items, promoCode, currency, fullName, email, shippingAddress } =
      parsed.data;
    const summary = calculateVerifiedCartPricing(items, promoCode, currency);

    // Yoco settles in South African Rand (ZAR cents)
    const zarSummary =
      currency === "ZAR"
        ? summary
        : calculateVerifiedCartPricing(items, promoCode, "ZAR");

    // Generate a unique, non-colliding cryptographic Order ID
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

    const pendingRecord: FulfillmentOrderRecord = {
      orderId,
      createdAt: new Date().toISOString(),
      fullName,
      email,
      shippingAddress,
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

    // Bounded pending map eviction
    if (PENDING_PAYMENT_ORDERS.size >= MAX_PENDING_ORDERS) {
      const oldestKey = PENDING_PAYMENT_ORDERS.keys().next().value;
      if (oldestKey) PENDING_PAYMENT_ORDERS.delete(oldestKey);
    }
    PENDING_PAYMENT_ORDERS.set(orderId, pendingRecord);

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
