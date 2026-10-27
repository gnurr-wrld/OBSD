import crypto from "node:crypto";
import { z } from "zod";
import { getProductById, type CurrencyCode } from "./medusa.ts";

// shortcut: bounded in-memory sliding-window rate limiter per IP/client fingerprint, upgrade to Redis/Upstash in multi-region edge deployment
const rateLimitBucket = new Map<string, { count: number; resetAt: number }>();
const MAX_RATE_LIMIT_ENTRIES = 5000;

const SECRET_KEY =
  process.env.OBSD_CART_HMAC_SECRET ||
  "obsd_forest_sanctuary_hmac_secret_2026_key";

export const OrderIdSchema = z
  .string()
  .regex(/^OBSD-[A-F0-9]{8,16}$/, "Invalid OBSD Order ID format");

export const YocoReceiptSchema = z.object({
  orderId: OrderIdSchema,
  paymentToken: z.string().regex(/^[a-f0-9]{64}$/, "Invalid HMAC payment token"),
  yocoReference: z
    .string()
    .min(4)
    .max(80)
    .transform((s) => s.replace(/[<>"'&\x00-\x1F\x7F]/g, "").trim()),
});

export const CartItemInputSchema = z.object({
  productId: z.string().regex(/^prod_obsd_[a-z0-9_]+$/),
  size: z.enum(["S", "M", "L", "XL"]),
  quantity: z.number().int().min(1).max(10),
});

export const CheckoutOrderSchema = z.object({
  items: z.array(CartItemInputSchema).min(1).max(20),
  currency: z.enum(["ZAR", "USD"]).optional().default("ZAR"),
  email: z.string().email().max(120),
  fullName: z
    .string()
    .min(2)
    .max(80)
    .transform((s) => s.replace(/[<>"'`\x00-\x1F\x7F]/g, "").trim()),
  shippingAddress: z
    .string()
    .min(5)
    .max(160)
    .transform((s) => s.replace(/[<>"'`\x00-\x1F\x7F]/g, "").trim()),
  promoCode: z
    .enum(["NONE", "OBSD10", "SANCTUARY"])
    .optional()
    .default("NONE"),
});

export type CartItemInput = z.infer<typeof CartItemInputSchema>;
export type CheckoutOrderInput = z.infer<typeof CheckoutOrderSchema>;

export interface PricedCartSummary {
  currency: CurrencyCode;
  subtotalCents: number;
  bundleDiscountCents: number;
  promoDiscountCents: number;
  shippingCents: number;
  totalCents: number;
  totalQuantity: number;
  unlockedBundleTier: "NONE" | "DUO_15" | "SANCTUARY_20";
  freeShippingUnlocked: boolean;
  signature: string;
}

export function checkRateLimit(
  clientKey: string,
  maxRequests = 20,
  windowMs = 60_000
): { allowed: boolean; remaining: number } {
  const now = Date.now();

  // Prevent unbounded memory growth under IP-spoofing floods
  if (rateLimitBucket.size > MAX_RATE_LIMIT_ENTRIES) {
    for (const [k, v] of rateLimitBucket.entries()) {
      if (now > v.resetAt) {
        rateLimitBucket.delete(k);
      }
    }
    if (rateLimitBucket.size > MAX_RATE_LIMIT_ENTRIES) {
      const oldestKey = rateLimitBucket.keys().next().value;
      if (oldestKey) rateLimitBucket.delete(oldestKey);
    }
  }

  const entry = rateLimitBucket.get(clientKey);
  if (!entry || now > entry.resetAt) {
    rateLimitBucket.set(clientKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count };
}

export function generateSecureOrderId(): string {
  const randomHex = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `OBSD-${randomHex}`;
}

export function signPayload(payloadString: string): string {
  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(payloadString)
    .digest("hex");
}

export function verifySignature(
  payloadString: string,
  signature: string
): boolean {
  const expected = signPayload(payloadString);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Cryptographically binds an orderId, ZAR amount, customer email, and cart signature
 * into a tamper-proof checkout intent token.
 */
export function signOrderIntent(params: {
  orderId: string;
  amountZarCents: number;
  email: string;
  cartSignature: string;
}): string {
  const canonical = `intent:${params.orderId}:${params.amountZarCents}:${params.email.toLowerCase()}:${params.cartSignature}`;
  return signPayload(canonical);
}

export function verifyOrderIntent(
  params: {
    orderId: string;
    amountZarCents: number;
    email: string;
    cartSignature: string;
  },
  token: string
): boolean {
  const canonical = `intent:${params.orderId}:${params.amountZarCents}:${params.email.toLowerCase()}:${params.cartSignature}`;
  return verifySignature(canonical, token);
}

/**
 * Authoritative server-side pricing engine supporting ZAR and USD.
 * Never trusts client-submitted prices; looks up prices from catalog by productId + currency.
 * Applies Obsessed LTD multi-piece bundle tiers:
 * - 2 pieces: 15% off automatic bundle discount
 * - 3+ pieces: 20% off full Sanctuary Set discount
 * - Free express shipping at R1,000+ (100000 ZAR cents) or $60+ (6000 USD cents)
 */
export function calculateVerifiedCartPricing(
  rawItems: unknown,
  promoCode: "NONE" | "OBSD10" | "SANCTUARY" = "NONE",
  currency: CurrencyCode = "ZAR"
): PricedCartSummary {
  const parsedItems = z.array(CartItemInputSchema).max(20).parse(rawItems);

  // Merge duplicate productId + size entries before stock check to prevent split-line stock bypass
  const consolidated = new Map<
    string,
    { productId: string; size: "S" | "M" | "L" | "XL"; quantity: number }
  >();
  for (const item of parsedItems) {
    const key = `${item.productId}:${item.size}`;
    const prev = consolidated.get(key);
    const nextQty = (prev?.quantity || 0) + item.quantity;
    if (nextQty > 10) {
      throw new Error(`Maximum 10 units per garment size (${item.size}).`);
    }
    consolidated.set(key, {
      productId: item.productId,
      size: item.size,
      quantity: nextQty,
    });
  }

  let subtotalCents = 0;
  let totalQuantity = 0;

  for (const item of consolidated.values()) {
    const product = getProductById(item.productId);
    if (!product) {
      throw new Error(`Invalid product ID: ${item.productId}`);
    }
    const variant = product.variants.find((v) => v.size === item.size);
    if (!variant || variant.stock < item.quantity) {
      throw new Error(
        `Insufficient stock for ${product.title} (${item.size})`
      );
    }
    const unitCents =
      currency === "ZAR" ? product.priceZarCents : product.priceUsdCents;
    subtotalCents += unitCents * item.quantity;
    totalQuantity += item.quantity;
  }

  let unlockedBundleTier: PricedCartSummary["unlockedBundleTier"] = "NONE";
  let bundleRate = 0;

  if (totalQuantity >= 3) {
    unlockedBundleTier = "SANCTUARY_20";
    bundleRate = 0.2;
  } else if (totalQuantity === 2) {
    unlockedBundleTier = "DUO_15";
    bundleRate = 0.15;
  }

  const bundleDiscountCents = Math.round(subtotalCents * bundleRate);
  const afterBundleCents = subtotalCents - bundleDiscountCents;

  let promoDiscountCents = 0;
  if (promoCode === "OBSD10" || promoCode === "SANCTUARY") {
    promoDiscountCents = Math.round(afterBundleCents * 0.1);
  }

  const netMerchandiseCents = Math.max(
    0,
    afterBundleCents - promoDiscountCents
  );
  const freeShippingThreshold = currency === "ZAR" ? 100000 : 6000;
  const standardShippingFee = currency === "ZAR" ? 7500 : 500; // R75 or $5
  const freeShippingUnlocked =
    netMerchandiseCents >= freeShippingThreshold || netMerchandiseCents === 0;
  const shippingCents = freeShippingUnlocked ? 0 : standardShippingFee;
  const totalCents = netMerchandiseCents + shippingCents;

  const canonical = `${currency}:${subtotalCents}:${bundleDiscountCents}:${promoDiscountCents}:${shippingCents}:${totalCents}:${totalQuantity}`;
  const signature = signPayload(canonical);

  return {
    currency,
    subtotalCents,
    bundleDiscountCents,
    promoDiscountCents,
    shippingCents,
    totalCents,
    totalQuantity,
    unlockedBundleTier,
    freeShippingUnlocked,
    signature,
  };
}
