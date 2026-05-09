"use client";

import { useState } from "react";
import { HelpCircle, Loader2, MessageSquareText } from "lucide-react";
import type { Messages } from "@/lib/i18n";
import type { NaturalLanguageAnswer, ProductId, Release } from "@/lib/types";

type QuestionBoxProps = {
  messages: Messages;
  productId: ProductId;
  releases: Release[];
};

export default function QuestionBox({ messages, productId, releases }: QuestionBoxProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<NaturalLanguageAnswer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultFrom = releases[0]?.version;
  const defaultTo = releases[releases.length - 1]?.version;

  async function ask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId,
          question,
          fromVersion: defaultFrom,
          targetVersion: defaultTo,
          profile: {}
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setAnswer(await response.json());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Question failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="question-panel">
      <div className="section-heading">
        <div>
          <p className="kicker">{messages.askKicker}</p>
          <h2>{messages.askTitle}</h2>
        </div>
        <MessageSquareText size={21} />
      </div>
      <form className="question-form" onSubmit={ask}>
        <textarea
          value={question}
          placeholder={messages.askPlaceholder}
          wrap="soft"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button className="button button--primary" disabled={isLoading || question.trim().length === 0}>
          {isLoading ? <Loader2 className="spin" size={18} /> : <HelpCircle size={18} />}
          {messages.askButton}
        </button>
      </form>
      {error ? (
        <p className="inline-error">{error}</p>
      ) : answer ? (
        <div className="answer-box">
          <p>{answer.answer}</p>
          <div className="source-list">
            {answer.sources.slice(0, 5).map((source) => (
              <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <p>{messages.askEmpty}</p>
      )}
    </div>
  );
}
