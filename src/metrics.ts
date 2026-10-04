import type { DB, Entry } from "./db.js";

const DAY = 86_400_000;
const dayKey = (iso: string) => iso.slice(0, 10);

export interface ParticipantStats {
  id: string;
  name: string;
  messages: number;
  entries: number;
  openEntries: number;
  questions: number;
  activeDays: number;
  week1Messages: number;
  week2Messages: number;
  daysSinceLast: number | null;
  daysInTest: number;
}

export interface Scorecard {
  participants: ParticipantStats[];
  cohort: {
    n: number;
    week2ActivePct: number;
    askedQuestionPct: number;
    avgMessagesPerWeek: number;
    avgEntries: number;
    matured: number; // participants who have been in the test 14+ days
  };
  verdict: { label: "TOO EARLY" | "STRONG" | "PROMISING" | "WEAK"; why: string };
}

/**
 * Week 1 = days 0-6 after the participant's first message, week 2 = days 7-13.
 * "Active in week 2" is the headline retention signal: people who keep sending after the novelty fades.
 */
export function scorecard(db: DB, now = new Date()): Scorecard {
  const stats: ParticipantStats[] = db.participants.map((p) => {
    const msgs = db.messages.filter((m) => m.participantId === p.id).sort((a, b) => a.at.localeCompare(b.at));
    const first = msgs[0] ? Date.parse(msgs[0].at) : null;
    const rel = (m: { at: string }) => (first === null ? -1 : Math.floor((Date.parse(m.at) - first) / DAY));
    const entries = db.entries.filter((e) => e.participantId === p.id);
    return {
      id: p.id,
      name: p.name,
      messages: msgs.length,
      entries: entries.length,
      openEntries: entries.filter((e) => e.status === "open").length,
      questions: db.questions.filter((q) => q.participantId === p.id).length,
      activeDays: new Set(msgs.map((m) => dayKey(m.at))).size,
      week1Messages: msgs.filter((m) => rel(m) >= 0 && rel(m) < 7).length,
      week2Messages: msgs.filter((m) => rel(m) >= 7 && rel(m) < 14).length,
      daysSinceLast: msgs.length ? Math.floor((now.getTime() - Date.parse(msgs[msgs.length - 1].at)) / DAY) : null,
      daysInTest: first === null ? 0 : Math.floor((now.getTime() - first) / DAY),
    };
  });

  const started = stats.filter((s) => s.messages > 0);
  const matured = started.filter((s) => s.daysInTest >= 14);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  const cohort = {
    n: started.length,
    week2ActivePct: pct(matured.filter((s) => s.week2Messages > 0).length, matured.length),
    askedQuestionPct: pct(started.filter((s) => s.questions > 0).length, started.length),
    avgMessagesPerWeek: started.length
      ? Math.round((started.reduce((a, s) => a + s.messages / Math.max(1, s.daysInTest / 7), 0) / started.length) * 10) / 10
      : 0,
    avgEntries: started.length ? Math.round((started.reduce((a, s) => a + s.entries, 0) / started.length) * 10) / 10 : 0,
    matured: matured.length,
  };

  let verdict: Scorecard["verdict"];
  if (matured.length < 5) {
    verdict = { label: "TOO EARLY", why: `Only ${matured.length} participant(s) have reached day 14 (need at least 5 for any signal).` };
  } else if (cohort.week2ActivePct >= 50 && cohort.askedQuestionPct >= 50) {
    verdict = { label: "STRONG", why: `${cohort.week2ActivePct}% still sending in week 2 and ${cohort.askedQuestionPct}% asked a question. Worth building.` };
  } else if (cohort.week2ActivePct >= 30) {
    verdict = { label: "PROMISING", why: `${cohort.week2ActivePct}% active in week 2. Interview the drop-offs before building.` };
  } else {
    verdict = { label: "WEAK", why: `Only ${cohort.week2ActivePct}% active in week 2. People don't keep logging, so a bot or app is unlikely to fix that.` };
  }
  return { participants: stats, cohort, verdict };
}

/** Open entries due today or earlier, or within `withinDays`: the reminders the operator should send. */
export function nudges(entries: Entry[], today: string, withinDays = 1): Entry[] {
  const limit = new Date(Date.parse(today) + withinDays * DAY).toISOString().slice(0, 10);
  return entries.filter((e) => e.status === "open" && e.due && e.due <= limit).sort((a, b) => a.due!.localeCompare(b.due!));
}

export function nudgeText(e: Entry, today: string): string {
  const late = e.due! < today;
  const money = e.amount !== undefined ? `${e.currency ?? "KES"} ${e.amount.toLocaleString("en-US")}` : "";
  const when = late ? `was due ${e.due}` : e.due === today ? "is due today" : "is due tomorrow";
  switch (e.kind) {
    case "owed_to_me": return `Reminder: ${e.person} owes you ${money || e.what} (${e.what}). It ${when}.`;
    case "i_owe": return `Reminder: you owe ${e.person} ${money || e.what} (${e.what}). It ${when}.`;
    case "promise_to_me": return `Reminder: ${e.person} promised: ${e.what}. It ${when}.`;
    case "promise_by_me": return `Reminder: you promised ${e.person}: ${e.what}. It ${when}.`;
  }
}
