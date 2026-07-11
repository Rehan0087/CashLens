import { db, migrate } from "../src/db/index.js";
import type { AlertEvidence, LocalizedText } from "../src/types.js";

function isLocalized(value: unknown): value is LocalizedText {
  if (!value || typeof value !== "object") return false;
  const text = value as Record<string, unknown>;
  return ["en", "bn", "banglish"].every((key) => typeof text[key] === "string" && String(text[key]).trim().length > 0);
}

function containsAny(text: string, patterns: string[]) {
  const normalized = text.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function verify() {
  migrate();
  const rows = db
    .prepare(`SELECT id, evidence_json FROM alerts WHERE type = 'unusual_transaction' ORDER BY id`)
    .all() as unknown as Array<{ id: string; evidence_json: string }>;
  const violations: Array<{ alertId: string; reason: string }> = [];
  const forbidden = ["fraud detected", "fraud confirmed", "fraudster", "guilty", "block now", "freeze now"];

  for (const row of rows) {
    let evidence: AlertEvidence;
    try {
      evidence = JSON.parse(row.evidence_json) as AlertEvidence;
    } catch {
      violations.push({ alertId: row.id, reason: "evidence JSON is invalid" });
      continue;
    }

    if (!isLocalized(evidence.explanation) || !isLocalized(evidence.suggestedAction)) {
      violations.push({ alertId: row.id, reason: "explanation or suggestedAction is not localized in all three languages" });
      continue;
    }

    const allText = [
      evidence.explanation.en,
      evidence.explanation.bn,
      evidence.explanation.banglish,
      evidence.suggestedAction.en,
      evidence.suggestedAction.bn,
      evidence.suggestedAction.banglish,
    ].join(" ");
    if (containsAny(allText, forbidden)) violations.push({ alertId: row.id, reason: "contains prohibited accusatory or enforcement wording" });
    if (!containsAny(evidence.suggestedAction.en, ["review", "verify", "confirm"])) {
      violations.push({ alertId: row.id, reason: "English next step does not require review or verification" });
    }
    if (!containsAny(evidence.suggestedAction.banglish, ["review", "jachai", "nishchit"])) {
      violations.push({ alertId: row.id, reason: "Banglish next step does not require review or verification" });
    }
    if (!containsAny(evidence.suggestedAction.en, ["not a fraud decision", "not proof"])) {
      violations.push({ alertId: row.id, reason: "English next step lacks the non-determination boundary" });
    }
  }

  const passed = rows.length > 0 && violations.length === 0;
  console.log(JSON.stringify({
    verification: "risk-language-human-review",
    passed,
    anomalyAlertsChecked: rows.length,
    violations,
    requiredCopyRules: [
      "describe unusual behavior, not a person as fraudulent",
      "ask for human review or verification",
      "state that the signal is not a final fraud decision",
      "provide English, Bengali, and Banglish strings",
    ],
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

verify();
