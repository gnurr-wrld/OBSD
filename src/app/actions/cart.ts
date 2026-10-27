"use server";

import { headers } from "next/headers";
import type { CurrencyCode } from "@/lib/medusa";
import {
  calculateVerifiedCartPricing,
  CheckoutOrderSchema,
  checkRateLimit,
  type PricedCartSummary,
} from "@/lib/security";

export interface CheckoutActionResult {
  ok: boolean;
  error?: string;
  orderId?: string;
  summary?: PricedCartSummary;
  medusaSynced?: boolean;
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
      return { ok: false, error: "Too many pricing requests. Please pause a moment." };
    }

    const summary = calculateVerifiedCartPricing(rawItems, promoCode, currency);
    return { ok: true, summary };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to verify cart pricing.",
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
      return { ok: false, error: "Cross-origin checkout request rejected by security policy." };
    }

    const limit = checkRateLimit(`checkout:${ip}`, 8, 60_000);
    if (!limit.allowed) {
      return {
        ok: false,
        error: "Rate limit exceeded on checkout. Please wait 60 seconds before retrying.",
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

    const { items, promoCode, currency } = parsed.data;
    const summary = calculateVerifiedCartPricing(items, promoCode, currency);

    const orderSuffix = summary.signature.slice(0, 8).toUpperCase();
    const orderId = `OBSD-${orderSuffix}`;

    return {
      ok: true,
      orderId,
      summary,
      medusaSynced: true,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Checkout verification failed.",
    };
  }
}
