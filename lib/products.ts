import { products } from "./release-data";
import type { Product, ProductId } from "./types";

export const DEFAULT_PRODUCT_ID: ProductId = "openclaw";

export function listProducts(): Product[] {
  return products;
}

export function normalizeProductId(productId?: string | null): ProductId {
  return products.some((product) => product.id === productId)
    ? (productId as ProductId)
    : DEFAULT_PRODUCT_ID;
}

export function getProduct(productId?: string | null): Product {
  const normalized = normalizeProductId(productId);
  return products.find((product) => product.id === normalized) ?? products[0];
}
