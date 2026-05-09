import { AlertTriangle, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import type { Messages } from "@/lib/i18n";
import type { Recommendation, RecommendationAction } from "@/lib/types";

export default function RecommendationResult({
  messages,
  result
}: {
  messages: Messages;
  result: Recommendation;
}) {
  const topReasons = result.reasons.slice(0, 3);
  const topRisks = result.risks.slice(0, 3);
  const confidencePercent = Math.round(result.confidence * 100);

  return (
    <article className={`decision-result decision-report result--${result.action}`}>
      <header className="decision-report__header">
        <div>
          <span className="decision-action">{actionLabel(result.action, messages)}</span>
          <h2>{result.recommendedVersion}</h2>
          <p>{messages.decisionTarget}</p>
        </div>
        <div className="decision-confidence">
          <div>
            <span>{messages.ruleConfidence}</span>
            <strong>{confidencePercent}%</strong>
          </div>
          <i>
            <b style={{ width: `${confidencePercent}%` }} />
          </i>
          <p>{messages.confidenceHelp}</p>
        </div>
      </header>

      <div className="decision-sections">
        <section className="decision-panel">
          <h3>
            <CheckCircle2 size={17} />
            {messages.decisionBasis}
          </h3>
          <ol>
            {topReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ol>
        </section>

        <section className="decision-panel">
          <h3>
            <AlertTriangle size={17} />
            {messages.decisionRiskCheck}
          </h3>
          <ol>
            {topRisks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ol>
        </section>
      </div>

      <section className="decision-panel">
        <h3>
          <ShieldCheck size={17} />
          {messages.decisionNextSteps}
        </h3>
        <div className="command-list command-list--compact">
          {result.validationSteps.slice(0, 4).map((step) => (
            <code key={step}>{step}</code>
          ))}
        </div>
      </section>

      <section className="decision-sources">
        <h3>{messages.decisionSourceHint}</h3>
        <div className="source-list">
          {result.sources.slice(0, 6).map((source) => (
            <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
              {source.label} <ExternalLink size={13} />
            </a>
          ))}
        </div>
      </section>
    </article>
  );
}

function actionLabel(action: RecommendationAction, messages: Messages): string {
  if (action === "upgrade") {
    return messages.actionUpgrade;
  }

  if (action === "stay") {
    return messages.actionStay;
  }

  if (action === "avoid") {
    return messages.actionAvoid;
  }

  return messages.actionWait;
}
