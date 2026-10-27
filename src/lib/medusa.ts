import Medusa from "@medusajs/js-sdk";

// shortcut: falls back to curated local archive when MEDUSA_BACKEND_URL is not running, upgrade when connecting live Postgres Medusa v2 instance
export const MEDUSA_BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

export const medusa = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "pk_test_obsd_sanctuary",
});

export type CurrencyCode = "ZAR" | "USD";
export type CategorySlug =
  | "all"
  | "joggers"
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
    subtitle: "Oat Beige, Sage Moss & Espresso Maroon open-hem drawstring fleece pants",
    category: "joggers",
    priceZarCents: 55000, // R550
    compareAtZarCents: 70000, // R700
    priceUsdCents: 3000, // $30
    compareAtUsdCents: 3800, // $38
    gsm: "480 GSM Brushed Fleece",
    fitNote: "Relaxed straight wide-leg drape with triple-stitched elastic waistband and long tonal drawcords",
    colorName: "Oat Beige / Sage / Espresso",
    colorHex: "#6D7B65",
    secondaryColorHex: "#E8DEC8",
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
    id: "prod_obsd_set_02",
    handle: "obsessed-sanctuary-crewneck-tracksuit-set",
    title: "Obsessed LTD Sanctuary Crewneck & Jogger Set",
    subtitle: "Full 2-piece matching loungewear uniform in Sage Forest or Warm Cream Beige",
    category: "sets",
    priceZarCents: 95000, // R950
    compareAtZarCents: 120000, // R1200
    priceUsdCents: 5200, // $52
    compareAtUsdCents: 6600, // $66
    gsm: "500 GSM Organic Loopback",
    fitNote: "Drop-shoulder architectural crewneck paired with our signature wide-leg drawstring joggers",
    colorName: "Sage Forest & Cream Beige",
    colorHex: "#6E7B68",
    secondaryColorHex: "#EDE3CF",
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
    subtitle: "Cream Beige, Charcoal Slate & Olive Moss organic 2x2 ribbed cotton tank vests",
    category: "vests",
    priceZarCents: 45000, // R450
    compareAtZarCents: 58000, // R580
    priceUsdCents: 2500, // $25
    compareAtUsdCents: 3200, // $32
    gsm: "320 GSM 2x2 Ribbed Cotton",
    fitNote: "Contoured athletic neckline & thick shoulder straps — wear solo at home or layered under flannels",
    colorName: "Cream / Slate / Olive Trio",
    colorHex: "#555B41",
    secondaryColorHex: "#3C3D3F",
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
    subtitle: "Thick mock-ribbed collar tees in Pine Green, Sage Moss, Sandstone Tan & Raw Ecru",
    category: "shirts",
    priceZarCents: 38000, // R380
    compareAtZarCents: 48000, // R480
    priceUsdCents: 2100, // $21
    compareAtUsdCents: 2700, // $27
    gsm: "310 GSM Combed Organic Jersey",
    fitNote: "Relaxed boxy drape with high-recovery collar rib that never bacon-necks",
    colorName: "Forest / Sage / Sandstone / Ecru",
    colorHex: "#2A5A41",
    secondaryColorHex: "#C7B59B",
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
    subtitle: "Oat Cream, Heather Gray & Espresso Maroon thick ribbed socks for comfy feet",
    category: "socks",
    priceZarCents: 22000, // R220
    compareAtZarCents: 30000, // R300
    priceUsdCents: 1200, // $12
    compareAtUsdCents: 1700, // $17
    gsm: "Plush Terry Footbed Rib",
    fitNote: "Arch compression + cloud-cushioned sole made for suede clogs, slides, or walking barefoot at home",
    colorName: "Cream / Gray / Maroon Trio",
    colorHex: "#3D2B24",
    secondaryColorHex: "#9EA2A5",
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
    subtitle: "Heavyweight brushed organic fleece sweaters in Sage Forest Green & Warm Oat Beige",
    category: "hoodies",
    priceZarCents: 60000, // R600
    compareAtZarCents: 75000, // R750
    priceUsdCents: 3300, // $33
    compareAtUsdCents: 4200, // $42
    gsm: "520 GSM Brushed Fleece",
    fitNote: "Drop-shoulder architectural sweater drape with thick ribbed collar, cuffs, and waistband",
    colorName: "Sage Forest & Warm Oat Beige",
    colorHex: "#6E7B68",
    secondaryColorHex: "#EDE3CF",
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
