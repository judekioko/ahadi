import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const KINDS = ["owed_to_me", "i_owe", "promise_to_me", "promise_by_me"] as const;
export type Kind = (typeof KINDS)[number];

export interface Participant {
  id: string;
  name: string;
  note: string;
  joinedAt: string; // ISO
}

export interface Message {
  id: string;
  participantId: string;
  text: string;
  at: string; // when the participant sent it
}

export interface Entry {
  id: string;
  participantId: string;
  messageId?: string;
  kind: Kind;
  person: string; // the other party
  what: string; // short description, in the participant's own words
  amount?: number;
  currency?: string;
  due?: string; // YYYY-MM-DD
  status: "open" | "done";
  createdAt: string;
}

export interface Question {
  id: string;
  participantId: string;
  text: string;
  answer: string;
  at: string;
}

export interface DB {
  participants: Participant[];
  messages: Message[];
  entries: Entry[];
  questions: Question[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const dataFile = process.env.AHADI_DATA ?? path.join(here, "..", "data", "ahadi.json");

export const newId = () => crypto.randomUUID().slice(0, 8);

export function load(): DB {
  try {
    return { participants: [], messages: [], entries: [], questions: [], ...JSON.parse(fs.readFileSync(dataFile, "utf8")) };
  } catch {
    return { participants: [], messages: [], entries: [], questions: [] };
  }
}

export function save(db: DB) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const tmp = dataFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dataFile); // atomic: a crash never leaves a half-written ledger
}

/** Returns an error string, or the cleaned entry fields. */
export function cleanEntry(raw: any): { error: string } | { value: Pick<Entry, "kind" | "person" | "what" | "amount" | "currency" | "due"> } {
  if (!raw || typeof raw !== "object") return { error: "entry must be an object" };
  if (!KINDS.includes(raw.kind)) return { error: `kind must be one of ${KINDS.join(", ")}` };
  const person = String(raw.person ?? "").trim().slice(0, 80);
  const what = String(raw.what ?? "").trim().slice(0, 300);
  if (!person) return { error: "person is required" };
  if (!what) return { error: "what is required" };

  let amount: number | undefined;
  if (raw.amount !== undefined && raw.amount !== null && raw.amount !== "") {
    amount = Number(raw.amount);
    if (!Number.isFinite(amount) || amount < 0) return { error: "amount must be a non-negative number" };
  }
  let due: string | undefined;
  if (raw.due) {
    due = String(raw.due);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due))) return { error: "due must be YYYY-MM-DD" };
  }
  const currency = amount !== undefined ? String(raw.currency || "KES").toUpperCase().slice(0, 4) : undefined;
  return { value: { kind: raw.kind, person, what, amount, currency, due } };
}
