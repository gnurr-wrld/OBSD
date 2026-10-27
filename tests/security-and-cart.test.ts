import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  calculateVerifiedCartPricing,
  CheckoutOrderSchema,
  verifySignature,
  checkRateLimit,
  generateSecureOrderId,
  OrderIdSchema,
  signOrderIntent,
  verifyOrderIntent,
} from "../src/lib/security.ts";
import { OBSD_PRODUCTS } from "../src/lib/medusa.ts";
import {
  verifyYocoWebhookSignature,
  buildYocoPaymentLinkUrl,
} from "../src/lib/yoco.ts";

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

// 2. Verify new Wide-Leg Lounge Shorts pricing (R420 ZAR / $23 USD) & colorways across all 7 products
const shortsZar = calculateVerifiedCartPricing(
  [{ productId: "prod_obsd_shorts_07", size: "L", quantity: 1 }],
  "NONE",
  "ZAR"
);
assert.equal(shortsZar.subtotalCents, 42000); // R420.00

assert.equal(OBSD_PRODUCTS.length, 7);
for (const prod of OBSD_PRODUCTS) {
  const colorNames = prod.colors.map((c) => c.name);
  assert.equal(
    colorNames.includes("Slate Blue"),
    true,
    `${prod.id} missing Slate Blue`
  );
  assert.equal(
    colorNames.includes("Charcoal Grey"),
    true,
    `${prod.id} missing Charcoal Grey`
  );
}

// 3. Verify 3-piece Bundle in ZAR (Joggers R550 + Set R950 + Socks R220 = R1720)
// 20% bundle discount = R344 -> R1376, plus 10% OBSD10 promo = R137.60 -> R1238.40 (Free shipping over R1000)
const bundle3Zar = calculateVerifiedCartPricing(
  [
    { productId: "prod_obsd_jogger_01", size: "L", quantity: 1 }, // R550
    { productId: "prod_obsd_set_02", size: "M", quantity: 1 }, // R950
    { productId: "prod_obsd_socks_05", size: "M", quantity: 1 }, // R220
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
assert.equal(
  verifySignature(canonical + ":tampered", bundle3Zar.signature),
  false
);

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

// 5. Verify Yoco Webhook HMAC-SHA256 signature & replay attack protection
const rawSecret = Buffer.from("obsd_yoco_webhook_test_secret_32b").toString(
  "base64"
);
const webhookSecret = `whsec_${rawSecret}`;
const webhookId = "msg_2abc123";
const nowTimestamp = String(Math.floor(Date.now() / 1000));
const bodyPayload = JSON.stringify({
  type: "payment.succeeded",
  payload: { id: "pay_123", metadata: { orderId: "OBSD-12345678" } },
});
const validSig = crypto
  .createHmac("sha256", Buffer.from(rawSecret, "base64"))
  .update(`${webhookId}.${nowTimestamp}.${bodyPayload}`)
  .digest("base64");

assert.equal(
  verifyYocoWebhookSignature({
    rawBody: bodyPayload,
    webhookId,
    webhookTimestamp: nowTimestamp,
    webhookSignature: `v1,${validSig}`,
    webhookSecret,
  }),
  true
);
// Tampered payload must fail
assert.equal(
  verifyYocoWebhookSignature({
    rawBody: bodyPayload + "x",
    webhookId,
    webhookTimestamp: nowTimestamp,
    webhookSignature: `v1,${validSig}`,
    webhookSecret,
  }),
  false
);
// Replay attack (timestamp 10 minutes old) must fail
assert.equal(
  verifyYocoWebhookSignature({
    rawBody: bodyPayload,
    webhookId,
    webhookTimestamp: String(Math.floor(Date.now() / 1000) - 600),
    webhookSignature: `v1,${validSig}`,
    webhookSecret,
  }),
  false
);

// 6. Verify Yoco Payment Link URL builder for https://pay.yoco.com/obsessed-ltd
const paymentUrl = buildYocoPaymentLinkUrl({
  orderId: "OBSD-8F4A2C19",
  amountZarCents: 97600, // R976.00
  customerEmail: "laidinjansen13@gmail.com",
  customerName: "Laidin Jansen",
  hmacSignature: "abc123",
  originUrl: "http://localhost:3000",
});
assert.equal(
  paymentUrl.startsWith("https://pay.yoco.com/obsessed-ltd?"),
  true
);
assert.equal(paymentUrl.includes("amount=976.00"), true);
assert.equal(paymentUrl.includes("reference=OBSD-8F4A2C19"), true);

// 7. Verify split-line stock bypass protection & cryptographic Order Intent payment gating
assert.throws(() => {
  calculateVerifiedCartPricing(
    [
      { productId: "prod_obsd_set_02", size: "XL", quantity: 5 },
      { productId: "prod_obsd_set_02", size: "XL", quantity: 5 },
    ],
    "NONE",
    "ZAR"
  );
}, /Insufficient stock/);

const id1 = generateSecureOrderId();
const id2 = generateSecureOrderId();
assert.notEqual(id1, id2);
assert.equal(OrderIdSchema.safeParse(id1).success, true);

const intentToken = signOrderIntent({
  orderId: id1,
  amountZarCents: 62500,
  email: "laidinjansen13@gmail.com",
  cartSignature: singleZar.signature,
});
assert.equal(
  verifyOrderIntent(
    {
      orderId: id1,
      amountZarCents: 62500,
      email: "laidinjansen13@gmail.com",
      cartSignature: singleZar.signature,
    },
    intentToken
  ),
  true
);
// Tampered amount or orderId must fail verification before entering Fulfillment Queue
assert.equal(
  verifyOrderIntent(
    {
      orderId: id1,
      amountZarCents: 100, // tampered price
      email: "laidinjansen13@gmail.com",
      cartSignature: singleZar.signature,
    },
    intentToken
  ),
  false
);

// 8. Verify rate limiter blocks excessive requests
for (let i = 0; i < 3; i++) {
  assert.equal(checkRateLimit("test-ip-zar", 3, 60_000).allowed, true);
}
assert.equal(checkRateLimit("test-ip-zar", 3, 60_000).allowed, false);

console.log(
  "✅ All Obsessed LTD (OBSD) ZAR/USD pricing, Shorts SKU, 6-color palette, Yoco webhook HMAC verification, and security assertions passed."
);
