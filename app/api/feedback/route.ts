import { NextResponse } from "next/server";
import { feedbackRequestSchema } from "@/lib/schemas";
import { createAdminSupabaseClient } from "@/lib/supabase/client";

const SECRET_OR_PATH_PATTERN =
  /(?:^|[\s:=])(?:sk-[a-z0-9_-]{10,}|[a-z0-9_-]{24,}\.[a-z0-9_-]{10,}|\/Users\/|\/home\/|[A-Za-z]:\\|token|api[_ -]?key|secret|password|credential)/i;

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = feedbackRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.message && SECRET_OR_PATH_PATTERN.test(parsed.data.message)) {
    return NextResponse.json(
      { error: "Feedback message appears to contain a secret or local path. Please redact it first." },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    return NextResponse.json({
      status: "accepted_without_storage",
      reason: "Supabase admin credentials are not configured."
    });
  }

  const { error } = await supabase.from("feedback_reports").insert({
    product_id: parsed.data.productId,
    from_version: parsed.data.fromVersion ?? null,
    target_version: parsed.data.targetVersion ?? null,
    profile_fingerprint: parsed.data.profileFingerprint ?? null,
    affected_surfaces: parsed.data.affectedSurfaces,
    reason: parsed.data.reason,
    message: parsed.data.message ?? null,
    related_release_item_ids: parsed.data.relatedReleaseItemIds,
    validation_result: parsed.data.validationResult ?? {}
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "accepted" });
}
