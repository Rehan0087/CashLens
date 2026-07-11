export type Role = "agent" | "provider_ops" | "risk_analyst" | "financial_service_provider" | "fsp_management";
export type Language = "en" | "bn" | "banglish";
export type AlertType = "liquidity_pressure" | "cross_provider_imbalance" | "unusual_transaction" | "data_quality";
export type Severity = "low" | "medium" | "high";
export type AlertStatus = "new" | "acknowledged" | "escalated" | "resolved";
export type PressureLevel = "low" | "medium" | "high";
export type ProviderDataState = "fresh" | "stale" | "missing" | "inconsistent";
export type ForecastConfidencePenalty = "degraded_feed" | "sparse_history" | "thin_horizon" | "volatile_amounts";
export type CaseAction = "acknowledge" | "escalate" | "resolve";
export type FeedbackOutcome = "confirmed_concern" | "false_positive" | "contextual_spike" | "insufficient_evidence";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  providerId: string | null;
  agentId: string | null;
}

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
  balance: number | null;
  masked: boolean;
  projectedInflowNeed: number;
  estimatedShortageMinutes: number | null;
  score: number;
  level: PressureLevel;
  staleMinutes: number | null;
  stale: boolean;
  dataState: ProviderDataState;
  predictionConfidence: number;
  confidencePenalties: ForecastConfidencePenalty[];
}

export interface AgentLiquidity {
  agentId: string;
  agentName: string;
  area: string;
  physicalCash: number | null;
  cashMasked: boolean;
  todayCashOut: number;
  todayCashIn: number;
  projectedOutflow: number;
  cashShortageMinutes: number | null;
  cashScore: number;
  cashLevel: PressureLevel;
  cashPredictionConfidence: number;
  cashConfidencePenalties: ForecastConfidencePenalty[];
  providers: ProviderPressure[];
  overallLevel: PressureLevel;
  openAlerts?: number;
}

export interface HourFlow {
  hour: number;
  cashIn: number;
  cashOut: number;
}

export interface AgentAlertSummary {
  id: string;
  type: AlertType;
  severity: Severity;
  confidence: number;
  status: AlertStatus;
  createdAt: string;
  providerId: string | null;
  providerName: string | null;
  evidence: AlertEvidence;
}

export interface AgentDetail extends AgentLiquidity {
  timeline: HourFlow[];
  alerts: AgentAlertSummary[];
}

export interface AlertListItem {
  id: string;
  agentId: string;
  agentName: string;
  area: string;
  providerId: string | null;
  providerName: string | null;
  type: AlertType;
  severity: Severity;
  confidence: number;
  status: AlertStatus;
  assignedRole: string;
  createdAt: string;
  evidence: AlertEvidence;
}

export interface CaseNote {
  id: string;
  role: string;
  note: string;
  timestamp: string;
}

export interface CaseDetail extends AlertListItem {
  notes: CaseNote[];
  feedback: AlertFeedback[];
  workflowEvents: WorkflowEvent[];
  agentContext: AgentLiquidity | null;
  allowedActions: CaseAction[];
}

export interface AlertFeedback {
  id: string;
  reviewer_role: string;
  outcome: FeedbackOutcome;
  note: string;
  rule_version: string;
  created_at: string;
}

export interface WorkflowEvent {
  id: string;
  actor_role: string;
  action: string;
  from_status: AlertStatus;
  to_status: AlertStatus;
  from_assigned_role: string;
  to_assigned_role: string;
  note: string;
  created_at: string;
}

export interface PlanningProvider {
  providerId: string;
  providerName: string;
  agentCount: number;
  pressuredAgents: number;
  totalBalance: number | null;
  projectedInflowNeed: number;
  shortageMinutes: number | null;
  level: PressureLevel;
  dataState: ProviderDataState | "degraded";
  exactValuesMasked: boolean;
}

export interface PlanningContext {
  simNow: string;
  horizonHours: number;
  sharedCash: {
    agentCount: number;
    totalPhysicalCash: number | null;
    projectedOutflow: number;
    shortageMinutes: number | null;
    level: PressureLevel;
    exactValuesMasked: boolean;
  };
  providers: PlanningProvider[];
  constraints: Array<{
    providerId: string;
    providerShortageMinutes: number | null;
    sharedCashShortageMinutes: number | null;
    bindingConstraint: "provider_e_money" | "shared_physical_cash" | "no_projected_shortage" | "insufficient_data";
  }>;
  advisoryOnly: true;
  prohibitedActions: string[];
}

export interface AreaSummary {
  area: string;
  agentCount: number;
  highPressureAgents: number;
  mediumPressureAgents: number;
  openAlerts: number;
  highSeverityAlerts: number;
  pressureIndex: number;
}

export interface ProviderSummary {
  providerId: string;
  providerName: string;
  openAlerts: number;
  highPressureAgents: number;
  staleFeeds: number;
}

export interface Overview {
  simNow: string;
  totals: {
    agents: number;
    openAlerts: number;
    newAlerts: number;
    escalated: number;
    resolved: number;
    highSeverityOpen: number;
  };
  areas: AreaSummary[];
  providers: ProviderSummary[];
}

export interface MetricsReport {
  computedAt: string;
  dataset: {
    agents: number;
    transactions: number;
    demoDayTransactions: number;
    injectedAnomalies: number;
    scenarioAgents: number;
  };
  detection: {
    recall: number;
    falsePositiveRate: number;
    precision: number;
    scenarioCoverage: number;
    detected: number;
    missed: number;
    falsePositives: number;
  };
  providerForecast: {
    scenarioCount: number;
    providerScenarioCount: number;
    sharedCashScenarioCount: number;
    demandMaeTaka: number;
    demandMape: number;
    capacityClassificationAccuracy: number;
    actualShortageScenarios: number;
    detectedShortages: number;
    missedShortages: number;
    averageLeadMinutes: number;
    minimumLeadMinutes: number;
  };
  explainability: {
    alerts: number;
    fullyExplainedAlerts: number;
    coverage: number;
  };
  reliability: {
    providerInputGuards: {
      scenarios: number;
      passed: number;
      coverage: number;
      delayedHandled: boolean;
      missingHandled: boolean;
      inconsistentHandled: boolean;
    };
  };
  performance: {
    engineRunMsAvg: number;
    engineThroughputTxPerSec: number;
    dashboardAssemblyP95Ms: number;
    apiReadPathAvgMs: number;
    apiReadPathP95Ms: number;
  };
  thresholdSweep: Array<{
    zThreshold: number;
    recallOnVolumeAnomalies: number;
    falsePositives: number;
    falsePositiveRate: number;
  }>;
}

export type ScenarioId = "A" | "B" | "C" | "D";

export interface ScenarioFact {
  label: LocalizedText;
  value: string;
}

export interface Scenario {
  id: ScenarioId;
  key: string;
  title: LocalizedText;
  brief: LocalizedText;
  whatToNotice: LocalizedText;
  target: { role: Role; agentId?: string; providerId?: string; caseId?: string };
  facts: ScenarioFact[];
  available: boolean;
}

export interface Meta {
  simNow: string;
  providers: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string; area: string }>;
}

export interface WhatIf {
  multiplier: number;
  base: AgentLiquidity;
  scenario: AgentLiquidity;
}

export type LiveTransactionType = "CASH_IN" | "CASH_OUT";
export type LiveMode = "normal" | "liquidity_drain" | "anomaly_attack";

export interface LiveTransaction {
  tx_id: string;
  timestamp: string;
  provider: string;
  provider_id: "bkash" | "nagad" | "rocket";
  tx_type: LiveTransactionType;
  amount: number;
  account_id: string;
  risk_metadata: { is_anomaly: boolean; trigger_reason: string };
}

export interface LiveProviderBalance {
  provider_id: "bkash" | "nagad" | "rocket";
  provider: string;
  balance: number;
  delta_since_start: number;
  shortage_minutes: number | null;
}

export interface LiveAlert {
  id: string;
  kind: "risk" | "liquidity";
  severity: "advisory" | "high";
  message: string;
  detail: string;
  created_at: string;
  requires_human_review: true;
}

export interface LiveAiAdvisory {
  status: "available" | "disabled" | "error";
  model: string | null;
  generated_at: string | null;
  risk_band: "low" | "medium" | "high" | null;
  shortage_minutes: number | null;
  confidence: number | null;
  summary: string;
  recommended_action: string;
  requires_human_review: true;
}

export interface LiveSnapshot {
  paused: boolean;
  mode: LiveMode;
  updated_at: string;
  physical_cash: number;
  physical_cash_delta_since_start: number;
  providers: LiveProviderBalance[];
  risk_score: number;
  risk_level: "green" | "amber" | "red";
  rolling_window_minutes: 5;
  rolling_transaction_count: number;
  consecutive_suspicious_cash_outs: number;
  recent_transactions: LiveTransaction[];
  active_alerts: LiveAlert[];
  ai_advisory: LiveAiAdvisory | null;
}

export interface ProviderInputHealth {
  state: "healthy" | "degraded";
  expectedFeeds: number;
  receivedFeeds: number;
  missingFeeds: number;
  staleFeeds: number;
  inconsistentFeeds: number;
  safeFallback: string;
}

export interface Observability {
  providerInputs: ProviderInputHealth;
  routes: Array<{
    route: string;
    requests: number;
    errors: number;
    averageMs: number;
    p95Ms: number;
  }>;
}
