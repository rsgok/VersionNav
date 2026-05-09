"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Locale, Messages } from "@/lib/i18n";
import type { ProductId, Release } from "@/lib/types";

type AdvisorFormProps = {
  releases: Release[];
  messages: Messages;
  productId: ProductId;
  locale: Locale;
};

type FormState = {
  currentVersion: string;
  targetVersion: string;
  userIntent: string;
};

const initialState: FormState = {
  currentVersion: "2026.4.23",
  targetVersion: "",
  userIntent: "I mainly use Codex OAuth, local browser, and cron. I do not use Telegram."
};

export default function AdvisorForm({ releases, messages, productId, locale }: AdvisorFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => ({
    ...initialState,
    currentVersion: releases[0]?.version ?? initialState.currentVersion
  }));
  const versionOptions = useMemo(() => releases.map((release) => release.version), [releases]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams({
      product: productId,
      lang: locale,
      from: form.currentVersion,
      intent: form.userIntent
    });

    if (form.targetVersion) {
      params.set("to", form.targetVersion);
    }

    router.push(`/decision?${params.toString()}` as Parameters<typeof router.push>[0]);
  }

  return (
    <div className="advisor-layout">
      <form className="advisor-form" onSubmit={onSubmit}>
        <div className="field-row">
          <label>
            {messages.currentVersion}
            <select
              value={form.currentVersion}
              onChange={(event) => setForm({ ...form, currentVersion: event.target.value })}
            >
              {versionOptions.map((version) => (
                <option key={version}>{version}</option>
              ))}
            </select>
          </label>
          <label>
            {messages.targetVersion}
            <select
              value={form.targetVersion}
              onChange={(event) => setForm({ ...form, targetVersion: event.target.value })}
            >
              <option value="">{messages.latestStableOption}</option>
              {versionOptions.map((version) => (
                <option key={version}>{version}</option>
              ))}
            </select>
          </label>
        </div>

        <label>
          {messages.scenario}
          <textarea
            value={form.userIntent}
            placeholder={messages.askPlaceholder}
            onChange={(event) => setForm({ ...form, userIntent: event.target.value })}
          />
        </label>

        <button className="button button--primary">
          <CheckCircle2 size={18} />
          {messages.getRecommendation}
        </button>
      </form>
    </div>
  );
}
