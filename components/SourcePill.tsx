import { ExternalLink } from "lucide-react";
import type { SourceRef } from "@/lib/types";

export default function SourcePill({ source }: { source: SourceRef }) {
  return (
    <a className="source-pill" href={source.url} target="_blank" rel="noreferrer">
      {source.label}
      <ExternalLink size={14} />
    </a>
  );
}
