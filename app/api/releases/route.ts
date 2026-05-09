import { NextResponse } from "next/server";
import { releasesQuerySchema } from "@/lib/schemas";
import { filterReleasesFromStore } from "@/lib/supabase/release-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = releasesQuerySchema.safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ releases: await filterReleasesFromStore(parsed.data) });
}
