import { getProducts } from "@/lib/csv";
import { Storefront } from "@/components/storefront";

export default function Home() {
  const products = getProducts();

  return <Storefront products={products} />;
}
