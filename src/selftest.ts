import { cleanEntry, type DB, type Entry } from "./db.js";
import { keywordSearch } from "./llm.js";
import { nudgeText, nudges, scorecard } from "./metrics.js";

let fails = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(cond ? "PASS" : "FAIL", name, extra);
  if (!cond) fails++;
};

// ---- entry validation (also guards LLM output) -------------------------------------------------
check("valid entry accepted", "value" in cleanEntry({ kind: "owed_to_me", person: "John", what: "lunch", amount: 80, due: "2026-11-01" }));
check("currency defaults to KES when amount present", (cleanEntry({ kind: "owed_to_me", person: "J", what: "x", amount: 5 }) as any).value.currency === "KES");
check("no currency when no amount", (cleanEntry({ kind: "promise_to_me", person: "J", what: "x" }) as any).value.currency === undefined);
check("bad kind rejected", "error" in cleanEntry({ kind: "gift", person: "J", what: "x" }));
check("negative amount rejected", "error" in cleanEntry({ kind: "i_owe", person: "J", what: "x", amount: -1 }));
check("junk date rejected", "error" in cleanEntry({ kind: "i_owe", person: "J", what: "x", due: "next friday" }));
check("missing person rejected", "error" in cleanEntry({ kind: "i_owe", what: "x" }));
check("non-object rejected", "error" in cleanEntry(null));

// ---- scorecard ---------------------------------------------------------------------------------
const day = (d: number) => new Date(Date.UTC(2026, 9, 1 + d, 10)).toISOString();
const empty = (): DB => ({ participants: [], messages: [], entries: [], questions: [] });

function cohort(spec: Array<{ w1: number; w2: number; asked: boolean }>): DB {
  const db = empty();
  spec.forEach((s, i) => {
    const id = `p${i}`;
    db.participants.push({ id, name: id, note: "", joinedAt: day(0) });
    db.messages.push({ id: `m${i}-0`, participantId: id, text: "first", at: day(0) });
    for (let k = 0; k < s.w1; k++) db.messages.push({ id: `a${i}${k}`, participantId: id, text: "w1", at: day(1 + k) });
    for (let k = 0; k < s.w2; k++) db.messages.push({ id: `b${i}${k}`, participantId: id, text: "w2", at: day(7 + k) });
    if (s.asked) db.questions.push({ id: `q${i}`, participantId: id, text: "?", answer: "", at: day(3) });
  });
  return db;
}
const later = new Date(Date.UTC(2026, 9, 20)); // 19 days after the first message: everyone is "matured"

let s = scorecard(cohort(Array(3).fill({ w1: 3, w2: 3, asked: true })), later);
check("under 5 matured participants → TOO EARLY, however good", s.verdict.label === "TOO EARLY", s.verdict.why);

s = scorecard(cohort(Array(10).fill({ w1: 4, w2: 2, asked: true })), later);
check("10/10 active in w2 and asking → STRONG", s.verdict.label === "STRONG", s.verdict.why);

s = scorecard(cohort([...Array(4).fill({ w1: 4, w2: 2, asked: false }), ...Array(6).fill({ w1: 4, w2: 0, asked: false })]), later);
check("40% active in w2 → PROMISING", s.verdict.label === "PROMISING", s.verdict.why);

s = scorecard(cohort([...Array(1).fill({ w1: 4, w2: 1, asked: true }), ...Array(9).fill({ w1: 5, w2: 0, asked: true })]), later);
check("10% active in w2 → WEAK (even if they all asked questions)", s.verdict.label === "WEAK", s.verdict.why);

s = scorecard(cohort(Array(10).fill({ w1: 4, w2: 3, asked: false })), later);
check("great retention but nobody asks questions → not STRONG", s.verdict.label !== "STRONG", s.verdict.label);

const early = new Date(Date.UTC(2026, 9, 6)); // day 5: nobody reached day 14
s = scorecard(cohort(Array(10).fill({ w1: 4, w2: 0, asked: true })), early);
check("week 2 not yet reached → TOO EARLY, not WEAK", s.verdict.label === "TOO EARLY" && s.cohort.matured === 0, `matured=${s.cohort.matured}`);

s = scorecard(cohort([{ w1: 2, w2: 3, asked: true }]), later);
const p0 = s.participants[0];
check("week buckets: 1 first + 2 in days 1-2 = 3 in w1; 3 in w2", p0.week1Messages === 3 && p0.week2Messages === 3, `w1=${p0.week1Messages} w2=${p0.week2Messages}`);
check("participant with no messages isn't counted in the cohort", scorecard({ ...empty(), participants: [{ id: "x", name: "x", note: "", joinedAt: day(0) }] }, later).cohort.n === 0);

// ---- nudges ------------------------------------------------------------------------------------
const mk = (o: Partial<Entry>): Entry => ({ id: "e", participantId: "p", kind: "owed_to_me", person: "John", what: "lunch", status: "open", createdAt: day(0), ...o });
const entries = [mk({ id: "late", due: "2026-10-01" }), mk({ id: "today", due: "2026-10-05" }), mk({ id: "tomorrow", due: "2026-10-06" }), mk({ id: "far", due: "2026-10-20" }), mk({ id: "done", due: "2026-10-05", status: "done" }), mk({ id: "nodue" })];
const n = nudges(entries, "2026-10-05");
check("nudges: overdue + today + tomorrow, ordered; excludes done, far-off, undated", n.map((e) => e.id).join() === "late,today,tomorrow", n.map((e) => e.id).join());
check("nudge wording: overdue", nudgeText(mk({ due: "2026-10-01", amount: 2000 }), "2026-10-05").includes("was due 2026-10-01"));
check("nudge wording: money formatted", nudgeText(mk({ due: "2026-10-05", amount: 2000 }), "2026-10-05").includes("KES 2,000"));

// ---- keyword fallback --------------------------------------------------------------------------
const led = [mk({ id: "1", person: "John", what: "lunch money", amount: 80 }), mk({ id: "2", kind: "promise_to_me", person: "Landlord", what: "repair the sink" }), mk({ id: "3", kind: "i_owe", person: "Sarah", what: "wedding contribution" })];
check("search by person", keywordSearch("what did John promise?", led)[0]?.id === "1");
check("search by topic", keywordSearch("when is the sink fixed", led)[0]?.id === "2");
check("'who do I owe' ranks debts above promises", ["1", "3"].includes(keywordSearch("who do I owe money", led)[0]?.id));
check("no match → empty", keywordSearch("zzz qqq", led).length === 0);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
