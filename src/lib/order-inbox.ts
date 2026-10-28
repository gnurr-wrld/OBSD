import { promises as fs } from "node:fs";
import path from "node:path";

// Internal order inbox.
// - Production (Vercel): stored privately in Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN from the Vercel integration).
// - Local dev without Redis: written to /orders/{pending,paid}/*.json (git-ignored, contains customer PII).
// Run `npm run pull-orders` to copy paid orders from Redis into /orders/paid on this machine.
const ORDERS_ROOT = path.join(process.cwd(), "orders");
const PENDING_TTL_SECONDS = 60 * 60 * 24 * 7; // unpaid orders expire after 7 days

export type OrderFolder = "pending" | "paid";

const REDIS_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${command[0]} failed: HTTP ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

const redisKey = (folder: OrderFolder, orderId: string) =>
  `obsd:order:${folder}:${orderId}`;

function orderPath(folder: OrderFolder, orderId: string): string {
  // orderId is validated upstream (OBSD-[A-F0-9]+), basename() is a second guard against path traversal
  return path.join(ORDERS_ROOT, folder, `${path.basename(orderId)}.json`);
}

export async function writeOrderFile(
  folder: OrderFolder,
  orderId: string,
  data: unknown
): Promise<boolean> {
  const json = JSON.stringify(data, null, 2);
  try {
    if (useRedis) {
      if (folder === "pending") {
        await redis(["SET", redisKey(folder, orderId), json, "EX", PENDING_TTL_SECONDS]);
      } else {
        await redis(["SET", redisKey(folder, orderId), json]);
        await redis(["SADD", "obsd:orders:paid", orderId]);
      }
    } else {
      await fs.mkdir(path.join(ORDERS_ROOT, folder), { recursive: true });
      await fs.writeFile(orderPath(folder, orderId), json);
    }
    return true;
  } catch (err) {
    // Fallback so the order is never silently lost (visible in server / Vercel logs)
    console.error(`[order-inbox] could not write ${folder}/${orderId}`, err, json);
    return false;
  }
}

export async function readOrderFile<T>(
  folder: OrderFolder,
  orderId: string
): Promise<T | null> {
  try {
    const raw = useRedis
      ? ((await redis(["GET", redisKey(folder, orderId)])) as string | null)
      : await fs.readFile(orderPath(folder, orderId), "utf8");
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function deleteOrderFile(
  folder: OrderFolder,
  orderId: string
): Promise<void> {
  try {
    if (useRedis) await redis(["DEL", redisKey(folder, orderId)]);
    else await fs.rm(orderPath(folder, orderId), { force: true });
  } catch {
    // non-fatal: pending entries also expire via TTL
  }
}
