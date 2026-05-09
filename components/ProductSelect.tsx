"use client";

import type { Locale, Messages } from "@/lib/i18n";
import type { Product, ProductId } from "@/lib/types";

type ProductSelectProps = {
  messages: Messages;
  products: Product[];
  productId: ProductId;
  locale: Locale;
};

export default function ProductSelect({
  messages,
  products,
  productId,
  locale
}: ProductSelectProps) {
  return (
    <label>
      {messages.productLabel}
      <select
        value={productId}
        onChange={(event) => {
          window.location.href = `/?product=${event.target.value}&lang=${locale}`;
        }}
      >
        {products.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>
    </label>
  );
}
