/* Simple Ads: the numbers and the daily rules (chapter 9 of the spec). Pure functions, shared by the server
   (nightly job, campaign page API) and the screens. The engine never changes a budget. */

type J = Record<string, unknown>;

export const ENGINE = {
  minDaysRunning: 1,
  restHours: 48,
  loserSpendMultiple: 2,
  fatigueFrequency: 3,
  fatigueCtrDrop: 0.3,
  winnerMinResults: 5,
  winnerShare: 0.6,
  maxActiveAds: 5,
  minDailyBudget: 40,
  smallAudienceFrequency: 3.5,
  clicksWithoutLeads: 60,
  windowDays: 7,
} as const;

export const MODES: [string, string, string][] = [
  ["manual", "המלצות בלבד", "המערכת בודקת כל לילה ורושמת המלצה ביומן. לא נוגעת בקמפיין."],
  ["auto", "אוטומטי", "המערכת מחליפה ומוסיפה מודעות לפי הכללים. בתקציב היא לא נוגעת אף פעם."],
];

/* what counts as a "result" for each campaign goal */
export type Goal = "leads" | "whatsapp" | "calls" | "traffic" | "other";
export function goalOf(goal: string, objective = "", optimization = ""): Goal {
  const g = (goal + " " + objective + " " + optimization).toLowerCase();
  if (/whatsapp|conversation|ctwa/.test(g)) return "whatsapp";
  if (/call/.test(g)) return "calls";
  if (/lead/.test(g)) return "leads";
  if (/traffic|link_click|landing/.test(g)) return "traffic";
  return "other";
}
export const GOAL_LABEL: Record<Goal, string> = { leads: "לידים", whatsapp: "שיחות וואטסאפ", calls: "שיחות טלפון", traffic: "קליקים לאתר", other: "תוצאות" };

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);

export function resultsOf(m: J | null | undefined, goal: Goal): number {
  if (!m) return 0;
  const a = (m.actions || {}) as Record<string, number>;
  const max = (...keys: string[]) => Math.max(0, ...keys.map((k) => num(a[k])));
  if (goal === "leads") return max("lead", "onsite_conversion.lead_grouped", "leadgen_grouped", "offsite_conversion.fb_pixel_lead") || num(m.conversions);
  if (goal === "whatsapp") return max("onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection") || num(m.conversions);
  if (goal === "calls") return max("click_to_call_native_call_placed", "click_to_call_call_confirm", "click_to_call_native_20s_call_connect") || num(m.conversions);
  if (goal === "traffic") return num(m.inlineLinkClicks) || max("link_click") || num(m.clicks);
  return num(m.conversions);
}

export type DayRow = { ad_id: string; adset_id: string; campaign_id: string; day: string; name: string; status: string; spend: number; impressions: number; reach: number; clicks: number; ctr: number; frequency: number; results: number };

/* frequency per ad over a range, from a tree call without the daily series */
export function freqOf(campaign: J): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of (campaign.adSets || []) as J[]) for (const ad of (s.ads || []) as J[]) {
    const m = (ad.metrics || {}) as J, imp = num(m.impressions), reach = num(m.reach);
    if (ad.platformAdId && reach) out[String(ad.platformAdId)] = imp / reach;
  }
  return out;
}

/* one row per ad per day, from GET /ads/tree?dailyLevel=ad&timeIncrement=1 */
export function dayRows(campaign: J, goal: Goal): DayRow[] {
  const out: DayRow[] = [];
  for (const s of (campaign.adSets || []) as J[]) {
    for (const ad of (s.ads || []) as J[]) {
      const id = String(ad.platformAdId || "");
      if (!id) continue;
      for (const d of (ad.daily || []) as J[]) {
        const day = String(d.date || "");
        if (!day) continue;
        const imp = num(d.impressions), reach = num(d.reach), clicks = num(d.clicks);
        out.push({
          ad_id: id, adset_id: String(s.platformAdSetId || ""), campaign_id: String(campaign.platformCampaignId || ""), day,
          name: String(ad.name || ""), status: String(ad.status || ""), spend: num(d.spend), impressions: imp, reach, clicks,
          ctr: num(d.ctr) || (imp ? (clicks / imp) * 100 : 0), frequency: reach ? imp / reach : 0, results: resultsOf(d, goal),
        });
      }
    }
  }
  return out;
}

export type AdStat = { id: string; adsetId: string; name: string; status: string; spend: number; impressions: number; reach: number; clicks: number; results: number; ctr: number; freq3: number; ctrPrev: number; ctrLast: number };

/* sums per ad over the last 7 days, plus the 3-day frequency and this week's CTR against the week before.
   freq3: impressions / unique reach over the last 3 days, from a tree call over that range (daily reach can't be summed) */
export function adStats(rows: DayRow[], today: string, freq3: Record<string, number> = {}): AdStat[] {
  const d = (n: number) => new Date(Date.parse(today + "T00:00:00Z") - n * 86400000).toISOString().slice(0, 10);
  const w0 = d(ENGINE.windowDays), w1 = d(ENGINE.windowDays * 2), f0 = d(3);
  const by = new Map<string, DayRow[]>();
  rows.forEach((r) => by.set(r.ad_id, [...(by.get(r.ad_id) || []), r]));
  const ctr = (list: DayRow[]) => { const i = list.reduce((a, r) => a + r.impressions, 0); return i ? (list.reduce((a, r) => a + r.clicks, 0) / i) * 100 : 0; };
  return [...by.entries()].map(([id, list]) => {
    list.sort((a, b) => a.day.localeCompare(b.day));
    const last = list[list.length - 1];
    const week = list.filter((r) => r.day >= w0 && r.day < today), prev = list.filter((r) => r.day >= w1 && r.day < w0), three = list.filter((r) => r.day >= f0 && r.day < today);
    const sum = (k: keyof DayRow, l = week) => l.reduce((a, r) => a + (r[k] as number), 0);
    const imp3 = sum("impressions", three), reach3 = Math.max(...three.map((r) => r.reach), 0);
    return {
      id, adsetId: last.adset_id, name: last.name, status: last.status,
      spend: sum("spend"), impressions: sum("impressions"), reach: sum("reach"), clicks: sum("clicks"), results: sum("results"),
      ctr: ctr(week), freq3: freq3[id] ?? (reach3 ? imp3 / reach3 : 0), ctrLast: ctr(week), ctrPrev: ctr(prev),
    };
  });
}

export type Decision =
  | { kind: "skip"; reason: string }
  | { kind: "stable"; reason: string; hints: string[] }
  | { kind: "replace"; ad: AdStat; reason: string; hints: string[] }
  | { kind: "fatigue"; ad: AdStat; reason: string; hints: string[] }
  | { kind: "winner"; ad: AdStat; reason: string; hints: string[] };

export type EngineInput = {
  ads: AdStat[];                 // per ad, last 7 days
  activeAdIds: string[];         // ads switched on right now
  daysRunning: number;           // since the campaign's first delivery day
  learning: boolean;             // Meta is still learning on the ad set
  lastActionAt: string | null;   // ISO, the latest change on this campaign
  pendingDraft: boolean;         // a new ad waits for approval
  goal: Goal;
  now: Date;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/* chapter 9: stop at the first blocker, then the first action that applies. One action at most. */
export function decide(x: EngineInput): Decision {
  if (x.daysRunning < ENGINE.minDaysRunning || !x.activeAdIds.length) return { kind: "skip", reason: "הקמפיין עוד לא רץ יום שלם עם מודעה פעילה" };
  if (x.learning) return { kind: "skip", reason: "מטא עדיין בשלב הלמידה. לא נוגעים עד שהשלב יסתיים" };
  if (x.lastActionAt && x.now.getTime() - Date.parse(x.lastActionAt) < ENGINE.restHours * 3600000) return { kind: "skip", reason: "בוצעה פעולה בקמפיין ב-48 השעות האחרונות. ממתינים שהנתונים יתייצבו" };
  if (x.pendingDraft) return { kind: "skip", reason: "יש מודעה חדשה שממתינה לאישור" };

  const active = x.ads.filter((a) => x.activeAdIds.includes(a.id));
  const spend = x.ads.reduce((a, s) => a + s.spend, 0), results = x.ads.reduce((a, s) => a + s.results, 0);
  const cpr = results ? spend / results : 0;
  const best = [...active].sort((a, b) => b.results - a.results || (a.spend && b.spend ? a.spend / Math.max(a.results, 1e-9) - b.spend / Math.max(b.results, 1e-9) : 0))[0];
  const hints: string[] = [];
  const avgFreq = active.length ? active.reduce((a, s) => a + s.freq3, 0) / active.length : 0;
  if (avgFreq >= ENGINE.smallAudienceFrequency) hints.push("הקהל קטן מדי (תדירות " + r2(avgFreq) + "). מומלץ לשכפל את קבוצת המודעות עם אזור רחב יותר. שינוי קהל בקבוצה הקיימת מאפס את הלמידה");
  const clicks = x.ads.reduce((a, s) => a + s.clicks, 0);
  if (x.goal !== "traffic" && clicks >= ENGINE.clicksWithoutLeads && !results) hints.push(clicks + " קליקים בשבוע בלי פנייה אחת. כדאי לבדוק שהיעד עובד ושההצעה ברורה");

  /* 1. a loser: no results after spending twice the campaign's cost per result. Only with more than one active ad; never the best ad */
  if (active.length > 1 && cpr > 0) {
    const loser = active.filter((a) => a !== best && a.results === 0 && a.spend >= ENGINE.loserSpendMultiple * cpr).sort((a, b) => b.spend - a.spend)[0];
    if (loser) return { kind: "replace", ad: loser, hints, reason: "המודעה \"" + loser.name + "\" הוציאה " + r2(loser.spend) + " בלי אף תוצאה, פי 2 ויותר מהעלות הממוצעת לתוצאה בקמפיין (" + r2(cpr) + "). מחליפים אותה במודעה חדשה" };
  }
  /* 2. fatigue: people saw it 3+ times and the CTR fell 30% against last week */
  const tired = active.filter((a) => a.freq3 >= ENGINE.fatigueFrequency && a.ctrPrev > 0 && a.ctrLast <= a.ctrPrev * (1 - ENGINE.fatigueCtrDrop)).sort((a, b) => b.freq3 - a.freq3)[0];
  if (tired) return { kind: "fatigue", ad: tired, hints, reason: "שחיקה במודעה \"" + tired.name + "\": תדירות " + r2(tired.freq3) + " ב-3 הימים האחרונים, והקליקים ירדו מ-" + r2(tired.ctrPrev) + "% ל-" + r2(tired.ctrLast) + "%. מוסיפים מודעה בזווית אחרת" };
  /* 3. a winner: 5+ results and one ad brings 60% of them */
  if (results >= ENGINE.winnerMinResults && best && best.results / results >= ENGINE.winnerShare) return { kind: "winner", ad: best, hints, reason: "המודעה \"" + best.name + "\" הביאה " + best.results + " מתוך " + results + " התוצאות השבוע. מוסיפים מודעה נוספת באותו כיוון" };
  return { kind: "stable", hints, reason: results ? results + " תוצאות השבוע בעלות ממוצעת של " + r2(cpr) + ". אין צורך בשינוי" : "אין עדיין מספיק נתונים לשינוי" };
}

/* Meta's learning phase from GET /ads/ad-sets/{id}?fields=learning_stage_info */
export function learningOf(adSet: J | null | undefined): "learning" | "done" | "limited" | "" {
  const s = String(((adSet?.learning_stage_info || {}) as J).status || "").toUpperCase();
  if (s === "LEARNING") return "learning";
  if (s === "FAIL") return "limited";
  if (s === "SUCCESS") return "done";
  return "";
}
export const LEARNING_LABEL: Record<string, string> = { learning: "בלמידה", done: "סיים למידה", limited: "למידה מוגבלת", "": "לא ידוע" };
