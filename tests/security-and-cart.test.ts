import assert from "node:assert/strict";
import {
  calculateVerifiedCartPricing,
  CheckoutOrderSchema,
  verifySignature,
  checkRateLimit,
} from "../src/lib/security.ts";

// 1. Verify single item pricing in ZAR (R550 Joggers + R75 shipping = R625)
const singleZar = calculateVerifiedCartPricing(
  [{ productId: "prod_obsd_jogger_01", size: "L", quantity: 1 }],
  "NONE",
  "ZAR"
);
assert.equal(singleZar.currency, "ZAR");
assert.equal(singleZar.subtotalCents, 55000); // R550.00
assert.equal(singleZar.bundleDiscountCents, 0);
assert.equal(singleZar.shippingCents, 7500); // R75.00
assert.equal(singleZar.totalCents, 62500); // R625.00
assert.equal(singleZar.unlockedBundleTier, "NONE");

// 2. Verify single item pricing in USD ($30 Joggers + $5 shipping = $35)
const singleUsd = calculateVerifiedCartPricing(
  [{ productId: "prod_obsd_jogger_01", size: "L", quantity: 1 }],
  "NONE",
  "USD"
);
assert.equal(singleUsd.currency, "USD");
assert.equal(singleUsd.subtotalCents, 3000); // $30.00
assert.equal(singleUsd.shippingCents, 500); // $5.00
assert.equal(singleUsd.totalCents, 3500); // $35.00

// 3. Verify 3-piece Obsist Bundle in ZAR (Joggers R550 + Set R950 + Socks R220 = R1720)
// 20% bundle discount = R344 -> R1376, plus 10% OBSD10 promo = R137.60 -> R1238.40 (Free shipping over R1000)
const bundle3Zar = calculateVerifiedCartPricing(
  [
    { productId: "prod_obsd_jogger_01", size: "L", quantity: 1 }, // R550
    { productId: "prod_obsd_set_02", size: "M", quantity: 1 },    // R950
    { productId: "prod_obsd_socks_05", size: "M", quantity: 1 },  // R220
  ],
  "OBSD10",
  "ZAR"
);
assert.equal(bundle3Zar.subtotalCents, 172000);
assert.equal(bundle3Zar.bundleDiscountCents, 34400);
assert.equal(bundle3Zar.promoDiscountCents, 13760);
assert.equal(bundle3Zar.shippingCents, 0);
assert.equal(bundle3Zar.totalCents, 123840);
assert.equal(bundle3Zar.unlockedBundleTier, "SANCTUARY_20");

const canonical = `${bundle3Zar.currency}:${bundle3Zar.subtotalCents}:${bundle3Zar.bundleDiscountCents}:${bundle3Zar.promoDiscountCents}:${bundle3Zar.shippingCents}:${bundle3Zar.totalCents}:${bundle3Zar.totalQuantity}`;
assert.equal(verifySignature(canonical, bundle3Zar.signature), true);
assert.equal(verifySignature(canonical + ":tampered", bundle3Zar.signature), false);

// 4. Verify XSS sanitization & strict Zod validation on checkout payload
const sanitized = CheckoutOrderSchema.parse({
  items: [{ productId: "prod_obsd_vest_03", size: "L", quantity: 1 }],
  currency: "ZAR",
  email: "customer@obsist.co.za",
  fullName: "  <script>Sipho Ndlovu</script>  ",
  shippingAddress: "14 Kloof Street <img src=x onerror=alert(1)>",
  promoCode: "SANCTUARY",
});
assert.equal(sanitized.fullName.includes("<"), false);
assert.equal(sanitized.shippingAddress.includes(">"), false);

// 5. Verify rate limiter blocks excessive requests
for (let i = 0; i < 3; i++) {
  assert.equal(checkRateLimit("test-ip-zar", 3, 60_000).allowed, true);
}
assert.equal(checkRateLimit("test-ip-zar", 3, 60_000).allowed, false);

console.log("✅ All Obsessed LTD (OBSD) ZAR/USD pricing, security, and HMAC signature assertions passed.");
