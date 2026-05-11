"use client";

import { useState } from "react";
import type { Messages } from "@/lib/i18n";
import type { FeedbackReason, ImpactSurface, ProductId, Recommendation } from "@/lib/types";

type FeedbackFormProps = {
  messages: Messages;
  productId: ProductId;
  fromVersion?: string;
  targetVersion?: string;
  recommendation: Recommendation;
};

const reasonLabels: Record<FeedbackReason, string> = {
  confusing_recommendation: "Recommendation is confusing",
  missing_source: "Missing source",
  wrong_recommendation: "Wrong recommendation",
  upgrade_failed: "Upgrade failed",
  rollback_succeeded: "Rollback worked",
  rollback_failed: "Rollback failed",
  request_agent: "Request another Agent"
};

export default function FeedbackForm({
  messages,
  productId,
  fromVersion,
  targetVersion,
  recommendation
}: FeedbackFormProps) {
  const [reason, setReason] = useState<FeedbackReason>("confusing_recommendation");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");

    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId,
        fromVersion,
        targetVersion,
        profileFingerprint: recommendation.feedbackPrompt.profileFingerprint,
        affectedSurfaces: recommendation.validationPlan.matchedSurfaces as ImpactSurface[],
        reason,
        message: message.trim() || undefined,
        relatedReleaseItemIds: recommendation.feedbackPrompt.relatedReleaseItemIds
      })
    });

    setStatus(response.ok ? "saved" : "error");
  }

  return (
    <form className="feedback-form" onSubmit={submit}>
      <label>
        {messages.feedbackReason}
        <select value={reason} onChange={(event) => setReason(event.target.value as FeedbackReason)}>
          {recommendation.feedbackPrompt.suggestedReasons.map((candidate) => (
            <option key={candidate} value={candidate}>
              {reasonLabels[candidate]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {messages.feedbackMessage}
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>
      <button className="button button--quiet" disabled={status === "saving"}>
        {status === "saved" ? messages.feedbackThanks : messages.feedbackSend}
      </button>
      {status === "error" ? <p>Feedback was not saved. Please redact secrets or paths and retry.</p> : null}
    </form>
  );
}
