import { fetchObsistCatalog } from "@/lib/medusa";
import ObsistStorefront from "@/components/ObsesseedStorefront";

export default async function HomePage() {
  const { products, source } = await fetchObsistCatalog();

  return <ObsistStorefront initialProducts={products} medusaSource={source} />;
}

