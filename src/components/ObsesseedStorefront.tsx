"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  Check,
  Plus,
  Minus,
  X,
  ArrowRight,
  TreePine,
  Flame,
  Star,
  Lock,
  Layers,
  Globe,
  PackageCheck,
  Truck,
} from "lucide-react";
import {
  formatCurrencyPrice,
  type CategorySlug,
  type CurrencyCode,
  type Product,
} from "@/lib/medusa";
import {
  submitOrderAction,
  getFulfillmentQueueAction,
  advanceFulfillmentStatusAction,
  type FulfillmentOrderRecord,
} from "@/app/actions/cart";

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface CartEntry {
  productId: string;
  size: "S" | "M" | "L" | "XL";
  quantity: number;
}

function formatCents(cents: number, currency: CurrencyCode): string {
  const major = cents / 100;
  const prefix = currency === "ZAR" ? "R" : "$";
  return Number.isInteger(major)
    ? `${prefix}${major}`
    : `${prefix}${major.toFixed(2)}`;
}

export default function ObsistStorefront({
  initialProducts,
  medusaSource,
}: {
  initialProducts: Product[];
  medusaSource: "medusa-live" | "medusa-fallback";
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Default to ZAR (South African Rand) with instant switcher to USD ($)
  const [currency, setCurrency] = useState<CurrencyCode>("ZAR");
  const [selectedCategory, setSelectedCategory] = useState<CategorySlug>("all");
  const [selectedSizes, setSelectedSizes] = useState<
    Record<string, "S" | "M" | "L" | "XL">
  >({
    prod_obsd_jogger_01: "L",
    prod_obsd_shorts_07: "L",
    prod_obsd_set_02: "M",
    prod_obsd_vest_03: "L",
    prod_obsd_shirt_04: "M",
    prod_obsd_socks_05: "M",
    prod_obsd_hoodie_06: "L",
  });
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>(
    {
      prod_obsd_jogger_01: "Sage Moss",
      prod_obsd_shorts_07: "Slate Blue",
      prod_obsd_set_02: "Sage Forest",
      prod_obsd_vest_03: "Cream Beige",
      prod_obsd_shirt_04: "Forest Green",
      prod_obsd_socks_05: "Oat Cream",
      prod_obsd_hoodie_06: "Sage Forest",
    }
  );

  // Pre-seeded with the R550 Wide-Leg Lounge Joggers
  const [cart, setCart] = useState<CartEntry[]>([
    { productId: "prod_obsd_jogger_01", size: "L", quantity: 1 },
  ]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [promoCode, setPromoCode] = useState<"NONE" | "OBSD10" | "SANCTUARY">(
    "NONE"
  );
  const [promoInput, setPromoInput] = useState("");

  // Fit Calculator state
  const [heightCm, setHeightCm] = useState(180);
  const [weightKg, setWeightKg] = useState(76);
  const [fitPreference, setFitPreference] = useState<"tailored" | "sanctuary">(
    "sanctuary"
  );

  // Checkout state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<{
    ok?: boolean;
    message?: string;
    orderId?: string;
    yocoUrl?: string;
  } | null>(null);

  // Medusa Fulfillment Queue & Compliance Documentation state
  const [isFulfillmentOpen, setIsFulfillmentOpen] = useState(false);
  const [isPoliciesOpen, setIsPoliciesOpen] = useState(false);
  const [fulfillmentQueue, setFulfillmentQueue] = useState<
    FulfillmentOrderRecord[]
  >([]);

  useEffect(() => {
    getFulfillmentQueueAction().then(setFulfillmentQueue);
  }, []);

  // Recommended size calculation using gsap.utils.clamp
  const recommendedSize = useMemo<"S" | "M" | "L" | "XL">(() => {
    const clampedH = gsap.utils.clamp(155, 205, heightCm);
    const clampedW = gsap.utils.clamp(50, 120, weightKg);
    const score =
      (clampedH - 155) * 0.6 +
      (clampedW - 50) * 0.8 +
      (fitPreference === "sanctuary" ? 8 : 0);
    if (score < 32) return "S";
    if (score < 52) return "M";
    if (score < 72) return "L";
    return "XL";
  }, [heightCm, weightKg, fitPreference]);

  const filteredProducts = useMemo(() => {
    return initialProducts.filter(
      (p) => selectedCategory === "all" || p.category === selectedCategory
    );
  }, [initialProducts, selectedCategory]);

  // Client-side preview mirrors server-side ZAR/USD pricing rules
  const cartSummary = useMemo(() => {
    let subtotalCents = 0;
    let totalQuantity = 0;
    const detailed = cart
      .map((entry) => {
        const product = initialProducts.find((p) => p.id === entry.productId);
        if (!product) return null;
        const unitCents =
          currency === "ZAR" ? product.priceZarCents : product.priceUsdCents;
        subtotalCents += unitCents * entry.quantity;
        totalQuantity += entry.quantity;
        return { ...entry, product, unitCents };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const bundleRate =
      totalQuantity >= 3 ? 0.2 : totalQuantity === 2 ? 0.15 : 0;
    const bundleDiscountCents = Math.round(subtotalCents * bundleRate);
    const afterBundle = subtotalCents - bundleDiscountCents;
    const promoDiscountCents =
      promoCode !== "NONE" ? Math.round(afterBundle * 0.1) : 0;
    const netMerchandise = Math.max(0, afterBundle - promoDiscountCents);
    const freeShippingThreshold = currency === "ZAR" ? 100000 : 6000;
    const standardShippingFee = currency === "ZAR" ? 7500 : 500;
    const freeShippingUnlocked =
      netMerchandise >= freeShippingThreshold || netMerchandise === 0;
    const shippingCents = freeShippingUnlocked ? 0 : standardShippingFee;
    const totalCents = netMerchandise + shippingCents;

    return {
      detailed,
      subtotalCents,
      bundleDiscountCents,
      promoDiscountCents,
      shippingCents,
      totalCents,
      totalQuantity,
      bundleRate,
      freeShippingUnlocked,
    };
  }, [cart, initialProducts, promoCode, currency]);

  // GSAP Animations
  const { contextSafe } = useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          canAnimate: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { reduced } = context.conditions || {};
          if (reduced) {
            gsap.set(
              [".hero-reveal", ".product-card", ".combo-card", ".ethos-block"],
              {
                autoAlpha: 1,
                y: 0,
                scale: 1,
              }
            );
            return;
          }

          const tl = gsap.timeline({
            defaults: { ease: "power3.out", duration: 0.75 },
          });
          tl.fromTo(
            ".hero-eyebrow",
            { autoAlpha: 0, y: 14 },
            { autoAlpha: 1, y: 0, duration: 0.5 }
          )
            .fromTo(
              ".hero-headline",
              { autoAlpha: 0, y: 24 },
              { autoAlpha: 1, y: 0 },
              "<0.12"
            )
            .fromTo(
              ".hero-copy",
              { autoAlpha: 0, y: 18 },
              { autoAlpha: 1, y: 0 },
              "<0.15"
            )
            .fromTo(
              ".hero-cta",
              { autoAlpha: 0, y: 14 },
              { autoAlpha: 1, y: 0, stagger: 0.08 },
              "<0.15"
            )
            .fromTo(
              ".hero-bento-card",
              { autoAlpha: 0, scale: 0.96, y: 20 },
              { autoAlpha: 1, scale: 1, y: 0, stagger: 0.1 },
              "<0.1"
            );

          ScrollTrigger.batch(".product-card", {
            start: "top 88%",
            onEnter: (batch) => {
              gsap.fromTo(
                batch,
                { autoAlpha: 0, y: 20, scale: 0.97 },
                {
                  autoAlpha: 1,
                  y: 0,
                  scale: 1,
                  duration: 0.45,
                  stagger: 0.06,
                  ease: "back.out(1.2)",
                  overwrite: "auto",
                }
              );
            },
          });

          ScrollTrigger.batch(".combo-card", {
            start: "top 88%",
            onEnter: (batch) => {
              gsap.fromTo(
                batch,
                { autoAlpha: 0, y: 22 },
                {
                  autoAlpha: 1,
                  y: 0,
                  duration: 0.5,
                  stagger: 0.08,
                  ease: "power2.out",
                  overwrite: "auto",
                }
              );
            },
          });
        }
      );

      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [selectedCategory] }
  );

  const pulseCartBadge = contextSafe(() => {
    gsap.fromTo(
      ".cart-badge-pill",
      { scale: 1.35 },
      { scale: 1, duration: 0.35, ease: "back.out(2)" }
    );
  });

  function handleAddToCart(
    productId: string,
    explicitSize?: "S" | "M" | "L" | "XL"
  ) {
    const size = explicitSize || selectedSizes[productId] || "L";
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.productId === productId && item.size === size
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: Math.min(10, updated[existingIndex].quantity + 1),
        };
        return updated;
      }
      return [...prev, { productId, size, quantity: 1 }];
    });
    pulseCartBadge();
    setIsCartOpen(true);
    setCheckoutStatus(null);
  }

  function handleAddCombo(productIds: string[]) {
    const size = recommendedSize;
    setCart((prev) => {
      const updated = [...prev];
      for (const pid of productIds) {
        const idx = updated.findIndex(
          (item) => item.productId === pid && item.size === size
        );
        if (idx > -1) {
          updated[idx] = {
            ...updated[idx],
            quantity: Math.min(10, updated[idx].quantity + 1),
          };
        } else {
          updated.push({ productId: pid, size, quantity: 1 });
        }
      }
      return updated;
    });
    pulseCartBadge();
    setIsCartOpen(true);
    setCheckoutStatus(null);
  }

  function handleAddFullSanctuarySet() {
    const size = recommendedSize;
    setCart([
      { productId: "prod_obsd_jogger_01", size, quantity: 1 },
      { productId: "prod_obsd_vest_03", size, quantity: 1 },
      { productId: "prod_obsd_socks_05", size, quantity: 1 },
    ]);
    pulseCartBadge();
    setIsCartOpen(true);
    setCheckoutStatus(null);
  }

  function updateQuantity(
    productId: string,
    size: "S" | "M" | "L" | "XL",
    delta: number
  ) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId && item.size === size
            ? { ...item, quantity: Math.min(10, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
    setCheckoutStatus(null);
  }

  function applyPromoCode(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = promoInput.trim().toUpperCase();
    if (cleaned === "OBSD10" || cleaned === "SANCTUARY") {
      setPromoCode(cleaned);
    } else {
      setPromoCode("NONE");
    }
  }

  async function handleCheckoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return;
    setIsSubmitting(true);
    setCheckoutStatus(null);

    const response = await submitOrderAction({
      items: cart,
      currency,
      fullName,
      email,
      shippingAddress,
      promoCode,
    });

    setIsSubmitting(false);
    if (response.ok && response.summary) {
      if (response.queueRecord) {
        setFulfillmentQueue((prev) => [
          response.queueRecord!,
          ...prev.filter((o) => o.orderId !== response.queueRecord!.orderId),
        ]);
      } else {
        const latest = await getFulfillmentQueueAction();
        setFulfillmentQueue(latest);
      }
      setCheckoutStatus({
        ok: true,
        orderId: response.orderId,
        yocoUrl: response.yocoRedirectUrl,
        message: `Verified (${formatCents(response.summary.totalCents, response.summary.currency)}) & logged to Medusa Fulfillment Queue. Opening Yoco Payment Gateway (pay.yoco.com/obsessed-ltd)...`,
      });
      if (response.yocoRedirectUrl) {
        window.open(response.yocoRedirectUrl, "_blank", "noopener,noreferrer");
      }
    } else {
      setCheckoutStatus({
        ok: false,
        message: response.error || "Security verification failed.",
      });
    }
  }

  return (
    <div
      ref={rootRef}
      className="min-h-screen flex flex-col bg-[#EAE3D5] text-[#0E1B13]"
    >
      {/* 1. Top Announcement Bar */}
      <div
        role="region"
        aria-label="Store promotions"
        className="bg-[#172A1E] text-[#EAE3D5]/90 text-[11px] tracking-[0.14em] uppercase border-b border-[#284232] py-2 px-4"
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
            <span>Tranquility in Each Stitch</span>
          </div>
          <div className="flex items-center gap-3 text-[#D2C8B8]">
            <span>2+ Pieces: 15% Off</span>
            <span className="opacity-40">•</span>
            <span>3+ Pieces: 20% Off</span>
            <span className="hidden md:inline opacity-40">•</span>
            <span className="hidden md:inline">
              Free Express Over {currency === "ZAR" ? "R1,000" : "$60"}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Sticky Navigation Header */}
      <header className="sticky top-0 z-40 bg-[#EAE3D5]/80 backdrop-blur-xl border-b border-[#D2C8B8]/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <a
            href="#"
            className="group flex items-center gap-3.5 cursor-pointer"
            aria-label="Obsessed LTD OBSD Home"
          >
            <div className="w-12 h-12 rounded-xl bg-[#172A1E] overflow-hidden flex items-center justify-center border border-[#D4AF37]/70 shadow-md ring-1 ring-[#D4AF37]/25 group-hover:border-[#D4AF37] transition-all">
              <img
                src="/products/obsd-logo.jpg"
                alt="OBSD Fluid Green & Gold Monogram Logo"
                className="w-full h-full object-cover scale-110 group-hover:scale-115 transition-transform duration-300"
              />
            </div>
            <div>
              <span className="block font-serif-display text-2xl font-semibold tracking-wider leading-none text-[#0E1B13]">
                OBSESSED LTD
              </span>
              <span className="block text-[10px] uppercase tracking-[0.2em] text-[#4A4F4B] mt-1">
                Tranquility in Each Stitch
              </span>
            </div>
          </a>

          <nav
            aria-label="Main Categories"
            className="hidden lg:flex items-center gap-8 text-xs uppercase tracking-[0.16em] font-medium text-[#284232]"
          >
            <a
              href="#catalog"
              className="hover:text-[#5E1B24] transition-colors cursor-pointer"
            >
              Collection
            </a>
            <a
              href="#fit-architecture"
              className="hover:text-[#5E1B24] transition-colors cursor-pointer"
            >
              Fit &amp; Craft
            </a>
            <a
              href="#combinations"
              className="hover:text-[#5E1B24] transition-colors cursor-pointer"
            >
              Combinations
            </a>
          </nav>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Currency Switcher: Fluid Glass Pill */}
            <div
              role="group"
              aria-label="Select store currency"
              className="inline-flex items-center rounded-full bg-[#F5F1E9]/65 backdrop-blur-md p-1 border border-white/70 shadow-xs"
            >
              <Globe className="w-3.5 h-3.5 text-[#4A4F4B] ml-2 mr-1 hidden sm:inline" />
              <button
                type="button"
                onClick={() => setCurrency("ZAR")}
                aria-pressed={currency === "ZAR"}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider cursor-pointer ${currency === "ZAR"
                  ? "btn-glass-primary"
                  : "btn-glass-light"
                  }`}
              >
                ZAR
              </button>
              <button
                type="button"
                onClick={() => setCurrency("USD")}
                aria-pressed={currency === "USD"}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider cursor-pointer ${currency === "USD"
                  ? "btn-glass-primary"
                  : "btn-glass-light"
                  }`}
              >
                USD
              </button>
            </div>

            <button
              type="button"
              onClick={async () => {
                const latest = await getFulfillmentQueueAction();
                setFulfillmentQueue(latest);
                setIsFulfillmentOpen(true);
              }}
              aria-label="Open Medusa Fulfillment Queue"
              className="btn-glass-light flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold tracking-wider cursor-pointer"
            >
              <PackageCheck className="w-4 h-4" />
              <span className="hidden md:inline">FULFILLMENT</span>
              <span className="px-1.5 py-0.5 rounded-full bg-black/10 text-[10px] font-bold">
                {fulfillmentQueue.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              aria-label={`Open Obsessed LTD Bag with ${cartSummary.totalQuantity} items`}
              className="cart-badge-pill btn-glass-primary flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold tracking-wider cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">BAG</span>
              <span className="px-2 py-0.5 rounded-full bg-black/20 border border-current/20 text-[11px] font-bold">
                {cartSummary.totalQuantity}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* 3. Hero Section */}
        <section className="relative py-12 sm:py-16 px-4 sm:px-6 lg:px-8 border-b border-[#D2C8B8]/70">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Left Column: Deep Canopy Green Manifesto Card */}
            <div className="lg:col-span-7 rounded-3xl bg-[#172A1E] text-[#EAE3D5] p-8 sm:p-12 flex flex-col justify-between relative overflow-hidden shadow-xl border border-[#284232]">
              <div className="relative z-10">
                <div className="hero-eyebrow inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/8 backdrop-blur-md text-[#EAE3D5] text-[11px] font-medium tracking-[0.2em] uppercase mb-7 border border-white/15">
                  <TreePine className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>OBSESSED LTD • SANCTUARY LOUNGEWEAR</span>
                </div>

                <h1 className="hero-headline font-serif-display text-4xl sm:text-6xl font-medium leading-[1.08] tracking-tight text-[#F5F1E9]">
                  Tranquility in Each Stitch.
                </h1>

                <p className="hero-copy mt-5 text-sm sm:text-base text-[#D2C8B8]/90 leading-relaxed max-w-xl font-light">
                  Heavyweight organic fleece joggers, sweaters, 2-piece sets, ribbed vests, and cushioned crew socks—crafted in calm forest and earth tones for stillness at home or effortless drape outdoors.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-3.5">
                  <a
                    href="#catalog"
                    className="hero-cta btn-glass-accent inline-flex items-center gap-2.5 px-7 py-3.5 text-xs uppercase tracking-[0.16em] font-semibold cursor-pointer"
                  >
                    <span>Explore Collection</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>

                  <a
                    href="#combinations"
                    className="hero-cta btn-glass-frost-dark inline-flex items-center gap-2 px-6 py-3.5 text-xs uppercase tracking-[0.16em] font-medium cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Styled Combinations</span>
                  </a>
                </div>
              </div>

              {/* Clean Minimal Specs Bar */}
              <div className="relative z-10 mt-12 pt-8 border-t border-white/10 grid grid-cols-3 gap-6">
                <div>
                  <div className="font-serif-display text-2xl sm:text-3xl font-medium text-[#F5F1E9]">
                    500 GSM
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-[#D2C8B8]/75 mt-1">
                    Organic Fleece
                  </div>
                </div>
                <div>
                  <div className="font-serif-display text-2xl sm:text-3xl font-medium text-[#F5F1E9]">
                    4 Tones
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-[#D2C8B8]/75 mt-1">
                    Earth Palette
                  </div>
                </div>
                <div>
                  <div className="font-serif-display text-2xl sm:text-3xl font-medium text-[#F5F1E9]">
                    4.98 ★
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-[#D2C8B8]/75 mt-1">
                    Verified Fit
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Dual Bento Cards */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="hero-bento-card relative flex-1 min-h-[290px] rounded-3xl overflow-hidden border border-[#D2C8B8] shadow-lg group">
                <img
                  src="/products/obsist-crewneck-sets.jpg"
                  alt="Obsessed LTD Sage Forest and Cream Beige 2-Piece Crewneck & Wide-Leg Jogger Sets"
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0E1B13]/85 via-[#0E1B13]/20 to-transparent p-7 flex flex-col justify-end text-[#F5F1E9]">
                  <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#D4AF37] mb-1">
                    Signature Uniform • {currency === "ZAR" ? "R950" : "$52"}
                  </span>
                  <h2 className="font-serif-display text-2xl sm:text-3xl font-medium">
                    Sage &amp; Oat 2-Piece Sets
                  </h2>
                </div>
              </div>

              <div className="hero-bento-card rounded-3xl bg-[#172A1E]/95 text-[#F5F1E9] p-5 border border-[#284232] shadow-md flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src="/products/obsist-ribbed-socks.jpg"
                    alt="Obsessed LTD Cushioned Ribbed Crew Socks"
                    className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-white/15"
                  />
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#D2C8B8]/80 block">
                      Everyday Essential
                    </span>
                    <h3 className="font-serif-display text-xl font-medium mt-0.5">
                      3-Pack Ribbed Socks
                    </h3>
                    <span className="text-xs text-[#D4AF37] font-medium">
                      {currency === "ZAR" ? "R220" : "$12"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddToCart("prod_obsd_socks_05", "M")}
                  className="btn-glass-frost-dark shrink-0 px-5 py-2.5 text-xs font-medium tracking-wider cursor-pointer"
                >
                  + Add
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Minimalist Earth-Tone Palette Bar */}
        <section className="py-6 px-4 sm:px-6 lg:px-8 bg-[#F5F1E9]/70 border-b border-[#D2C8B8]/70">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <span className="text-xs uppercase tracking-[0.22em] font-medium text-[#4A4F4B]">
              The Signature Palette
            </span>

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#2A5A41] border border-black/15 shadow-2xs" />
                <span className="text-xs font-medium text-[#0E1B13]">Forest Sage</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#E8DEC8] border border-black/20 shadow-2xs" />
                <span className="text-xs font-medium text-[#0E1B13]">Oat Beige</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#4A2529] border border-black/15 shadow-2xs" />
                <span className="text-xs font-medium text-[#0E1B13]">Espresso Maroon</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#5B7083] border border-black/15 shadow-2xs" />
                <span className="text-xs font-medium text-[#0E1B13]">Slate Blue</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#363A3D] border border-black/15 shadow-2xs" />
                <span className="text-xs font-medium text-[#0E1B13]">Charcoal Grey</span>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Main Product Catalog */}
        <section
          id="catalog"
          className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5E1B24]">
                COLLECTION
              </span>
              <h2 className="font-serif-display text-3xl sm:text-5xl font-medium text-[#0E1B13] mt-1">
                The Loungewear Lineup
              </h2>
            </div>

            {/* Category Glass Pills */}
            <div
              role="tablist"
              aria-label="Filter garments by category"
              className="flex flex-wrap gap-2"
            >
              {(
                [
                  { id: "all", label: "All (7)" },
                  { id: "joggers", label: "Joggers" },
                  { id: "shorts", label: "Shorts" },
                  { id: "sets", label: "2-Piece Sets" },
                  { id: "vests", label: "Vests" },
                  { id: "shirts", label: "Tees" },
                  { id: "socks", label: "Socks" },
                  { id: "hoodies", label: "Sweaters" },
                ] as { id: CategorySlug; label: string }[]
              ).map((tab) => {
                const active = selectedCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setSelectedCategory(tab.id)}
                    className={`px-4 py-2 text-xs font-medium tracking-wider cursor-pointer ${active
                      ? "btn-glass-primary"
                      : "btn-glass-light"
                      }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProducts.map((product) => {
              const currentSize = selectedSizes[product.id] || "L";
              const currentColor =
                selectedColors[product.id] ||
                product.colors[0]?.name ||
                product.colorName;
              const displayPrice = formatCurrencyPrice(
                product.priceZarCents,
                product.priceUsdCents,
                currency
              );
              const displayCompare = formatCurrencyPrice(
                product.compareAtZarCents,
                product.compareAtUsdCents,
                currency
              );

              return (
                <article
                  key={product.id}
                  className="product-card rounded-3xl bg-[#F5F1E9] border border-[#D2C8B8]/80 overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-xl transition-all duration-300"
                >
                  <div>
                    {/* Image Container with Hover Secondary Look + Badges */}
                    <div className="relative h-80 bg-[#DFD5C3] overflow-hidden group">
                      <img
                        src={product.image}
                        alt={product.title}
                        loading="lazy"
                        className="w-full h-full object-cover object-center group-hover:opacity-0 transition-opacity duration-500"
                      />
                      <img
                        src={product.hoverImage}
                        alt={`${product.title} alternate view`}
                        loading="lazy"
                        className="w-full h-full object-cover object-center absolute inset-0 opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                      />

                      {product.badge && (
                        <span className="absolute top-3.5 left-3.5 px-3 py-1 rounded-full bg-[#172A1E]/80 backdrop-blur-md border border-white/15 text-[#F5F1E9] text-[10px] font-medium tracking-[0.14em] uppercase">
                          {product.badge}
                        </span>
                      )}

                      <span className="absolute top-3.5 right-3.5 px-3 py-1 rounded-full bg-[#F5F1E9]/75 backdrop-blur-md text-[#0E1B13] text-[10px] font-medium tracking-wider border border-white/60">
                        {product.gsm}
                      </span>
                    </div>

                    {/* Clean Typography Card Body */}
                    <div className="p-6 pb-4">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[#4A4F4B] mb-2">
                        <span className="font-medium text-[#284232]">
                          Color: <strong>{currentColor}</strong>
                        </span>
                        <span className="flex items-center gap-1 font-medium text-[#0E1B13]">
                          <Star className="w-3 h-3 fill-[#D97706] text-[#D97706]" />
                          {product.rating}
                        </span>
                      </div>

                      <h3 className="font-serif-display text-2xl font-medium text-[#0E1B13] leading-snug">
                        {product.title}
                      </h3>
                      <p className="text-xs text-[#4A4F4B] mt-1.5 leading-relaxed line-clamp-2 font-light">
                        {product.subtitle}
                      </p>

                      {/* Colorway Swatches (Includes Slate Blue & Charcoal Grey on every item) */}
                      <div
                        className="mt-4 flex items-center gap-2"
                        role="group"
                        aria-label={`Select color for ${product.title}`}
                      >
                        {product.colors.map((c) => {
                          const isColorActive = currentColor === c.name;
                          return (
                            <button
                              key={c.name}
                              type="button"
                              title={c.name}
                              aria-label={`${c.name} color`}
                              aria-pressed={isColorActive}
                              onClick={() =>
                                setSelectedColors((prev) => ({
                                  ...prev,
                                  [product.id]: c.name,
                                }))
                              }
                              className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                                isColorActive
                                  ? "scale-115 ring-2 ring-[#172A1E] ring-offset-2 ring-offset-[#F5F1E9] border-black/30"
                                  : "border-black/20 hover:scale-110"
                              }`}
                              style={{ backgroundColor: c.hex }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Size Selector & Fluid Glass Add Button */}
                  <div className="px-6 pb-6 pt-3 border-t border-[#EAE3D5]">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#4A4F4B]">
                        Size
                      </span>
                      <div
                        className="flex items-center gap-1.5"
                        role="group"
                        aria-label={`Select size for ${product.title}`}
                      >
                        {product.variants.map((v) => {
                          const isSelected = currentSize === v.size;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() =>
                                setSelectedSizes((prev) => ({
                                  ...prev,
                                  [product.id]: v.size,
                                }))
                              }
                              className={`w-8 h-8 rounded-full text-[11px] font-medium cursor-pointer ${isSelected
                                ? "btn-glass-primary"
                                : "btn-glass-light"
                                }`}
                            >
                              {v.size}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="text-lg font-semibold text-[#0E1B13]">
                          {displayPrice}
                        </span>
                        <span className="ml-2 text-xs line-through text-[#6C726D]/80">
                          {displayCompare}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleAddToCart(product.id, currentSize)
                        }
                        className="btn-glass-accent flex-1 py-3 px-5 text-xs uppercase tracking-[0.14em] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add ({currentSize})</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* 6. Interactive Fit & GSM Architecture Finder */}
        <section
          id="fit-architecture"
          className="py-16 px-4 sm:px-6 lg:px-8 bg-[#172A1E] text-[#EAE3D5] border-y border-[#284232]"
        >
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-5">
              <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#D4AF37] block">
                CRAFT &amp; PROPORTION
              </span>
              <h2 className="font-serif-display text-3xl sm:text-5xl font-medium text-[#F5F1E9] leading-tight">
                Crafted for Stillness &amp; Movement.
              </h2>
              <p className="text-sm text-[#D2C8B8]/90 leading-relaxed font-light max-w-lg">
                Unbranded minimalism meets 310–520 GSM organic cotton. Pre-shrunk and enzyme-washed so every garment holds its drape wash after wash.
              </p>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10">
                  <div className="flex items-center gap-2 font-medium text-xs uppercase tracking-wider text-[#F5F1E9]">
                    <Layers className="w-4 h-4 text-[#D4AF37]" />
                    <span>310–520 GSM</span>
                  </div>
                  <p className="text-xs text-[#D2C8B8]/80 mt-1 font-light">
                    Structured drape without knee sagging.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10">
                  <div className="flex items-center gap-2 font-medium text-xs uppercase tracking-wider text-[#F5F1E9]">
                    <Flame className="w-4 h-4 text-[#D4AF37]" />
                    <span>Enzyme Washed</span>
                  </div>
                  <p className="text-xs text-[#D2C8B8]/80 mt-1 font-light">
                    Zero-shrinkage softness from day one.
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive Fit Dial Card */}
            <div className="lg:col-span-6 rounded-3xl bg-[#F5F1E9] text-[#0E1B13] p-6 sm:p-8 border border-[#D2C8B8] shadow-xl">
              <div className="flex items-center justify-between border-b border-[#D2C8B8]/70 pb-4 mb-6">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5E1B24]">
                    SIZE CALCULATOR
                  </span>
                  <h3 className="font-serif-display text-2xl font-medium">
                    Find Your Fit
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-[11px] uppercase tracking-wider text-[#4A4F4B] block">
                    Recommended
                  </span>
                  <span className="font-serif-display text-3xl font-semibold text-[#5E1B24]">
                    Size {recommendedSize}
                  </span>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-xs font-medium mb-1.5">
                    <label htmlFor="height-range">Height</label>
                    <span>
                      {heightCm} cm ({Math.floor(heightCm / 30.48)}&apos;
                      {Math.round((heightCm % 30.48) / 2.54)}&quot;)
                    </span>
                  </div>
                  <input
                    id="height-range"
                    type="range"
                    min={155}
                    max={205}
                    value={heightCm}
                    onChange={(e) => setHeightCm(Number(e.target.value))}
                    className="w-full accent-[#172A1E] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium mb-1.5">
                    <label htmlFor="weight-range">Weight</label>
                    <span>
                      {weightKg} kg ({Math.round(weightKg * 2.20462)} lbs)
                    </span>
                  </div>
                  <input
                    id="weight-range"
                    type="range"
                    min={50}
                    max={120}
                    value={weightKg}
                    onChange={(e) => setWeightKg(Number(e.target.value))}
                    className="w-full accent-[#172A1E] cursor-pointer"
                  />
                </div>

                <div>
                  <span className="block text-xs font-medium mb-2">
                    Preferred Silhouette
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFitPreference("sanctuary")}
                      className={`py-2.5 px-4 text-xs font-medium cursor-pointer ${fitPreference === "sanctuary"
                        ? "btn-glass-primary"
                        : "btn-glass-light"
                        }`}
                    >
                      Relaxed Lounge
                    </button>
                    <button
                      type="button"
                      onClick={() => setFitPreference("tailored")}
                      className={`py-2.5 px-4 text-xs font-medium cursor-pointer ${fitPreference === "tailored"
                        ? "btn-glass-primary"
                        : "btn-glass-light"
                        }`}
                    >
                      Closer Tapered
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Possible Combinations Lookbook */}
        <section
          id="combinations"
          className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5E1B24]">
                CURATED PAIRINGS
              </span>
              <h2 className="font-serif-display text-3xl sm:text-5xl font-medium text-[#0E1B13] mt-1">
                Styled Combinations
              </h2>
            </div>
            <p className="text-xs text-[#4A4F4B] font-light">
              Add any paired look in your recommended size ({recommendedSize}) for automatic 15%–20% bundle savings.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Combination 01 */}
            <article className="combo-card rounded-3xl bg-[#F5F1E9] border border-[#D2C8B8]/80 overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-xl transition-all duration-300">
              <div className="relative h-[430px] bg-[#172A1E] overflow-hidden group">
                <img
                  src="/products/combo-maroon-vest-beige-jogger.jpg"
                  alt="Oxblood Maroon Ribbed Vest paired with Oat Beige Wide-Leg Lounge Joggers"
                  loading="lazy"
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0E1B13]/85 via-transparent to-transparent p-6 flex flex-col justify-end text-[#F5F1E9]">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-medium">
                    Look 01 • Maroon &amp; Oat
                  </span>
                  <h3 className="font-serif-display text-2xl font-medium text-[#F5F1E9] mt-0.5">
                    Warm Earth Contrast
                  </h3>
                </div>
              </div>

              <div className="p-5 bg-[#F5F1E9] flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-[#0E1B13]">
                    Vest + Joggers + Socks
                  </div>
                  <div className="text-xs text-[#5E1B24] font-semibold mt-0.5">
                    {currency === "ZAR" ? "R976" : "$53.60"}{" "}
                    <span className="text-[11px] font-normal text-[#4A4F4B]">
                      (20% Off)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleAddCombo([
                      "prod_obsd_jogger_01",
                      "prod_obsd_vest_03",
                      "prod_obsd_socks_05",
                    ])
                  }
                  className="btn-glass-primary shrink-0 px-5 py-2.5 text-xs font-medium tracking-wider cursor-pointer"
                >
                  + Add Look ({recommendedSize})
                </button>
              </div>
            </article>

            {/* Combination 02 */}
            <article className="combo-card rounded-3xl bg-[#F5F1E9] border border-[#D2C8B8]/80 overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-xl transition-all duration-300">
              <div className="relative h-[430px] bg-[#172A1E] overflow-hidden group">
                <img
                  src="/products/combo-gray-vest-maroon-jogger.jpg"
                  alt="Heather Gray Ribbed Vest paired with Deep Maroon Wide-Leg Joggers"
                  loading="lazy"
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0E1B13]/85 via-transparent to-transparent p-6 flex flex-col justify-end text-[#F5F1E9]">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-medium">
                    Look 02 • Slate &amp; Maroon
                  </span>
                  <h3 className="font-serif-display text-2xl font-medium text-[#F5F1E9] mt-0.5">
                    Slate &amp; Oxblood Rotation
                  </h3>
                </div>
              </div>

              <div className="p-5 bg-[#F5F1E9] flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-[#0E1B13]">
                    Vest + Joggers + Socks
                  </div>
                  <div className="text-xs text-[#5E1B24] font-semibold mt-0.5">
                    {currency === "ZAR" ? "R976" : "$53.60"}{" "}
                    <span className="text-[11px] font-normal text-[#4A4F4B]">
                      (20% Off)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleAddCombo([
                      "prod_obsd_vest_03",
                      "prod_obsd_jogger_01",
                      "prod_obsd_socks_05",
                    ])
                  }
                  className="btn-glass-primary shrink-0 px-5 py-2.5 text-xs font-medium tracking-wider cursor-pointer"
                >
                  + Add Look ({recommendedSize})
                </button>
              </div>
            </article>

            {/* Combination 03 */}
            <article className="combo-card rounded-3xl bg-[#F5F1E9] border border-[#D2C8B8]/80 overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-xl transition-all duration-300">
              <div className="relative h-[430px] bg-[#172A1E] overflow-hidden group">
                <img
                  src="/products/combo-sage-crewneck-set.jpg"
                  alt="Monochrome Sage Forest Green Crewneck and Wide-Leg Jogger Set"
                  loading="lazy"
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0E1B13]/85 via-transparent to-transparent p-6 flex flex-col justify-end text-[#F5F1E9]">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-medium">
                    Look 03 • Monochrome Sage
                  </span>
                  <h3 className="font-serif-display text-2xl font-medium text-[#F5F1E9] mt-0.5">
                    Sage Canopy Uniform
                  </h3>
                </div>
              </div>

              <div className="p-5 bg-[#F5F1E9] flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-[#0E1B13]">
                    2-Piece Set + Socks
                  </div>
                  <div className="text-xs text-[#5E1B24] font-semibold mt-0.5">
                    {currency === "ZAR" ? "R994.50" : "$54.40"}{" "}
                    <span className="text-[11px] font-normal text-[#4A4F4B]">
                      (15% Off)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleAddCombo(["prod_obsd_set_02", "prod_obsd_socks_05"])
                  }
                  className="btn-glass-primary shrink-0 px-5 py-2.5 text-xs font-medium tracking-wider cursor-pointer"
                >
                  + Add Look ({recommendedSize})
                </button>
              </div>
            </article>
          </div>
        </section>
      </main>

      {/* 8. Footer with Verified Yoco & SA ECTA/POPIA Merchant Compliance Links */}
      <footer className="bg-[#0E1B13] text-[#EAE3D5] py-12 px-4 sm:px-6 lg:px-8 border-t border-[#284232]">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <img
                  src="/products/obsd-logo.jpg"
                  alt="OBSD Fluid Green & Gold Monogram Logo"
                  className="w-10 h-10 rounded-lg object-cover border border-[#D4AF37]/60"
                />
                <span className="font-serif-display text-xl font-bold tracking-wider">
                  OBSESSED LTD (OBSD) — TRANQUILITY IN EACH STITCH
                </span>
              </div>
              <p className="text-xs text-[#D2C8B8]/80 mt-2 max-w-md">
                Heavyweight organic loungewear crafted in forest sage, oat beige, espresso maroon, slate blue, and charcoal grey.
              </p>
            </div>
            <div className="text-xs text-[#D2C8B8]/70 space-y-1.5 sm:text-right">
              <div className="flex items-center sm:justify-end gap-1.5 text-[#D4AF37]">
                <Lock className="w-3.5 h-3.5" />
                <span>Yoco 3D Secure v2 • PCI-DSS Level 1 • HMAC-SHA256</span>
              </div>
              <div>
                Merchant Contact: laidinjansen13@gmail.com • South Africa (ZAR)
              </div>
              <div>
                © {new Date().getFullYear()} OBSESSED LTD (OBSD). All rights reserved.
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-[#284232] flex flex-wrap items-center justify-between gap-4 text-xs text-[#D2C8B8]">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPoliciesOpen(true)}
                className="btn-glass-frost-dark px-4 py-1.5 text-[11px] font-medium cursor-pointer"
              >
                Shipping &amp; Delivery Policy
              </button>
              <button
                type="button"
                onClick={() => setIsPoliciesOpen(true)}
                className="btn-glass-frost-dark px-4 py-1.5 text-[11px] font-medium cursor-pointer"
              >
                Returns &amp; Refunds (ECTA)
              </button>
              <button
                type="button"
                onClick={() => setIsPoliciesOpen(true)}
                className="btn-glass-frost-dark px-4 py-1.5 text-[11px] font-medium cursor-pointer"
              >
                POPIA Privacy &amp; Terms
              </button>
              <button
                type="button"
                onClick={() => setIsPoliciesOpen(true)}
                className="btn-glass-frost-dark px-4 py-1.5 text-[11px] font-medium cursor-pointer"
              >
                Yoco Payment Security
              </button>
            </div>
            <span className="text-[11px] text-[#D2C8B8]/70">
              Verified ECTA &amp; POPIA Merchant Documentation
            </span>
          </div>
        </div>
      </footer>

      {/* 10. Slide-Over Sanctuary Bag & Secure Server-Action Checkout Drawer */}
      {isCartOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Obsessed LTD Shopping Bag and Checkout"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex justify-end"
        >
          <div className="bg-[#F5F1E9] text-[#0E1B13] w-full max-w-md h-full flex flex-col justify-between shadow-2xl border-l border-[#D2C8B8] overflow-y-auto">
            <div className="p-6 space-y-5">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-[#D2C8B8] pb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#5E1B24]">
                    OBSESSED LTD MEDUSA BAG ({currency})
                  </span>
                  <h2 className="font-serif-display text-2xl font-bold">
                    Your Obsessed LTD Bag ({cartSummary.totalQuantity})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCartOpen(false)}
                  aria-label="Close bag drawer"
                  className="btn-glass-light p-2.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dynamic Bundle Tier Progress Bar */}
              <div className="p-3.5 rounded-2xl bg-[#172A1E] text-[#EAE3D5] space-y-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>
                    {cartSummary.totalQuantity === 0 &&
                      "Add 2 pieces for 15% off • 3+ for 20% off"}
                    {cartSummary.totalQuantity === 1 &&
                      "Add 1 more piece to unlock 15% OFF"}
                    {cartSummary.totalQuantity === 2 &&
                      "15% Off Unlocked • Add 1 more for 20% OFF"}
                    {cartSummary.totalQuantity >= 3 &&
                      "★ 20% Bundle Discount Active"}
                  </span>
                  <span className="text-[#D4AF37] font-semibold">
                    {Math.min(
                      100,
                      Math.round((cartSummary.totalQuantity / 3) * 100)
                    )}
                    %
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#284232] overflow-hidden">
                  <div
                    className="h-full bg-[#D4AF37] transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (cartSummary.totalQuantity / 3) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Cart Items */}
              {cartSummary.detailed.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <p className="text-sm text-[#4A4F4B]">
                    Your Obsessed LTD bag is currently empty.
                  </p>
                  <button
                    type="button"
                    onClick={handleAddFullSanctuarySet}
                    className="btn-glass-accent px-6 py-2.5 text-xs font-medium cursor-pointer"
                  >
                    Add 3-Piece Rotation (20% Off)
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {cartSummary.detailed.map((item) => (
                    <div
                      key={`${item.productId}-${item.size}`}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#EAE3D5]/75 border border-[#D2C8B8]"
                    >
                      <img
                        src={item.product.image}
                        alt={item.product.title}
                        className="w-14 h-16 rounded-xl object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs font-semibold text-[#0E1B13] truncate">
                          {item.product.title}
                        </h3>
                        <p className="text-[11px] text-[#4A4F4B]">
                          Size {item.size} • {formatCents(item.unitCents, currency)}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.productId, item.size, -1)
                            }
                            aria-label={`Decrease quantity of ${item.product.title}`}
                            className="btn-glass-light w-6 h-6 flex items-center justify-center cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.productId, item.size, 1)
                            }
                            aria-label={`Increase quantity of ${item.product.title}`}
                            className="btn-glass-light w-6 h-6 flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-[#0E1B13]">
                        {formatCents(item.unitCents * item.quantity, currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Promo Code Form */}
              <form onSubmit={applyPromoCode} className="flex gap-2">
                <label htmlFor="promo-code-input" className="sr-only">
                  Promo code
                </label>
                <input
                  id="promo-code-input"
                  type="text"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                  placeholder="Promo code (OBSD10)"
                  className="flex-1 px-4 py-2 rounded-full bg-[#EAE3D5]/80 border border-[#D2C8B8] text-xs"
                />
                <button
                  type="submit"
                  className="btn-glass-primary px-5 py-2 text-xs font-medium cursor-pointer"
                >
                  Apply
                </button>
              </form>
            </div>

            {/* Pricing Breakdown & Secure Server Action Checkout Form */}
            {cartSummary.detailed.length > 0 && (
              <div className="p-6 bg-[#EAE3D5] border-t border-[#D2C8B8] space-y-4">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-[#4A4F4B]">
                    <span>Subtotal ({currency})</span>
                    <span>
                      {formatCents(cartSummary.subtotalCents, currency)}
                    </span>
                  </div>
                  {cartSummary.bundleDiscountCents > 0 && (
                    <div className="flex justify-between text-[#172A1E] font-semibold">
                      <span>
                        Automatic Bundle Discount (
                        {Math.round(cartSummary.bundleRate * 100)}% Off)
                      </span>
                      <span>
                        -
                        {formatCents(
                          cartSummary.bundleDiscountCents,
                          currency
                        )}
                      </span>
                    </div>
                  )}
                  {cartSummary.promoDiscountCents > 0 && (
                    <div className="flex justify-between text-[#5E1B24] font-semibold">
                      <span>Promo Code ({promoCode})</span>
                      <span>
                        -
                        {formatCents(
                          cartSummary.promoDiscountCents,
                          currency
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-[#4A4F4B]">
                    <span>Shipping</span>
                    <span>
                      {cartSummary.shippingCents === 0
                        ? "FREE EXPRESS"
                        : formatCents(cartSummary.shippingCents, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-[#0E1B13] pt-2 border-t border-[#D2C8B8]">
                    <span>Verified Total ({currency})</span>
                    <span>
                      {formatCents(cartSummary.totalCents, currency)}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleCheckoutSubmit} className="space-y-2.5">
                  <div>
                    <label
                      htmlFor="checkout-name"
                      className="block text-[11px] font-semibold mb-1"
                    >
                      Full Name
                    </label>
                    <input
                      id="checkout-name"
                      required
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Sipho Ndlovu"
                      className="w-full px-3 py-2 rounded-lg bg-[#F5F1E9] border border-[#D2C8B8] text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="checkout-email"
                      className="block text-[11px] font-semibold mb-1"
                    >
                      Email for Obsessed LTD Receipt
                    </label>
                    <input
                      id="checkout-email"
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@obsessedltd.co.za"
                      className="w-full px-3 py-2 rounded-lg bg-[#F5F1E9] border border-[#D2C8B8] text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="checkout-address"
                      className="block text-[11px] font-semibold mb-1"
                    >
                      Delivery Address (SA or International)
                    </label>
                    <input
                      id="checkout-address"
                      required
                      type="text"
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="14 Kloof Street, Gardens, Cape Town, 8001"
                      className="w-full px-3 py-2 rounded-lg bg-[#F5F1E9] border border-[#D2C8B8] text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-glass-accent w-full py-3.5 text-xs uppercase tracking-[0.16em] font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {isSubmitting
                        ? "Connecting to Yoco PayGate..."
                        : `Pay Securely via Yoco • ${formatCents(cartSummary.totalCents, currency)}`}
                    </span>
                  </button>
                </form>

                {checkoutStatus && (
                  <div
                    role="status"
                    className={`p-3.5 rounded-2xl text-xs border space-y-2 ${checkoutStatus.ok
                      ? "bg-[#172A1E] text-[#F5F1E9] border-[#284232]"
                      : "bg-red-950 text-red-100 border-red-800"
                      }`}
                  >
                    {checkoutStatus.ok && (
                      <div className="flex items-center gap-1.5 font-bold text-[#D4AF37]">
                        <Check className="w-4 h-4" />
                        <span>Order Confirmed: {checkoutStatus.orderId}</span>
                      </div>
                    )}
                    <p>{checkoutStatus.message}</p>
                    {checkoutStatus.ok && checkoutStatus.yocoUrl && (
                      <a
                        href={checkoutStatus.yocoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-glass-accent w-full py-2.5 px-3 text-[11px] uppercase tracking-wider font-semibold flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Pay Now on Yoco (pay.yoco.com/obsessed-ltd) →</span>
                      </a>
                    )}
                    {checkoutStatus.ok && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCartOpen(false);
                          setIsFulfillmentOpen(true);
                        }}
                        className="btn-glass-primary w-full py-2 px-3 text-[11px] uppercase tracking-wider font-semibold flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>Open Medusa Fulfillment Queue →</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 11. Medusa v2 Fulfillment Queue Modal */}
      {isFulfillmentOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Obsessed LTD Medusa Fulfillment Queue"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#F5F1E9] text-[#0E1B13] w-full max-w-3xl max-h-[88vh] rounded-3xl shadow-2xl border border-[#D2C8B8] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 bg-[#172A1E] text-[#F5F1E9] flex items-center justify-between border-b border-[#284232]">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
                  <Truck className="w-3.5 h-3.5" />
                  <span>MEDUSA V2 FULFILLMENT ENGINE • HMAC-SHA256 VERIFIED</span>
                </div>
                <h2 className="font-serif-display text-2xl sm:text-3xl font-medium mt-0.5">
                  Obsessed LTD (OBSD) Fulfillment Queue ({fulfillmentQueue.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsFulfillmentOpen(false)}
                aria-label="Close fulfillment queue"
                className="btn-glass-frost-dark p-2.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Queue List */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {fulfillmentQueue.map((order) => {
                const statusLabel =
                  order.status === "awaiting_picking"
                    ? "Awaiting Warehouse Pick"
                    : order.status === "packed"
                      ? "Packed & Kraft Sealed"
                      : "Dispatched via Express Courier";

                return (
                  <div
                    key={order.orderId}
                    className="p-5 rounded-2xl bg-[#EAE3D5]/75 border border-[#D2C8B8] space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#D2C8B8]/80 pb-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-serif-display text-xl font-bold text-[#0E1B13]">
                            {order.orderId}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-[#172A1E] text-[#D4AF37] text-[10px] font-semibold uppercase tracking-wider">
                            {statusLabel}
                          </span>
                        </div>
                        <p className="text-xs text-[#4A4F4B] mt-0.5">
                          <strong>{order.fullName}</strong> ({order.email}) •{" "}
                          {order.shippingAddress}
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-bold text-[#0E1B13]">
                          {formatCents(order.totalCents, order.currency)} (
                          {order.currency})
                        </div>
                        <div className="text-[10px] text-[#4A4F4B]">
                          {new Date(order.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Line Items */}
                    <div className="space-y-1.5">
                      {order.items.map((item, idx) => (
                        <div
                          key={`${order.orderId}-${item.productId}-${item.size}-${idx}`}
                          className="flex items-center justify-between text-xs bg-[#F5F1E9] px-3 py-2 rounded-xl border border-[#D2C8B8]/60"
                        >
                          <span>
                            <strong>{item.quantity}x</strong> {item.title}{" "}
                            <span className="text-[#4A4F4B]">
                              (Size {item.size})
                            </span>
                          </span>
                          <span className="font-medium">
                            {formatCents(
                              item.unitCents * item.quantity,
                              order.currency
                            )}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* HMAC & Yoco Verification Footer & Action Button */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono text-[#284232] bg-[#F5F1E9] px-2.5 py-1 rounded-lg border border-[#D2C8B8]">
                          Yoco: {order.yocoCheckoutId} ({order.yocoMode})
                        </span>
                        <span className="text-[10px] font-mono text-[#284232] bg-[#F5F1E9] px-2.5 py-1 rounded-lg border border-[#D2C8B8]">
                          HMAC-SHA256: {order.hmacSignature.slice(0, 18)}...
                        </span>
                      </div>

                      {order.status !== "dispatched" ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const updated =
                              await advanceFulfillmentStatusAction(
                                order.orderId
                              );
                            setFulfillmentQueue(updated);
                          }}
                          className="btn-glass-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-wider cursor-pointer"
                        >
                          {order.status === "awaiting_picking"
                            ? "Mark as Packed →"
                            : "Dispatch Courier →"}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#172A1E]">
                          <Check className="w-4 h-4 text-[#284232]" />
                          Fulfilled &amp; Dispatched
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 12. Verified Merchant Compliance, Shipping, Returns & Yoco Security Modal */}
      {isPoliciesOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Obsessed LTD Verified Merchant Documentation and Policies"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#F5F1E9] text-[#0E1B13] w-full max-w-3xl max-h-[88vh] rounded-3xl shadow-2xl border border-[#D2C8B8] flex flex-col overflow-hidden">
            <div className="p-6 bg-[#172A1E] text-[#F5F1E9] flex items-center justify-between border-b border-[#284232]">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>VERIFIED MERCHANT DOCUMENTATION • SA ECTA &amp; POPIA COMPLIANT</span>
                </div>
                <h2 className="font-serif-display text-2xl sm:text-3xl font-medium mt-0.5">
                  Obsessed LTD (OBSD) — Legal, Shipping, Returns &amp; Yoco Security
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsPoliciesOpen(false)}
                aria-label="Close policies modal"
                className="btn-glass-frost-dark p-2.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs leading-relaxed text-[#284232]">
              <div className="p-4 rounded-2xl bg-[#EAE3D5]/80 border border-[#D2C8B8] space-y-1.5">
                <h3 className="font-serif-display text-xl font-bold text-[#0E1B13]">
                  1. Merchant Identification (ECTA Section 43 Disclosure)
                </h3>
                <p>
                  <strong>Trading Name:</strong> Obsessed LTD (OBSD) — &ldquo;Tranquility in Each Stitch&rdquo;
                  <br />
                  <strong>Official Contact &amp; Support Email:</strong> laidinjansen13@gmail.com
                  <br />
                  <strong>Settlement Currency:</strong> South African Rand (ZAR / R) via Yoco Online Checkout (USD display conversion supported for international shoppers).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#EAE3D5]/80 border border-[#D2C8B8] space-y-1.5">
                <h3 className="font-serif-display text-xl font-bold text-[#0E1B13]">
                  2. Shipping &amp; Express Dispatch Policy
                </h3>
                <p>
                  All orders placed before 14:00 SAST are picked and packed within 24 business hours. Nationwide South African courier delivery takes <strong>2–4 business days</strong> (R95 flat rate, or <strong>FREE</strong> on all orders over R1,000 / $60). International tracked express delivery takes 5–8 business days. Tracking numbers are emailed automatically upon dispatch.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#EAE3D5]/80 border border-[#D2C8B8] space-y-1.5">
                <h3 className="font-serif-display text-xl font-bold text-[#0E1B13]">
                  3. Returns, Refunds &amp; Exchanges Policy (CPA &amp; ECTA Compliant)
                </h3>
                <p>
                  In accordance with the South African Electronic Communications and Transactions Act (ECTA) and Consumer Protection Act (CPA), customers may return unworn, unwashed garments with original tags within <strong>30 days of delivery</strong> for a full refund or size exchange. Approved refunds are processed back to the original payment card via Yoco within 5–7 business days.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#EAE3D5]/80 border border-[#D2C8B8] space-y-1.5">
                <h3 className="font-serif-display text-xl font-bold text-[#0E1B13]">
                  4. POPIA Privacy Policy &amp; Yoco PCI-DSS Level 1 Payment Security
                </h3>
                <p>
                  Obsessed LTD (OBSD) complies strictly with the Protection of Personal Information Act (POPIA). Customer contact and delivery details are used solely to fulfill orders. All card payments are processed via <strong>Yoco Online Checkout</strong> using <strong>3D Secure v2</strong> and 256-bit TLS encryption; raw credit/debit card numbers never touch or reside on Obsessed LTD servers. Cart totals are verified server-side with HMAC-SHA256 cryptographic signatures and strict Content-Security-Policy (CSP) headers.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
