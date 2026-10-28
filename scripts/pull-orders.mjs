// Copies paid orders from Upstash Redis (production) into ./orders/paid/*.json on this machine.
// Usage: npm run pull-orders   (needs KV_REST_API_URL + KV_REST_API_TOKEN in .env.local)
import { promises as fs } from "node:fs";
import path from "node:path";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error("Missing KV_REST_API_URL / KV_REST_API_TOKEN in .env.local");
  process.exit(1);
}

async function redis(command) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis ${command[0]} failed: HTTP ${res.status}`);
  return (await res.json()).result;
}

const dir = path.join(process.cwd(), "orders", "paid");
await fs.mkdir(dir, { recursive: true });

const ids = (await redis(["SMEMBERS", "obsd:orders:paid"])) || [];
let added = 0;
for (const id of ids) {
  if (!/^OBSD-[A-F0-9]{8,16}$/.test(id)) continue;
  const file = path.join(dir, `${id}.json`);
  const exists = await fs.access(file).then(() => true, () => false);
  if (exists) continue;
  const json = await redis(["GET", `obsd:order:paid:${id}`]);
  if (!json) continue;
  await fs.writeFile(file, json);
  added++;
}
console.log(`Paid orders in Redis: ${ids.length}. New files written to orders/paid: ${added}.`);
