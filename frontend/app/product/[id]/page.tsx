import { notFound } from "next/navigation";
import { ProductPage } from "@/components/storefront";
import { getProducts } from "@/lib/csv";

type ProductRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export function generateStaticParams() {
  return getProducts().map((product) => ({
    id: product.id
  }));
}

export default async function ProductRoute({ params }: ProductRouteProps) {
  const { id } = await params;
  const products = getProducts();
  const product = products.find((item) => item.id === id);

  if (!product) {
    notFound();
  }

  return <ProductPage product={product} products={products} />;
}
