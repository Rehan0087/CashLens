import type { AlertEvidence, LocalizedText } from "../types.js";

// Every alert ships with a plain-language explanation and a suggested next step
// in English, Bengali, and Banglish. Wording is deliberately non-accusatory:
// signals are described as statistics, never as fraud determinations.

export function taka(n: number): string {
  return `৳${Math.round(n).toLocaleString("en-US")}`;
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "the next 4 hours";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} minutes`;
  if (remainder === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours}h ${remainder}m`;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const txTypeWords = {
  cash_in: { en: "cash-in", bn: "ক্যাশ-ইন", banglish: "cash-in" },
  cash_out: { en: "cash-out", bn: "ক্যাশ-আউট", banglish: "cash-out" },
};

const reviewFirstAction: LocalizedText = {
  en: "Review with the agent before escalating. This is a statistical signal — not proof of wrongdoing or a final fraud decision.",
  bn: "এস্কেলেট করার আগে এজেন্টের সাথে কথা বলে যাচাই করুন। এটি একটি পরিসংখ্যানগত সংকেত — কোনো অন্যায়ের প্রমাণ বা চূড়ান্ত জালিয়াতির সিদ্ধান্ত নয়।",
  banglish: "Escalate korar age agenter shathe kotha bole review korun. Eta statistical signal — kono onyay-er proman ba final fraud-er siddhanto noy.",
};

export function physicalCashPressureEvidence(p: {
  projectedOutflow: number;
  physicalCash: number;
  todayCashOut: number;
  estimatedShortageMinutes: number | null;
  score: number;
  unconfirmed: boolean;
}): AlertEvidence {
  return {
    kind: "physical_cash_pressure",
    signals: {
      projected_cash_out_next_4h: Math.round(p.projectedOutflow),
      physical_cash_on_hand: Math.round(p.physicalCash),
      cash_out_so_far_today: Math.round(p.todayCashOut),
      estimated_shortage_minutes: p.estimatedShortageMinutes,
      pressure_score: Number(p.score.toFixed(2)),
    },
    unconfirmed: p.unconfirmed,
    explanation: {
      en: `Projected cash-out demand of ${taka(p.projectedOutflow)} over the next 4 hours is more than the cash in hand (${taka(p.physicalCash)}). At this rate, the shared cash drawer may run short in about ${formatMinutes(p.estimatedShortageMinutes)}.`,
      bn: `আগামী ৪ ঘণ্টায় আনুমানিক ক্যাশ-আউট চাহিদা ${taka(p.projectedOutflow)}, যা হাতে থাকা নগদের (${taka(p.physicalCash)}) চেয়ে বেশি। এই হারে যৌথ নগদ প্রায় ${formatMinutes(p.estimatedShortageMinutes)}-এ শেষ হতে পারে।`,
      banglish: `Agami 4 ghontay anumanik cash-out chahida ${taka(p.projectedOutflow)}, ja hate thaka nogoder (${taka(p.physicalCash)}) cheye beshi. Ei hare shared cash prai ${formatMinutes(p.estimatedShortageMinutes)}-e shesh hote pare.`,
    },
    suggestedAction: {
      en: "Review this forecast with provider operations and coordinate any approved support through official channels. This system does not move cash or execute a top-up.",
      bn: "এই পূর্বাভাস প্রোভাইডার অপারেশনসের সাথে পর্যালোচনা করুন এবং অফিসিয়াল চ্যানেলে অনুমোদিত সহায়তা সমন্বয় করুন। এই সিস্টেম নগদ সরায় বা টপ-আপ চালু করে না।",
      banglish: "Ei forecast provider operations-er shathe review korun ebong official channele approved support coordinate korun. Ei system cash move ba top-up execute kore na.",
    },
  };
}

export function eMoneyPressureEvidence(p: {
  providerName: string;
  projectedInflowNeed: number;
  balance: number;
  estimatedShortageMinutes: number | null;
  score: number;
  unconfirmed: boolean;
}): AlertEvidence {
  const P = p.providerName;
  return {
    kind: "e_money_pressure",
    signals: {
      provider: P,
      projected_cash_in_next_4h: Math.round(p.projectedInflowNeed),
      e_money_float: Math.round(p.balance),
      estimated_shortage_minutes: p.estimatedShortageMinutes,
      pressure_score: Number(p.score.toFixed(2)),
    },
    unconfirmed: p.unconfirmed,
    explanation: {
      en: `Projected cash-in demand of ${taka(p.projectedInflowNeed)} on ${P} is more than the current ${P} float (${taka(p.balance)}). At this rate, ${P} may run short in about ${formatMinutes(p.estimatedShortageMinutes)}.`,
      bn: `${P}-এ আগামী ৪ ঘণ্টায় আনুমানিক ক্যাশ-ইন চাহিদা ${taka(p.projectedInflowNeed)}, যা বর্তমান ফ্লোটের (${taka(p.balance)}) চেয়ে বেশি। এই হারে ${P} প্রায় ${formatMinutes(p.estimatedShortageMinutes)}-এ শেষ হতে পারে।`,
      banglish: `${P}-e agami 4 ghontay anumanik cash-in chahida ${taka(p.projectedInflowNeed)}, ja bortoman floater (${taka(p.balance)}) cheye beshi. Ei hare ${P} prai ${formatMinutes(p.estimatedShortageMinutes)}-e shesh hote pare.`,
    },
    suggestedAction: {
      en: `Review this forecast with ${P} operations and request any approved e-float support through the official ${P} channel. This system does not initiate a top-up.`,
      bn: `${P} অপারেশনসের সাথে এই পূর্বাভাস পর্যালোচনা করুন এবং অফিসিয়াল ${P} চ্যানেলে অনুমোদিত ই-ফ্লোট সহায়তার অনুরোধ করুন। এই সিস্টেম টপ-আপ চালু করে না।`,
      banglish: `${P} operations-er shathe ei forecast review korun ebong official ${P} channele approved e-float support-er onurodh korun. Ei system top-up initiate kore na.`,
    },
  };
}

export function imbalanceEvidence(p: {
  surplusProvider: string;
  surplusBalance: number;
  deficitProvider: string;
  deficitBalance: number;
  ratio: number;
  unconfirmed: boolean;
}): AlertEvidence {
  const HP = p.surplusProvider;
  const LP = p.deficitProvider;
  return {
    kind: "cross_provider_imbalance",
    signals: {
      surplus_provider: HP,
      surplus_float: Math.round(p.surplusBalance),
      deficit_provider: LP,
      deficit_float: Math.round(p.deficitBalance),
      imbalance_ratio: Number(p.ratio.toFixed(1)),
    },
    unconfirmed: p.unconfirmed,
    explanation: {
      en: `${HP} float is ${taka(p.surplusBalance)} while ${LP} float is only ${taka(p.deficitBalance)}. This provider imbalance may affect service availability and requires operational review.`,
      bn: `${HP} ফ্লোট ${taka(p.surplusBalance)}, কিন্তু ${LP} ফ্লোট মাত্র ${taka(p.deficitBalance)}। এই প্রোভাইডার ভারসাম্যহীনতা সেবা প্রাপ্যতায় প্রভাব ফেলতে পারে এবং অপারেশনাল পর্যালোচনা প্রয়োজন।`,
      banglish: `${HP} float ${taka(p.surplusBalance)}, kintu ${LP} float matro ${taka(p.deficitBalance)}. Ei provider imbalance service availability-te probhab felte pare ebong operational review dorkar.`,
    },
    suggestedAction: {
      en: `Review the imbalance with ${LP} operations and coordinate any approved support through official channels. Wallets stay separate; this system cannot transfer value between them.`,
      bn: `${LP} অপারেশনসের সাথে এই ভারসাম্যহীনতা পর্যালোচনা করুন এবং অফিসিয়াল চ্যানেলে অনুমোদিত সহায়তা সমন্বয় করুন। ওয়ালেট আলাদা থাকবে; এই সিস্টেম এক ওয়ালেট থেকে অন্যটিতে অর্থ স্থানান্তর করতে পারে না।`,
      banglish: `${LP} operations-er shathe ei imbalance review korun ebong official channele approved support coordinate korun. Wallet alada thakbe; ei system ek wallet theke onnotite taka transfer korte pare na.`,
    },
  };
}

export function volumeSpikeEvidence(p: {
  txType: "cash_in" | "cash_out";
  amount: number;
  zScore: number;
  baselineMean: number;
  baselineStddev: number;
  timestamp: string;
  unconfirmed: boolean;
}): AlertEvidence {
  const T = txTypeWords[p.txType];
  const z = p.zScore.toFixed(1);
  return {
    kind: "volume_spike",
    signals: {
      transaction_type: p.txType,
      amount: Math.round(p.amount),
      z_score: Number(z),
      baseline_mean: Math.round(p.baselineMean),
      baseline_stddev: Math.round(p.baselineStddev),
      at: hhmm(p.timestamp),
    },
    unconfirmed: p.unconfirmed,
    explanation: {
      en: `A ${T.en} of ${taka(p.amount)} is ${z} standard deviations above this agent's usual size (typically ${taka(p.baselineMean)} ± ${taka(p.baselineStddev)}).`,
      bn: `${taka(p.amount)} টাকার একটি ${T.bn} এই এজেন্টের স্বাভাবিক লেনদেনের (সাধারণত ${taka(p.baselineMean)} ± ${taka(p.baselineStddev)}) চেয়ে ${z} স্ট্যান্ডার্ড ডেভিয়েশন বেশি।`,
      banglish: `${taka(p.amount)} takar ekta ${T.banglish} ei agenter shabhabik lendener (sadharonoto ${taka(p.baselineMean)} ± ${taka(p.baselineStddev)}) cheye ${z} standard deviation beshi.`,
    },
    suggestedAction: reviewFirstAction,
  };
}

export function oddHourEvidence(p: {
  txType: "cash_in" | "cash_out";
  amount: number;
  timestamp: string;
  usualStartHour: number;
  usualEndHour: number;
  unconfirmed: boolean;
}): AlertEvidence {
  const T = txTypeWords[p.txType];
  const H = hhmm(p.timestamp);
  return {
    kind: "odd_hour",
    signals: {
      transaction_type: p.txType,
      amount: Math.round(p.amount),
      at: H,
      usual_hours: `${String(p.usualStartHour).padStart(2, "0")}:00–${String(p.usualEndHour).padStart(2, "0")}:00`,
    },
    unconfirmed: p.unconfirmed,
    explanation: {
      en: `A ${T.en} of ${taka(p.amount)} at ${H} is outside this agent's usual operating hours (${p.usualStartHour}:00–${p.usualEndHour}:00).`,
      bn: `${H}-এ ${taka(p.amount)} টাকার ${T.bn} এই এজেন্টের স্বাভাবিক কাজের সময়ের (${p.usualStartHour}টা–${p.usualEndHour}টা) বাইরে।`,
      banglish: `${H}-te ${taka(p.amount)} takar ${T.banglish} ei agenter shabhabik kajer somoyer (${p.usualStartHour}ta–${p.usualEndHour}ta) baire.`,
    },
    suggestedAction: reviewFirstAction,
  };
}

export function staleFeedEvidence(p: { providerName: string; staleMinutes: number; lastSyncedAt: string }): AlertEvidence {
  const P = p.providerName;
  const N = Math.round(p.staleMinutes);
  return {
    kind: "stale_balance_feed",
    signals: {
      provider: P,
      stale_minutes: N,
      last_synced_at: p.lastSyncedAt,
    },
    unconfirmed: false, // staleness itself is a confirmed fact about the feed
    explanation: {
      en: `${P} balance feed last synced ${N} minutes ago. Figures from ${P} are shown as unconfirmed until the feed recovers.`,
      bn: `${P} ব্যালেন্স ফিড সর্বশেষ ${N} মিনিট আগে সিঙ্ক হয়েছে। ফিড ঠিক না হওয়া পর্যন্ত ${P}-এর তথ্য অনিশ্চিত হিসেবে দেখানো হচ্ছে।`,
      banglish: `${P} balance feed sorbo-shesh ${N} minute age sync hoyeche. Feed thik na howa porjonto ${P}-er tottho onishchito hishebe dekhano hocche.`,
    },
    suggestedAction: {
      en: "No automatic action is taken on stale data. Confirm balances through the provider channel before acting on related alerts.",
      bn: "বাসি ডেটার ওপর কোনো স্বয়ংক্রিয় ব্যবস্থা নেওয়া হয় না। সংশ্লিষ্ট অ্যালার্টে ব্যবস্থা নেওয়ার আগে প্রোভাইডার চ্যানেলে ব্যালেন্স নিশ্চিত করুন।",
      banglish: "Bashi data-r opor kono automatic bebostha neya hoy na. Songslishto alerte bebostha newar age provider channele balance nishchit korun.",
    },
  };
}

/** Safe fallback for a missing or internally inconsistent provider snapshot. */
export function providerInputEvidence(p: { providerName: string; state: "missing" | "inconsistent" }): AlertEvidence {
  const isMissing = p.state === "missing";
  const stateText = isMissing ? "missing" : "inconsistent";
  return {
    kind: "provider_input_quality",
    signals: {
      provider: p.providerName,
      input_state: stateText,
      balance_used_for_projection: null,
    },
    unconfirmed: true,
    explanation: {
      en: isMissing
        ? `${p.providerName} did not provide a balance snapshot. Its balance is shown as unavailable, not zero.`
        : `${p.providerName} provided an inconsistent balance snapshot. Its balance is shown as unavailable, not trusted.`,
      bn: isMissing
        ? `${p.providerName} ব্যালেন্স স্ন্যাপশট দেয়নি। এর ব্যালেন্স শূন্য নয়, অনুপলব্ধ হিসেবে দেখানো হচ্ছে।`
        : `${p.providerName} অসামঞ্জস্যপূর্ণ ব্যালেন্স স্ন্যাপশট দিয়েছে। এর ব্যালেন্স অনুপলব্ধ হিসেবে দেখানো হচ্ছে, বিশ্বাস করা হচ্ছে না।`,
      banglish: isMissing
        ? `${p.providerName} balance snapshot dey ni. Balance zero noy, unavailable hisebe dekhano hocche.`
        : `${p.providerName} inconsistent balance snapshot diyeche. Balance unavailable hisebe dekhano hocche, trusted noy.`,
    },
    suggestedAction: {
      en: "Do not infer capacity or take an automatic action. Confirm the provider balance through the official channel before acting.",
      bn: "ক্ষমতা অনুমান বা স্বয়ংক্রিয় পদক্ষেপ নেবেন না। পদক্ষেপ নেওয়ার আগে অফিসিয়াল চ্যানেলে প্রোভাইডার ব্যালেন্স নিশ্চিত করুন।",
      banglish: "Capacity onuman ba automatic podokkhep nebhen na. Kaj korar age official channele provider balance nishchit korun.",
    },
  };
}
