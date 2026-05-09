"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import type { ProductId, Release } from "@/lib/types";

type CompareControlsProps = {
  releases: Release[];
  from?: string;
  to?: string;
  productId: ProductId;
  locale: Locale;
};

export default function CompareControls({
  releases,
  from,
  to,
  productId,
  locale
}: CompareControlsProps) {
  const router = useRouter();

  function update(nextFrom = from, nextTo = to) {
    router.push(`/compare?product=${productId}&lang=${locale}&from=${nextFrom}&to=${nextTo}`);
  }

  return (
    <div className="compare-controls">
      <label>
        From
        <select value={from} onChange={(event) => update(event.target.value, to)}>
          {releases.map((release) => (
            <option key={release.version}>{release.version}</option>
          ))}
        </select>
      </label>
      <label>
        To
        <select value={to} onChange={(event) => update(from, event.target.value)}>
          {releases.map((release) => (
            <option key={release.version}>{release.version}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
