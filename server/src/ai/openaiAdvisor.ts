import OpenAI from "openai";
import type { LiveAiAdvisory, LiveSnapshot } from "../simulation/liveTransactionStream.js";
import { liveTransactionStream } from "../simulation/liveTransactionStream.js";

const NORMAL_REFRESH_MS = 60_000;
const ALERT_REFRESH_MS = 15_000;

function modelName(): string {
  return process.env.OPENAI_MODEL ?? "gpt-5.6";
}

function boundedConfidence(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function boundedShortage(value: unknown): number | null {
  return value === null ? null : typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value * 10) / 10) : null;
}

function advisoryFromOutput(output: string): LiveAiAdvisory {
  const parsed = JSON.parse(output) as Record<string, unknown>;
  const riskBand = parsed.risk_band === "high" || parsed.risk_band === "medium" || parsed.risk_band === "low" ? parsed.risk_band : "medium";
  return {
    status: "available",
    model: modelName(),
    generated_at: new Date().toISOString(),
    risk_band: riskBand,
    shortage_minutes: boundedShortage(parsed.shortage_minutes),
    confidence: boundedConfidence(parsed.confidence),
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 500) : "The model returned no summary.",
    recommended_action: typeof parsed.recommended_action === "string" ? parsed.recommended_action.slice(0, 500) : "Review the local evidence before taking action.",
    requires_human_review: true,
  };
}

function inputFor(snapshot: LiveSnapshot) {
  const byProvider = snapshot.providers.map((provider) => ({
    provider: provider.provider,
    balance: provider.balance,
    balance_delta_since_start: provider.delta_since_start,
    estimated_shortage_minutes: provider.shortage_minutes,
  }));
  const transactionSummary = snapshot.recent_transactions.reduce<Record<string, { count: number; amount: number }>>((summary, transaction) => {
    const key = `${transaction.provider}:${transaction.tx_type}`;
    const current = summary[key] ?? { count: 0, amount: 0 };
    summary[key] = { count: current.count + 1, amount: current.amount + transaction.amount };
    return summary;
  }, {});

  return {
    physical_cash: snapshot.physical_cash,
    physical_cash_delta_since_start: snapshot.physical_cash_delta_since_start,
    local_risk_score: snapshot.risk_score,
    local_risk_level: snapshot.risk_level,
    rolling_window_minutes: snapshot.rolling_window_minutes,
    rolling_transaction_count: snapshot.rolling_transaction_count,
    consecutive_suspicious_cash_outs: snapshot.consecutive_suspicious_cash_outs,
    providers: byProvider,
    transaction_summary: transactionSummary,
  };
}

async function analyze(snapshot: LiveSnapshot): Promise<LiveAiAdvisory> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: modelName(),
    instructions: [
      "You are a cautious liquidity operations advisor analyzing synthetic mobile-money data.",
      "Use the local risk score and balances as evidence; do not replace them or invent missing facts.",
      "Never declare fraud, accuse a person, block an account, or execute a financial action.",
      "Return a short advisory that requires human review before any operational action.",
    ].join(" "),
    input: JSON.stringify(inputFor(snapshot)),
    text: {
      format: {
        type: "json_schema",
        name: "live_liquidity_advisory",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            risk_band: { type: "string", enum: ["low", "medium", "high"] },
            shortage_minutes: { type: ["number", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            summary: { type: "string" },
            recommended_action: { type: "string" },
          },
          required: ["risk_band", "shortage_minutes", "confidence", "summary", "recommended_action"],
        },
      },
    },
  });

  if (!response.output_text) throw new Error("OpenAI returned an empty advisory.");
  return advisoryFromOutput(response.output_text);
}

export function startOpenAiAdvisor(): void {
  if (!process.env.OPENAI_API_KEY) {
    liveTransactionStream.setAiAdvisory({
      status: "disabled",
      model: null,
      generated_at: null,
      risk_band: null,
      shortage_minutes: null,
      confidence: null,
      summary: "OpenAI advisory is disabled. Set OPENAI_API_KEY on the server to enable it.",
      recommended_action: "The local deterministic risk and balance safeguards remain active.",
      requires_human_review: true,
    });
    return;
  }

  let lastCallAt = 0;
  let pending = false;
  liveTransactionStream.subscribe((event) => {
    if (event.type !== "snapshot" && event.type !== "transaction") return;
    const now = Date.now();
    const interval = event.snapshot.active_alerts.length > 0 || event.snapshot.risk_level === "red" ? ALERT_REFRESH_MS : NORMAL_REFRESH_MS;
    if (pending || now - lastCallAt < interval) return;
    pending = true;
    lastCallAt = now;
    void analyze(event.snapshot)
      .then((advisory) => liveTransactionStream.setAiAdvisory(advisory))
      .catch(() => liveTransactionStream.setAiAdvisory({
        status: "error",
        model: modelName(),
        generated_at: new Date().toISOString(),
        risk_band: null,
        shortage_minutes: null,
        confidence: null,
        summary: "OpenAI advisory is temporarily unavailable.",
        recommended_action: "Continue using the local deterministic indicators and review the evidence manually.",
        requires_human_review: true,
      }))
      .finally(() => { pending = false; });
  });
}
