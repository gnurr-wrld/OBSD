import { promises as fs } from "node:fs";
import path from "node:path";

// Internal order inbox: paid orders land in /orders/paid/*.json inside the project (git-ignored, contains customer PII).
// shortcut: local filesystem store; Vercel's filesystem is read-only/ephemeral, so production needs Vercel Blob/Postgres here.
const ORDERS_ROOT = path.join(process.cwd(), "orders");

export type OrderFolder = "pending" | "paid";

function orderPath(folder: OrderFolder, orderId: string): string {
  // orderId is validated upstream (OBSD-[A-F0-9]+), basename() is a second guard against path traversal
  return path.join(ORDERS_ROOT, folder, `${path.basename(orderId)}.json`);
}

export async function writeOrderFile(
  folder: OrderFolder,
  orderId: string,
  data: unknown
): Promise<boolean> {
  try {
    await fs.mkdir(path.join(ORDERS_ROOT, folder), { recursive: true });
    await fs.writeFile(orderPath(folder, orderId), JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    // Fallback so the order is never silently lost (visible in server / Vercel logs)
    console.error(`[order-inbox] could not write ${folder}/${orderId}`, err, JSON.stringify(data));
    return false;
  }
}

export async function readOrderFile<T>(
  folder: OrderFolder,
  orderId: string
): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(orderPath(folder, orderId), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function deleteOrderFile(
  folder: OrderFolder,
  orderId: string
): Promise<void> {
  await fs.rm(orderPath(folder, orderId), { force: true }).catch(() => {});
}
