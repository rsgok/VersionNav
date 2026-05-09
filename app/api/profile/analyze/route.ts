import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { buildRecommendation } from "@/lib/recommendation";
import { profileAnalyzeSchema } from "@/lib/schemas";
import { listReleaseRangeWithItemsFromStore } from "@/lib/supabase/release-store";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = profileAnalyzeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const profileHash = createHash("sha256")
    .update(JSON.stringify(parsed.data.profile))
    .digest("hex");
  const releases = await listReleaseRangeWithItemsFromStore({
    productId: parsed.data.productId,
    fromVersion: parsed.data.profile.currentVersion
  });

  return NextResponse.json({
    profileHash,
    status: "analyzed",
    recommendation: buildRecommendation({
      productId: parsed.data.productId,
      releases,
      profile: {
        ...parsed.data.profile,
        productId: parsed.data.productId
      }
    })
  });
}
