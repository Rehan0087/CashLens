export type Role = "agent" | "provider_ops" | "risk_analyst" | "financial_service_provider" | "fsp_management";

export type AlertType = "liquidity_pressure" | "cross_provider_imbalance" | "unusual_transaction" | "data_quality";
export type Severity = "low" | "medium" | "high";
export type AlertStatus = "new" | "acknowledged" | "escalated" | "resolved";
export type PressureLevel = "low" | "medium" | "high";
export type ProviderDataState = "fresh" | "stale" | "missing" | "inconsistent";
export type ForecastConfidencePenalty = "degraded_feed" | "sparse_history" | "thin_horizon" | "volatile_amounts";

export interface LocalizedText {
  en: string;
  bn: string;
  banglish: string;
}

export interface AlertEvidence {
  kind: string;
  signals: Record<string, string | number | boolean | null>;
  unconfirmed: boolean;
  explanation: LocalizedText;
  suggestedAction: LocalizedText;
}

export interface ProviderPressure {
  providerId: string;
  providerName: string;
  balance: number | null; // null when masked for the requesting role
  masked: boolean;
  projectedInflowNeed: number;
  /** Estimated time until this provider float is exhausted at the current projection; null when it stays sufficient in the 4h horizon. */
  estimatedShortageMinutes: number | null;
  score: number;
  level: PressureLevel;
  staleMinutes: number | null;
  stale: boolean;
  dataState: ProviderDataState;
  /** Confidence in the EWRH demand projection, after deterministic quality penalties. */
  predictionConfidence: number;
  confidencePenalties: ForecastConfidencePenalty[];
}

export interface AgentLiquidity {
  agentId: string;
  agentName: string;
  area: string;
  physicalCash: number | null; // null when masked
  cashMasked: boolean;
  todayCashOut: number;
  todayCashIn: number;
  projectedOutflow: number;
  /** Estimated time until the shared cash drawer is exhausted at the current projection; null when it stays sufficient in the 4h horizon. */
  cashShortageMinutes: number | null;
  cashScore: number;
  cashLevel: PressureLevel;
  /** Confidence in the shared-cash EWRH demand projection. */
  cashPredictionConfidence: number;
  cashConfidencePenalties: ForecastConfidencePenalty[];
  providers: ProviderPressure[];
  overallLevel: PressureLevel;
}

export interface AlertDraft {
  agentId: string;
  providerId: string | null;
  type: AlertType;
  severity: Severity;
  confidence: number;
  evidence: AlertEvidence;
  sourceTransactionId: string | null;
}
