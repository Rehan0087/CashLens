import { db, getSimNow } from "../db/index.js";
import { computeAgentLiquidity } from "./liquidityScorer.js";
import type { AgentLiquidity, LocalizedText, Role } from "../types.js";

// The four demonstration scenarios from the challenge brief (§11). Targets are
// computed from the live seeded data so a guided walkthrough always deep-links to
// an agent/case that actually exhibits the scenario, even after a reseed.

export type ScenarioId = "A" | "B" | "C" | "D";

export interface ScenarioFact {
  label: LocalizedText;
  value: string;
}

export interface Scenario {
  id: ScenarioId;
  key: string;
  title: LocalizedText;
  brief: LocalizedText; // the challenge's own description of the scenario
  whatToNotice: LocalizedText; // guidance for the person running the demo
  target: { role: Role; agentId?: string; providerId?: string; caseId?: string };
  facts: ScenarioFact[];
  available: boolean; // false if the seeded data does not currently exhibit it
}

interface AgentRow {
  id: string;
  name: string;
  area: string;
  scenario_tag: string;
}

interface AlertRow {
  id: string;
  agent_id: string;
  provider_id: string | null;
  type: string;
  severity: string;
  status: string;
  assigned_role: string;
  confidence: number;
  evidence_json: string;
}

const T = (en: string, bn: string, banglish: string): LocalizedText => ({ en, bn, banglish });

function taka(n: number): string {
  return `৳${Math.round(n).toLocaleString("en-US")}`;
}

function minutesLabel(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function computeScenarios(): Scenario[] {
  getSimNow(); // throws a clear error if the dataset is not seeded
  const agents = db.prepare("SELECT id, name, area, scenario_tag FROM agents").all() as unknown as AgentRow[];
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const alerts = db
    .prepare(
      `SELECT id, agent_id, provider_id, type, severity, status, assigned_role, confidence, evidence_json
       FROM alerts`
    )
    .all() as unknown as AlertRow[];
  const liquidity = computeAgentLiquidity();
  const liqById = new Map(liquidity.map((l) => [l.agentId, l]));

  return [
    scenarioA(agentById, alerts, liqById),
    scenarioB(agentById, alerts, liqById),
    scenarioC(agentById, alerts, liqById),
    scenarioD(agentById, alerts),
  ];
}

// A — Hidden provider shortage: totals look healthy, one provider float is about to run out.
function scenarioA(
  agentById: Map<string, AgentRow>,
  alerts: AlertRow[],
  liqById: Map<string, AgentLiquidity>
): Scenario {
  const base: Scenario = {
    id: "A",
    key: "hidden_shortage",
    title: T("Hidden provider shortage", "লুকানো প্রোভাইডার সংকট", "Lukano provider shortage"),
    brief: T(
      "A multi-provider agent looks healthy when all balances are added together, but one provider's e-money is about to run out. Show which provider is under pressure, when, how certain, and the safe next step.",
      "সব ব্যালেন্স একসাথে যোগ করলে এজেন্ট সুস্থ মনে হয়, কিন্তু একটি প্রোভাইডারের ই-মানি প্রায় শেষ। কোন প্রোভাইডার চাপে, কখন, কতটা নিশ্চিত এবং নিরাপদ পরবর্তী পদক্ষেপ দেখান।",
      "Shob balance ekshathe jog korle agent shustho mone hoy, kintu ekta provider-er e-money prai shesh. Kon provider chape, kokhon, kotota nishchit ebong nirapod porboti podokkhep dekhan."
    ),
    whatToNotice: T(
      "The combined drawer bar looks large, but one provider float pill reads HIGH pressure with a short ETA. Wallets stay separate — no transfer is suggested.",
      "একত্র ড্রয়ার বার বড় দেখায়, কিন্তু একটি প্রোভাইডার ফ্লোট পিল উচ্চ চাপ ও কম সময় দেখায়। ওয়ালেট আলাদাই থাকে — কোনো ট্রান্সফার প্রস্তাব করা হয় না।",
      "Ekotro drawer bar boro dekhay, kintu ekta provider float pill high chap o kom shomoy dekhay. Wallet alada-i thake — kono transfer proposal kora hoy na."
    ),
    target: { role: "agent" },
    facts: [],
    available: false,
  };

  // Prefer a cross-provider-imbalance agent that is NOT also a stale-data agent,
  // then any agent whose total float is healthy but a single provider is high pressure.
  const imbalanceAgents = alerts
    .filter((a) => a.type === "cross_provider_imbalance")
    .map((a) => a.agent_id);
  const candidates = [...new Set(imbalanceAgents)]
    .map((id) => liqById.get(id))
    .filter((l): l is AgentLiquidity => Boolean(l))
    .filter((l) => (agentById.get(l.agentId)?.scenario_tag ?? "") !== "stale_data");

  const pick =
    candidates
      .filter((l) => l.providers.some((p) => p.level === "high"))
      .sort((a, b) => totalFloat(b) - totalFloat(a))[0] ?? candidates[0];
  if (!pick) return base;

  const starved = [...pick.providers]
    .filter((p) => p.balance !== null)
    .sort((a, b) => (a.balance ?? 0) - (b.balance ?? 0))[0];
  const total = totalFloat(pick) + (pick.physicalCash ?? 0);

  return {
    ...base,
    target: { role: "agent", agentId: pick.agentId },
    available: true,
    facts: [
      { label: T("Agent", "এজেন্ট", "Agent"), value: `${pick.agentName} · ${pick.area}` },
      { label: T("Looks healthy (total)", "মোট (সুস্থ মনে হয়)", "Total (shustho mone hoy)"), value: taka(total) },
      starved
        ? { label: T("Provider under pressure", "চাপে থাকা প্রোভাইডার", "Chape thaka provider"), value: `${starved.providerName} · ${taka(starved.balance ?? 0)}` }
        : { label: T("Provider under pressure", "চাপে থাকা প্রোভাইডার", "Chape thaka provider"), value: "—" },
      {
        label: T("Estimated time to shortage", "সংকট পর্যন্ত আনুমানিক সময়", "Shonkot porjonto anumanik shomoy"),
        value: minutesLabel(starved?.estimatedShortageMinutes ?? null),
      },
    ],
  };
}

// B — Liquidity pressure with unusual activity on the same agent.
function scenarioB(
  agentById: Map<string, AgentRow>,
  alerts: AlertRow[],
  liqById: Map<string, AgentLiquidity>
): Scenario {
  const base: Scenario = {
    id: "B",
    key: "pressure_plus_unusual",
    title: T("Liquidity pressure with unusual activity", "অস্বাভাবিক কার্যকলাপসহ তারল্য চাপ", "Oshabhabik kajshoho liquidity chap"),
    brief: T(
      "The agent's physical cash is falling quickly and one provider shows a sudden rise in repeated or high-value transactions. Show both the liquidity risk and the unusual pattern, explain possible normal reasons, and recommend human review before major action.",
      "এজেন্টের নগদ টাকা দ্রুত কমছে এবং একটি প্রোভাইডারে হঠাৎ বড় বা বারবার লেনদেন বেড়েছে। তারল্য ঝুঁকি ও অস্বাভাবিক প্যাটার্ন—দুটোই দেখান, সম্ভাব্য স্বাভাবিক কারণ ব্যাখ্যা করুন এবং বড় পদক্ষেপের আগে মানুষের পর্যালোচনার পরামর্শ দিন।",
      "Agent-er nogod taka druto komche ebong ekta provider-e hothat boro ba barbar lenden bereche. Liquidity jhuki o oshabhabik pattern—dutoi dekhan, shombhabbo shabhabik karon bujhan ebong boro podokkhep-er age manusher review-er poramorsho din."
    ),
    whatToNotice: T(
      "The cash-out pressure dial is high AND an unusual-transaction alert sits in the same agent's list. The alert says 'requires review', never 'fraud'.",
      "ক্যাশ-আউট চাপ ডায়াল উচ্চ এবং একই এজেন্টের তালিকায় একটি অস্বাভাবিক-লেনদেন অ্যালার্ট আছে। অ্যালার্ট বলে 'পর্যালোচনা প্রয়োজন', কখনো 'জালিয়াতি' নয়।",
      "Cash-out chap dial high ebong ekoi agent-er talikay ekta oshabhabik-lenden alert ache. Alert bole 'review proyojon', kokhono 'jaliyati' noy."
    ),
    target: { role: "agent" },
    facts: [],
    available: false,
  };

  const cashPressured = new Set(
    alerts.filter((a) => a.type === "liquidity_pressure" && a.provider_id === null).map((a) => a.agent_id)
  );
  const unusualAlerts = alerts.filter((a) => a.type === "unusual_transaction");
  const unusualByAgent = new Set(unusualAlerts.map((a) => a.agent_id));
  const agentId = [...cashPressured].find((id) => unusualByAgent.has(id));
  if (!agentId) return base;

  const liq = liqById.get(agentId);
  const agent = agentById.get(agentId);
  const unusual = unusualAlerts
    .filter((a) => a.agent_id === agentId)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])[0];
  const signals = unusual ? (JSON.parse(unusual.evidence_json).signals as Record<string, unknown>) : {};

  return {
    ...base,
    target: { role: "agent", agentId },
    available: true,
    facts: [
      { label: T("Agent", "এজেন্ট", "Agent"), value: `${liq?.agentName ?? agent?.name ?? agentId} · ${liq?.area ?? ""}` },
      { label: T("Cash-out pressure", "ক্যাশ-আউট চাপ", "Cash-out chap"), value: `${Math.round((liq?.cashScore ?? 0) * 100)}%` },
      {
        label: T("Cash runs out in", "নগদ শেষ হবে", "Nogod shesh hobe"),
        value: minutesLabel(liq?.cashShortageMinutes ?? null),
      },
      {
        label: T("Unusual transaction", "অস্বাভাবিক লেনদেন", "Oshabhabik lenden"),
        value: signals.amount ? `${taka(Number(signals.amount))} · ${signals.z_score ?? "?"}σ` : "flagged",
      },
    ],
  };
}

// C — Cross-provider / data inconsistency: late and conflicting feeds.
function scenarioC(
  agentById: Map<string, AgentRow>,
  alerts: AlertRow[],
  liqById: Map<string, AgentLiquidity>
): Scenario {
  const base: Scenario = {
    id: "C",
    key: "data_inconsistency",
    title: T("Cross-provider / data inconsistency", "প্রোভাইডার / ডেটা অসংগতি", "Provider / data oshongoti"),
    brief: T(
      "Different provider feeds arrive late or show conflicting balances. Warn the user about the data problem, reduce confidence, keep provider balances separate, and avoid giving a misleading recommendation.",
      "বিভিন্ন প্রোভাইডার ফিড দেরিতে আসে বা পরস্পরবিরোধী ব্যালেন্স দেখায়। ব্যবহারকারীকে ডেটা সমস্যা সম্পর্কে সতর্ক করুন, আস্থা কমান, প্রোভাইডার ব্যালেন্স আলাদা রাখুন এবং বিভ্রান্তিকর সুপারিশ এড়িয়ে চলুন।",
      "Bibhinno provider feed derite ashe ba porosporobirodhi balance dekhay. Bebohar-karike data shomossha shomporke shotorko korun, astha koman, provider balance alada rakhun ebong bibhrantikor recommendation eriye cholun."
    ),
    whatToNotice: T(
      "One feed is hours stale, another reports a sync time in the future (inconsistent). Both are marked 'unconfirmed' and confidence is reduced — the input is never treated as a zero balance.",
      "একটি ফিড কয়েক ঘণ্টা বাসি, আরেকটি ভবিষ্যতের সিঙ্ক সময় দেখায় (অসংগত)। দুটোই 'অনিশ্চিত' চিহ্নিত এবং আস্থা কমানো — ইনপুটকে কখনো শূন্য ব্যালেন্স ধরা হয় না।",
      "Ekta feed koyek ghonta bashi, arekta bhobishshoter sync shomoy dekhay (oshongoto). Dutoi 'onishchito' chihnito ebong astha komano — input-ke kokhono shunno balance dhora hoy na."
    ),
    target: { role: "agent" },
    facts: [],
    available: false,
  };

  const dataAlerts = alerts.filter((a) => a.type === "data_quality");
  const countByAgent = new Map<string, number>();
  for (const a of dataAlerts) countByAgent.set(a.agent_id, (countByAgent.get(a.agent_id) ?? 0) + 1);
  const agentId = [...countByAgent.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!agentId) return base;

  const liq = liqById.get(agentId);
  const stale = liq?.providers.find((p) => p.dataState === "stale");
  const inconsistent = liq?.providers.find((p) => p.dataState === "inconsistent" || p.dataState === "missing");

  return {
    ...base,
    target: { role: "agent", agentId },
    available: true,
    facts: [
      { label: T("Agent", "এজেন্ট", "Agent"), value: `${liq?.agentName ?? agentId} · ${liq?.area ?? ""}` },
      stale
        ? { label: T("Stale feed", "বাসি ফিড", "Bashi feed"), value: `${stale.providerName} · ${minutesLabel(stale.staleMinutes)}` }
        : { label: T("Stale feed", "বাসি ফিড", "Bashi feed"), value: "—" },
      inconsistent
        ? { label: T("Conflicting feed", "অসংগত ফিড", "Oshongoto feed"), value: `${inconsistent.providerName} · ${inconsistent.dataState}` }
        : { label: T("Conflicting feed", "অসংগত ফিড", "Oshongoto feed"), value: "—" },
      { label: T("Affected figures", "প্রভাবিত সংখ্যা", "Probhabito shongkha"), value: T("shown unconfirmed", "অনিশ্চিত দেখানো", "onishchito dekhano").en },
    ],
  };
}

// D — Coordinated response and closure: routing, ownership, action, status.
function scenarioD(agentById: Map<string, AgentRow>, alerts: AlertRow[]): Scenario {
  const base: Scenario = {
    id: "D",
    key: "coordination_closure",
    title: T("Coordinated response and closure", "সমন্বিত প্রতিক্রিয়া ও নিষ্পত্তি", "Shomonnito prottikriya o nishpotti"),
    brief: T(
      "A high-priority liquidity or anomaly alert affects one provider. Show who receives the alert, who owns it, what action is recommended, whether it was acknowledged, and whether the issue was resolved or escalated.",
      "একটি উচ্চ-অগ্রাধিকার তারল্য বা অস্বাভাবিকতা অ্যালার্ট একটি প্রোভাইডারকে প্রভাবিত করে। কে অ্যালার্ট পায়, কে মালিক, কী পদক্ষেপ সুপারিশ করা হয়, স্বীকার করা হয়েছে কিনা এবং সমস্যা সমাধান নাকি এসকেলেট হয়েছে—দেখান।",
      "Ekta uccho-ogradhikar liquidity ba oshabhabikota alert ekta provider-ke probhabito kore. Ke alert pay, ke malik, ki podokkhep recommend kora hoy, shikar kora hoyeche kina ebong shomossha shomadhan naki escalate hoyeche—dekhan."
    ),
    whatToNotice: T(
      "Open the case: it names the owner role, the recommended next step, and a visible status. Acknowledge → escalate with a note → a risk analyst resolves. Every step is in the audit trail.",
      "কেসটি খুলুন: এতে মালিক ভূমিকা, সুপারিশকৃত পরবর্তী পদক্ষেপ ও দৃশ্যমান স্ট্যাটাস আছে। স্বীকার → নোটসহ এসকেলেট → ঝুঁকি বিশ্লেষক নিষ্পত্তি করেন। প্রতিটি ধাপ অডিট ট্রেইলে।",
      "Case-ti khulun: ete malik bhumika, recommend kora porboti podokkhep o drishshoman status ache. Shikar → note-shoho escalate → jhuki bishleshok nishpotti koren. Protiti dhap audit trail-e."
    ),
    target: { role: "provider_ops" },
    facts: [],
    available: false,
  };

  // A high-severity alert scoped to a single provider makes the cleanest coordination story.
  const openAlerts = alerts.filter((a) => a.status !== "resolved" && a.provider_id !== null);
  const typeRank: Record<string, number> = { unusual_transaction: 0, liquidity_pressure: 1, data_quality: 2, cross_provider_imbalance: 3 };
  const pick =
    openAlerts.sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (typeRank[a.type] ?? 9) - (typeRank[b.type] ?? 9)
    )[0] ?? alerts.find((a) => a.provider_id !== null);
  if (!pick) return base;

  const agent = agentById.get(pick.agent_id);
  const statusText: Record<string, LocalizedText> = {
    new: T("New — awaiting ops", "নতুন — অপারেশনসের অপেক্ষায়", "Notun — ops-er opekkhay"),
    acknowledged: T("Acknowledged by ops", "অপারেশনস স্বীকৃত", "Ops shikrito"),
    escalated: T("Escalated to risk", "ঝুঁকিতে এসকেলেটেড", "Risk-e escalated"),
    resolved: T("Resolved", "নিষ্পন্ন", "Nishponno"),
  };

  return {
    ...base,
    target: { role: "provider_ops", providerId: pick.provider_id ?? undefined, caseId: pick.id, agentId: pick.agent_id },
    available: true,
    facts: [
      { label: T("Case", "কেস", "Case"), value: `${pick.id} · ${agent?.name ?? pick.agent_id}` },
      { label: T("Receives / owns", "গ্রহণ / মালিক", "Grohon / malik"), value: pick.assigned_role.replace("_", " ") },
      { label: T("Current status", "বর্তমান স্ট্যাটাস", "Bortoman status"), value: statusText[pick.status]?.en ?? pick.status },
      { label: T("Confidence", "আস্থা", "Astha"), value: `${Math.round(pick.confidence * 100)}%` },
    ],
  };
}

function totalFloat(l: AgentLiquidity): number {
  return l.providers.reduce((s, p) => s + (p.balance ?? 0), 0);
}
