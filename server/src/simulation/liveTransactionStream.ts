export type LiveProviderId = "bkash" | "nagad" | "rocket";
export type LiveTransactionType = "CASH_IN" | "CASH_OUT";

export interface LiveTransaction {
  tx_id: string;
  timestamp: string;
  provider: string;
  provider_id: LiveProviderId;
  tx_type: LiveTransactionType;
  amount: number;
  account_id: string;
  risk_metadata: {
    is_anomaly: boolean;
    trigger_reason: string;
  };
}

export interface LiveProviderBalance {
  provider_id: LiveProviderId;
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
  mode: "normal" | "liquidity_drain" | "anomaly_attack";
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

export type LiveStreamEvent =
  | { type: "snapshot"; snapshot: LiveSnapshot }
  | { type: "transaction"; transaction: LiveTransaction; snapshot: LiveSnapshot }
  | { type: "alert"; alert: LiveAlert; snapshot: LiveSnapshot };

type Listener = (event: LiveStreamEvent) => void;

const PROVIDERS: Array<{ id: LiveProviderId; name: string }> = [
  { id: "bkash", name: "bKash" },
  { id: "nagad", name: "Nagad" },
  { id: "rocket", name: "Rocket" },
];
const NORMAL_ACCOUNTS = Array.from({ length: 49 }, (_, i) => `01711${String(i + 1).padStart(6, "0")}`);
const SUSPICIOUS_ACCOUNTS = ["01899999999", "01888888888"];
const FIVE_MINUTES = 5 * 60_000;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomProvider(): (typeof PROVIDERS)[number] {
  return PROVIDERS[randomInt(0, PROVIDERS.length - 1)];
}

/**
 * A bounded, synthetic stream for the presentation dashboard. It deliberately
 * has no connection to the seeded SQLite records or to any provider API.
 */
export class LiveTransactionStream {
  private readonly listeners = new Set<Listener>();
  private readonly recentTransactions: LiveTransaction[] = [];
  private readonly rollingTransactions: LiveTransaction[] = [];
  private readonly providerBalances = new Map<LiveProviderId, number>([
    ["bkash", 300_000],
    ["nagad", 220_000],
    ["rocket", 175_000],
  ]);
  private readonly startingProviderBalances = new Map(this.providerBalances);
  private readonly startingPhysicalCash = 180_000;
  private physicalCash = this.startingPhysicalCash;
  private sequence = 0;
  private consecutiveSuspiciousCashOuts = 0;
  private paused = false;
  private mode: LiveSnapshot["mode"] = "normal";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAlertKeys = new Set<string>();
  private aiAdvisory: LiveAiAdvisory | null = null;

  start(): void {
    if (this.timer) return;
    this.scheduleNext(1500);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener({ type: "snapshot", snapshot: this.snapshot() });
    return () => this.listeners.delete(listener);
  }

  snapshot(): LiveSnapshot {
    this.pruneRollingWindow();
    const riskScore = this.computeRiskScore();
    const activeAlerts = this.computeAlerts(riskScore);

    return {
      paused: this.paused,
      mode: this.mode,
      updated_at: new Date().toISOString(),
      physical_cash: Math.round(this.physicalCash),
      physical_cash_delta_since_start: Math.round(this.physicalCash - this.startingPhysicalCash),
      providers: PROVIDERS.map((provider) => {
        const balance = this.providerBalances.get(provider.id) ?? 0;
        return {
          provider_id: provider.id,
          provider: provider.name,
          balance: Math.round(balance),
          delta_since_start: Math.round(balance - (this.startingProviderBalances.get(provider.id) ?? balance)),
          shortage_minutes: this.shortageMinutes(provider.id, balance),
        };
      }),
      risk_score: riskScore,
      risk_level: riskScore >= 70 ? "red" : riskScore >= 35 ? "amber" : "green",
      rolling_window_minutes: 5,
      rolling_transaction_count: this.rollingTransactions.length,
      consecutive_suspicious_cash_outs: this.consecutiveSuspiciousCashOuts,
      recent_transactions: [...this.recentTransactions].reverse(),
      active_alerts: activeAlerts,
      ai_advisory: this.aiAdvisory,
    };
  }

  setAiAdvisory(advisory: LiveAiAdvisory | null): void {
    this.aiAdvisory = advisory;
    this.broadcast({ type: "snapshot", snapshot: this.snapshot() });
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) this.start();
    this.broadcast({ type: "snapshot", snapshot: this.snapshot() });
  }

  injectLiquidityDrain(): void {
    this.paused = false;
    this.mode = "liquidity_drain";
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = setTimeout(() => {
      this.mode = "normal";
      this.drainTimer = null;
      this.broadcast({ type: "snapshot", snapshot: this.snapshot() });
    }, 10_000);
    this.start();
    this.broadcast({ type: "snapshot", snapshot: this.snapshot() });
  }

  injectAnomalyAttack(): void {
    this.paused = false;
    this.mode = "anomaly_attack";
    this.start();
    for (let i = 0; i < 5; i++) {
      this.emitTransaction(true, "Injected demo attack: repeated 20,000 BDT Cash-Out", undefined, "CASH_OUT", 20_000, SUSPICIOUS_ACCOUNTS[0]);
    }
    this.mode = "normal";
    this.broadcast({ type: "snapshot", snapshot: this.snapshot() });
  }

  private scheduleNext(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.paused) {
        if (this.mode === "liquidity_drain") {
          this.emitTransaction(false, "Demo liquidity drain: bKash Cash-Out burst", "bkash", "CASH_OUT", 12_000);
          this.scheduleNext(400);
        } else {
          this.emitTransaction(false);
          this.scheduleNext(randomInt(2000, 3000));
        }
      } else {
        this.scheduleNext(1000);
      }
    }, delayMs);
  }

  private emitTransaction(
    forceAnomaly = false,
    forcedReason?: string,
    forcedProvider?: LiveProviderId,
    forcedType?: LiveTransactionType,
    forcedAmount?: number,
    forcedAccountId?: string
  ): void {
    const isAnomaly = forceAnomaly || Math.random() < 0.15;
    const provider = forcedProvider ? PROVIDERS.find((item) => item.id === forcedProvider)! : randomProvider();
    const txType: LiveTransactionType = forcedType ?? (Math.random() < 0.6 ? "CASH_OUT" : "CASH_IN");
    const amount = forcedAmount ?? (isAnomaly ? 20_000 : Math.round(randomInt(500, 20_000) / 100) * 100);
    const accountId = forcedAccountId ?? (isAnomaly ? SUSPICIOUS_ACCOUNTS[this.sequence % SUSPICIOUS_ACCOUNTS.length] : NORMAL_ACCOUNTS[randomInt(0, NORMAL_ACCOUNTS.length - 1)]);

    // Never emit a Cash-Out that the drawer or provider float cannot cover.
    // The stream stops that attempt before either balance can become negative.
    const providerBalance = this.providerBalances.get(provider.id) ?? 0;
    if (txType === "CASH_OUT" && (amount > this.physicalCash || amount > providerBalance)) {
      this.broadcast({ type: "snapshot", snapshot: this.snapshot() });
      return;
    }

    const transaction: LiveTransaction = {
      tx_id: `TXN-${Date.now()}-${++this.sequence}`,
      timestamp: new Date().toISOString(),
      provider: provider.name,
      provider_id: provider.id,
      tx_type: txType,
      amount,
      account_id: accountId,
      risk_metadata: {
        is_anomaly: isAnomaly,
        trigger_reason: forcedReason ?? (isAnomaly ? "Repeated high-value Cash-Out from clustered accounts" : "Normal operational volume"),
      },
    };

    this.applyBalanceDelta(transaction);
    this.recentTransactions.push(transaction);
    this.rollingTransactions.push(transaction);
    if (this.recentTransactions.length > 15) this.recentTransactions.shift();
    if (this.isSuspiciousCashOut(transaction)) this.consecutiveSuspiciousCashOuts += 1;
    else this.consecutiveSuspiciousCashOuts = 0;

    const snapshot = this.snapshot();
    this.broadcast({ type: "transaction", transaction, snapshot });
    for (const alert of snapshot.active_alerts) {
      const key = `${alert.kind}:${alert.severity}`;
      if (!this.lastAlertKeys.has(key)) {
        this.lastAlertKeys.add(key);
        this.broadcast({ type: "alert", alert, snapshot });
      }
    }
    if (snapshot.risk_level === "green") this.lastAlertKeys.delete("risk:high");
    if (!snapshot.active_alerts.some((alert) => alert.kind === "liquidity")) this.lastAlertKeys.delete("liquidity:high");
  }

  private applyBalanceDelta(transaction: LiveTransaction): void {
    // Cash-Out pays physical notes to the customer, so the shared drawer falls.
    // Cash-In receives physical notes, so the shared drawer rises. Provider
    // float direction remains the challenge's existing demo convention.
    const physicalCashDelta = transaction.tx_type === "CASH_OUT" ? -transaction.amount : transaction.amount;
    const providerFloatDelta = transaction.tx_type === "CASH_OUT" ? -transaction.amount : transaction.amount;
    this.physicalCash = Math.max(0, this.physicalCash + physicalCashDelta);
    const currentProviderBalance = this.providerBalances.get(transaction.provider_id) ?? 0;
    this.providerBalances.set(transaction.provider_id, Math.max(0, currentProviderBalance + providerFloatDelta));
  }

  private isSuspiciousCashOut(transaction: LiveTransaction): boolean {
    return transaction.tx_type === "CASH_OUT" && transaction.amount >= 19_500 && SUSPICIOUS_ACCOUNTS.includes(transaction.account_id);
  }

  private pruneRollingWindow(): void {
    const cutoff = Date.now() - FIVE_MINUTES;
    while (this.rollingTransactions.length > 0 && Date.parse(this.rollingTransactions[0].timestamp) < cutoff) this.rollingTransactions.shift();
  }

  private computeRiskScore(): number {
    if (this.consecutiveSuspiciousCashOuts >= 3) return Math.min(88, 75 + (this.consecutiveSuspiciousCashOuts - 3) * 3);
    const suspiciousCount = this.rollingTransactions.filter((transaction) => this.isSuspiciousCashOut(transaction)).length;
    return Math.min(32, 12 + suspiciousCount * 5);
  }

  private shortageMinutes(providerId: LiveProviderId, balance: number): number | null {
    const recentOutflow = this.rollingTransactions
      .filter((transaction) => transaction.provider_id === providerId && transaction.tx_type === "CASH_OUT")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    if (recentOutflow <= 0 || balance <= 0) return null;
    const perMinute = recentOutflow / 5;
    return Math.round((balance / perMinute) * 10) / 10;
  }

  private computeAlerts(riskScore: number): LiveAlert[] {
    const alerts: LiveAlert[] = [];
    if (riskScore >= 70) {
      alerts.push({
        id: "live-risk-review",
        kind: "risk",
        severity: "high",
        message: "Unusual transaction velocity detected.",
        detail: "Requires human review before restocking cash. This advisory does not declare fraud.",
        created_at: new Date().toISOString(),
        requires_human_review: true,
      });
    }
    const recentCashOut = this.rollingTransactions
      .filter((transaction) => transaction.tx_type === "CASH_OUT")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const cashShortageMinutes = recentCashOut > 0 ? this.physicalCash / (recentCashOut / 5) : null;
    if (this.physicalCash < 80_000 || (cashShortageMinutes !== null && cashShortageMinutes < 45)) {
      alerts.push({
        id: "live-liquidity-shared-cash",
        kind: "liquidity",
        severity: "high",
        message: "Shared physical cash may run short soon.",
        detail: "Review approved cash replenishment procedures; this advisory does not execute a transfer.",
        created_at: new Date().toISOString(),
        requires_human_review: true,
      });
    }
    for (const provider of PROVIDERS) {
      const balance = this.providerBalances.get(provider.id) ?? 0;
      const minutes = this.shortageMinutes(provider.id, balance);
      if (balance < 80_000 || (minutes !== null && minutes < 45)) {
        alerts.push({
          id: `live-liquidity-${provider.id}`,
          kind: "liquidity",
          severity: "high",
          message: `${provider.name} e-money float may run short soon.`,
          detail: "Review the provider's approved replenishment process; no wallet or cash movement is executed here.",
          created_at: new Date().toISOString(),
          requires_human_review: true,
        });
      }
    }
    return alerts;
  }

  private broadcast(event: LiveStreamEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export const liveTransactionStream = new LiveTransactionStream();
