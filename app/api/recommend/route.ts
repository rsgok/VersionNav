import { NextResponse } from "next/server";
import { buildRecommendation } from "@/lib/recommendation";
import { recommendRequestSchema } from "@/lib/schemas";
import { listReleaseRangeWithItemsFromStore } from "@/lib/supabase/release-store";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = recommendRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const releases = await listReleaseRangeWithItemsFromStore({
    productId: parsed.data.productId,
    fromVersion: parsed.data.fromVersion ?? parsed.data.profile.currentVersion,
    toVersion: parsed.data.targetVersion
  });

  return NextResponse.json(
    buildRecommendation({
      ...parsed.data,
      releases,
      profile: {
        ...parsed.data.profile,
        productId: parsed.data.productId
      }
    })
  );
}
