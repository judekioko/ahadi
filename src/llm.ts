import Anthropic from "@anthropic-ai/sdk";
import { KINDS, cleanEntry, type Entry } from "./db.js";

const MODEL = process.env.AHADI_MODEL ?? "claude-sonnet-5-5";
export const llmEnabled = () => !!process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;
const api = () => (client ??= new Anthropic());

type Proposal = NonNullable<ReturnType<typeof okValue>>;
const okValue = (r: ReturnType<typeof cleanEntry>) => ("value" in r ? r.value : null);

const extractTool: Anthropic.Tool = {
  name: "record_entries",
  description: "Record every promise, debt or loan found in the message. Return an empty list if there is none.",
  input_schema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: [...KINDS],
              description: "owed_to_me: someone owes the sender money/goods. i_owe: the sender owes someone. promise_to_me: someone promised the sender something. promise_by_me: the sender promised someone something.",
            },
            person: { type: "string", description: "The OTHER person involved, as the sender names them" },
            what: { type: "string", description: "Short description in the sender's own words, e.g. 'fix the sink' or 'lunch money'" },
            amount: { type: "number", description: "Money amount if stated, otherwise omit" },
            currency: { type: "string", description: "ISO code. Default KES if the sender is clearly in Kenya and no currency is given" },
            due: { type: "string", description: "YYYY-MM-DD if a deadline is stated or implied (resolve 'Friday', 'end of month' against today's date), otherwise omit" },
          },
          required: ["kind", "person", "what"],
        },
      },
    },
    required: ["entries"],
  },
};

const EXTRACT_SYSTEM = `You maintain a personal ledger of promises and debts for a user in Kenya. Messages may be English, Swahili, Sheng, or a mix, and may be a voice-note transcript.
Extract only concrete commitments the sender states or reports (money owed, loans, things promised). Do not invent details: if no amount or date is given, omit them. Ignore chit-chat and vague intentions ("we should meet sometime"). One entry per distinct commitment. Amounts like "2k" mean 2000; "1.5k" means 1500.`;

export async function extractEntries(text: string, today: string, senderName: string): Promise<Proposal[]> {
  const res = await api().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: EXTRACT_SYSTEM,
    tools: [extractTool],
    tool_choice: { type: "tool", name: "record_entries" },
    messages: [{ role: "user", content: `Today is ${today}. Sender: ${senderName}.\n\nMessage:\n${text}` }],
  });
  const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const raw = ((block?.input as { entries?: unknown[] })?.entries ?? []) as unknown[];
  // The model's output is untrusted input: run it through the same validation as manual entries.
  return raw.map((r) => okValue(cleanEntry(r))).filter((v): v is Proposal => v !== null);
}

const ANSWER_SYSTEM = `You answer questions about a user's personal ledger of promises and debts. Use ONLY the ledger entries provided. Be brief and concrete: names, amounts, dates. If the ledger doesn't contain the answer, say so plainly. Never guess. Format money as e.g. "KES 2,000". Reply in the language the question was asked in.`;

export async function answerQuestion(question: string, entries: Entry[], today: string): Promise<string> {
  const ledger = entries.map((e) => ({ id: e.id, kind: e.kind, person: e.person, what: e.what, amount: e.amount, currency: e.currency, due: e.due, status: e.status, recorded: e.createdAt.slice(0, 10) }));
  const res = await api().messages.create({
    model: MODEL,
    max_tokens: 600,
    system: ANSWER_SYSTEM,
    messages: [{ role: "user", content: `Today is ${today}.\n\nLedger:\n${JSON.stringify(ledger)}\n\nQuestion: ${question}` }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim() || "(no answer)";
}

/** No-API fallback: rank entries by word overlap so the operator can answer by hand. */
export function keywordSearch(question: string, entries: Entry[]): Entry[] {
  const words = question.toLowerCase().split(/[^a-z0-9À-ɏ]+/).filter((w) => w.length > 2);
  const owe = /\bowe|\bdeni|\bdebt/.test(question.toLowerCase());
  return entries
    .map((e) => {
      const hay = `${e.person} ${e.what} ${e.kind}`.toLowerCase();
      let score = words.filter((w) => hay.includes(w)).length * 2;
      if (owe && (e.kind === "owed_to_me" || e.kind === "i_owe")) score += 1;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}

export function describe(e: Entry): string {
  const money = e.amount !== undefined ? `${e.currency ?? "KES"} ${e.amount.toLocaleString("en-US")}` : "";
  const dir = { owed_to_me: `${e.person} owes you`, i_owe: `You owe ${e.person}`, promise_to_me: `${e.person} promised you`, promise_by_me: `You promised ${e.person}` }[e.kind];
  return `${dir}${money ? " " + money : ""} (${e.what})${e.due ? `, due ${e.due}` : ""}${e.status === "done" ? " [done]" : ""}`;
}
