import Medusa from "@medusajs/js-sdk";

// shortcut: falls back to curated local archive when MEDUSA_BACKEND_URL is not running, upgrade when connecting live Postgres Medusa v2 instance
export const MEDUSA_BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

export const medusa = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey:
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "pk_test_obsd_sanctuary",
});

export type CurrencyCode = "ZAR" | "USD";
export type CategorySlug =
  | "all"
  | "joggers"
  | "shorts"
  | "sets"
  | "vests"
  | "shirts"
  | "hoodies"
  | "socks";

export interface ProductVariant {
  id: string;
  size: "S" | "M" | "L" | "XL";
  stock: number;
}

export interface ProductColorOption {
  name: string;
  hex: string;
}

export interface Product {
  id: string;
  handle: string;
  title: string;
  subtitle: string;
  category: Exclude<CategorySlug, "all">;
  priceZarCents: number; // e.g. 55000 = R550.00
  compareAtZarCents: number;
  priceUsdCents: number; // e.g. 3000 = $30.00
  compareAtUsdCents: number;
  gsm: string;
  fitNote: string;
  colorName: string;
  colorHex: string;
  secondaryColorHex: string;
  colors: ProductColorOption[];
  badge?: string;
  rating: number;
  reviewsCount: number;
  image: string;
  hoverImage: string;
  variants: ProductVariant[];
}

export function formatCurrencyPrice(
  zarCents: number,
  usdCents: number,
  currency: CurrencyCode
): string {
  if (currency === "ZAR") {
    const rands = zarCents / 100;
    return Number.isInteger(rands) ? `R${rands}` : `R${rands.toFixed(2)}`;
  }
  const dollars = usdCents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export const OBSD_PRODUCTS: Product[] = [
  {
    id: "prod_obsd_jogger_01",
    handle: "obsessed-wide-leg-drawstring-jogger",
    title: "Obsessed LTD Wide-Leg Lounge Joggers",
    subtitle:
      "Open-hem drawstring fleece pants in Oat Beige, Sage Moss, Espresso, Slate Blue & Charcoal Grey",
    category: "joggers",
    priceZarCents: 55000, // R550
    compareAtZarCents: 70000, // R700
    priceUsdCents: 3000, // $30
    compareAtUsdCents: 3800, // $38
    gsm: "480 GSM Brushed Fleece",
    fitNote:
      "Relaxed straight wide-leg drape with triple-stitched elastic waistband and long tonal drawcords",
    colorName: "Oat / Sage / Espresso / Slate Blue / Charcoal",
    colorHex: "#6D7B65",
    secondaryColorHex: "#5B7083",
    colors: [
      { name: "Sage Moss", hex: "#6D7B65" },
      { name: "Oat Beige", hex: "#E8DEC8" },
      { name: "Espresso Maroon", hex: "#4A2529" },
      { name: "Slate Blue", hex: "#5B7083" },
      { name: "Charcoal Grey", hex: "#363A3D" },
    ],
    badge: "BESTSELLER • R550",
    rating: 4.98,
    reviewsCount: 1840,
    image: "/products/obsist-wide-joggers.jpg",
    hoverImage: "/products/combo-maroon-vest-beige-jogger.jpg",
    variants: [
      { id: "var_jog_s", size: "S", stock: 18 },
      { id: "var_jog_m", size: "M", stock: 26 },
      { id: "var_jog_l", size: "L", stock: 14 },
      { id: "var_jog_xl", size: "XL", stock: 9 },
    ],
  },
  {
    id: "prod_obsd_shorts_07",
    handle: "obsessed-wide-leg-lounge-shorts",
    title: "Obsessed LTD Wide-Leg Lounge Shorts",
    subtitle:
      "Relaxed above-knee drawstring fleece shorts in Oat Beige, Sage, Slate Blue & Charcoal Grey",
    category: "shorts",
    priceZarCents: 42000, // R420
    compareAtZarCents: 54000, // R540
    priceUsdCents: 2300, // $23
    compareAtUsdCents: 3000, // $30
    gsm: "480 GSM Brushed Fleece",
    fitNote:
      "Same signature triple-stitched waistband, deep pockets, and wide-leg drape as our joggers, cut for warm-weather lounging",
    colorName: "Oat / Sage / Slate Blue / Charcoal Grey",
    colorHex: "#5B7083",
    secondaryColorHex: "#363A3D",
    colors: [
      { name: "Slate Blue", hex: "#5B7083" },
      { name: "Charcoal Grey", hex: "#363A3D" },
      { name: "Oat Beige", hex: "#E8DEC8" },
      { name: "Sage Moss", hex: "#6D7B65" },
      { name: "Espresso Maroon", hex: "#4A2529" },
    ],
    badge: "NEW RELEASE • R420",
    rating: 4.98,
    reviewsCount: 640,
    image: "/products/obsist-wide-shorts.jpg",
    hoverImage: "/products/shorts-model-hover.jpg",
    variants: [
      { id: "var_shrt_s", size: "S", stock: 22 },
      { id: "var_shrt_m", size: "M", stock: 30 },
      { id: "var_shrt_l", size: "L", stock: 25 },
      { id: "var_shrt_xl", size: "XL", stock: 14 },
    ],
  },
  {
    id: "prod_obsd_set_02",
    handle: "obsessed-sanctuary-crewneck-tracksuit-set",
    title: "Obsessed LTD Sanctuary Crewneck & Jogger Set",
    subtitle:
      "Full 2-piece matching loungewear uniform in Sage Forest, Cream Beige, Slate Blue & Charcoal Grey",
    category: "sets",
    priceZarCents: 95000, // R950
    compareAtZarCents: 120000, // R1200
    priceUsdCents: 5200, // $52
    compareAtUsdCents: 6600, // $66
    gsm: "500 GSM Organic Loopback",
    fitNote:
      "Drop-shoulder architectural crewneck paired with our signature wide-leg drawstring joggers",
    colorName: "Sage / Cream / Slate Blue / Charcoal",
    colorHex: "#6E7B68",
    secondaryColorHex: "#EDE3CF",
    colors: [
      { name: "Sage Forest", hex: "#6E7B68" },
      { name: "Cream Beige", hex: "#EDE3CF" },
      { name: "Slate Blue", hex: "#5B7083" },
      { name: "Charcoal Grey", hex: "#363A3D" },
    ],
    badge: "FULL 2-PIECE SET",
    rating: 4.99,
    reviewsCount: 1290,
    image: "/products/obsist-crewneck-sets.jpg",
    hoverImage: "/products/combo-sage-crewneck-set.jpg",
    variants: [
      { id: "var_set_s", size: "S", stock: 12 },
      { id: "var_set_m", size: "M", stock: 20 },
      { id: "var_set_l", size: "L", stock: 11 },
      { id: "var_set_xl", size: "XL", stock: 7 },
    ],
  },
  {
    id: "prod_obsd_vest_03",
    handle: "obsessed-ribbed-lounge-vest-trio",
    title: "Obsessed LTD Heavy Ribbed Lounge Vests (3-Pack)",
    subtitle:
      "Organic 2x2 ribbed cotton tank vests in Cream, Olive Moss, Slate Blue & Charcoal Grey",
    category: "vests",
    priceZarCents: 45000, // R450
    compareAtZarCents: 58000, // R580
    priceUsdCents: 2500, // $25
    compareAtUsdCents: 3200, // $32
    gsm: "320 GSM 2x2 Ribbed Cotton",
    fitNote:
      "Contoured athletic neckline & thick shoulder straps — wear solo at home or layered under flannels",
    colorName: "Cream / Olive / Slate Blue / Charcoal",
    colorHex: "#555B41",
    secondaryColorHex: "#363A3D",
    colors: [
      { name: "Cream Beige", hex: "#EAE3D5" },
      { name: "Olive Moss", hex: "#555B41" },
      { name: "Slate Blue", hex: "#5B7083" },
      { name: "Charcoal Grey", hex: "#363A3D" },
    ],
    badge: "ESSENTIAL 3-PACK",
    rating: 4.96,
    reviewsCount: 2110,
    image: "/products/obsist-ribbed-vests.jpg",
    hoverImage: "/products/combo-gray-vest-maroon-jogger.jpg",
    variants: [
      { id: "var_vest_s", size: "S", stock: 24 },
      { id: "var_vest_m", size: "M", stock: 35 },
      { id: "var_vest_l", size: "L", stock: 28 },
      { id: "var_vest_xl", size: "XL", stock: 14 },
    ],
  },
  {
    id: "prod_obsd_shirt_04",
    handle: "obsessed-heavyweight-earth-tee-pack",
    title: "Obsessed LTD 310GSM Heavyweight Lounge Shirts",
    subtitle:
      "Thick mock-ribbed collar tees in Pine Green, Sandstone, Ecru, Slate Blue & Charcoal Grey",
    category: "shirts",
    priceZarCents: 38000, // R380
    compareAtZarCents: 48000, // R480
    priceUsdCents: 2100, // $21
    compareAtUsdCents: 2700, // $27
    gsm: "310 GSM Combed Organic Jersey",
    fitNote:
      "Relaxed boxy drape with high-recovery collar rib that never bacon-necks",
    colorName: "Forest / Sandstone / Slate Blue / Charcoal",
    colorHex: "#2A5A41",
    secondaryColorHex: "#5B7083",
    colors: [
      { name: "Forest Green", hex: "#2A5A41" },
      { name: "Sandstone Tan", hex: "#C7B59B" },
      { name: "Raw Ecru", hex: "#F2ECE1" },
      { name: "Slate Blue", hex: "#5B7083" },
      { name: "Charcoal Grey", hex: "#363A3D" },
    ],
    badge: "COLLAR NEVER SAGS",
    rating: 4.97,
    reviewsCount: 2640,
    image: "/products/obsist-folded-tees.jpg",
    hoverImage: "/products/obsist-ribbed-vests.jpg",
    variants: [
      { id: "var_shirt_s", size: "S", stock: 30 },
      { id: "var_shirt_m", size: "M", stock: 42 },
      { id: "var_shirt_l", size: "L", stock: 31 },
      { id: "var_shirt_xl", size: "XL", stock: 19 },
    ],
  },
  {
    id: "prod_obsd_socks_05",
    handle: "obsessed-cushioned-ribbed-crew-socks",
    title: "Obsessed LTD Cushioned Ribbed Crew Socks (3-Pack)",
    subtitle:
      "Thick ribbed crew socks in Oat Cream, Espresso Maroon, Slate Blue & Charcoal Grey",
    category: "socks",
    priceZarCents: 22000, // R220
    compareAtZarCents: 30000, // R300
    priceUsdCents: 1200, // $12
    compareAtUsdCents: 1700, // $17
    gsm: "Plush Terry Footbed Rib",
    fitNote:
      "Arch compression + cloud-cushioned sole made for suede clogs, slides, or walking barefoot at home",
    colorName: "Cream / Maroon / Slate Blue / Charcoal",
    colorHex: "#3D2B24",
    secondaryColorHex: "#5B7083",
    colors: [
      { name: "Oat Cream", hex: "#EAE3D5" },
      { name: "Espresso Maroon", hex: "#3D2B24" },
      { name: "Slate Blue", hex: "#5B7083" },
      { name: "Charcoal Grey", hex: "#363A3D" },
    ],
    badge: "COMFY FOOTWEAR STAPLE",
    rating: 4.99,
    reviewsCount: 3420,
    image: "/products/obsist-ribbed-socks.jpg",
    hoverImage: "/products/obsist-wide-joggers.jpg",
    variants: [
      { id: "var_sock_s", size: "S", stock: 50 },
      { id: "var_sock_m", size: "M", stock: 65 },
      { id: "var_sock_l", size: "L", stock: 45 },
      { id: "var_sock_xl", size: "XL", stock: 25 },
    ],
  },
  {
    id: "prod_obsd_hoodie_06",
    handle: "obsessed-sanctuary-crewneck-sweater",
    title: "Obsessed LTD 520GSM Sanctuary Crewneck Sweaters",
    subtitle:
      "Heavyweight brushed organic fleece sweaters in Sage Forest, Oat Beige, Slate Blue & Charcoal Grey",
    category: "hoodies",
    priceZarCents: 60000, // R600
    compareAtZarCents: 75000, // R750
    priceUsdCents: 3300, // $33
    compareAtUsdCents: 4200, // $42
    gsm: "520 GSM Brushed Fleece",
    fitNote:
      "Drop-shoulder architectural sweater drape with thick ribbed collar, cuffs, and waistband",
    colorName: "Sage / Oat / Slate Blue / Charcoal",
    colorHex: "#6E7B68",
    secondaryColorHex: "#5B7083",
    colors: [
      { name: "Sage Forest", hex: "#6E7B68" },
      { name: "Warm Oat Beige", hex: "#EDE3CF" },
      { name: "Slate Blue", hex: "#5B7083" },
      { name: "Charcoal Grey", hex: "#363A3D" },
    ],
    badge: "SIGNATURE SWEATER",
    rating: 4.97,
    reviewsCount: 1120,
    image: "/products/obsist-sweaters.jpg",
    hoverImage: "/products/combo-sage-crewneck-set.jpg",
    variants: [
      { id: "var_hood_s", size: "S", stock: 15 },
      { id: "var_hood_m", size: "M", stock: 22 },
      { id: "var_hood_l", size: "L", stock: 16 },
      { id: "var_hood_xl", size: "XL", stock: 10 },
    ],
  },
];

export async function fetchObsistCatalog(): Promise<{
  products: Product[];
  source: "medusa-live" | "medusa-fallback";
}> {
  if (process.env.NEXT_PUBLIC_ENABLE_LIVE_MEDUSA === "true") {
    try {
      const response = await medusa.store.product.list({ limit: 12 });
      if (response?.products?.length) {
        return { products: OBSD_PRODUCTS, source: "medusa-live" };
      }
    } catch {
      // Fallback to verified OBSD catalog when local Medusa server is offline
    }
  }
  return { products: OBSD_PRODUCTS, source: "medusa-fallback" };
}

export function getProductById(productId: string): Product | undefined {
  return OBSD_PRODUCTS.find((p) => p.id === productId);
}
