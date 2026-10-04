import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanEntry, load, newId, save, type Entry } from "./db.js";
import { answerQuestion, describe, extractEntries, keywordSearch, llmEnabled } from "./llm.js";
import { nudgeText, nudges, scorecard } from "./metrics.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(here, "..", "public")));

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();

// Listens on localhost only: this tool holds other people's private debts and messages.
app.get("/api/state", (_req, res) => {
  const db = load();
  res.json({ llm: llmEnabled(), today: today(), participants: db.participants, scorecard: scorecard(db) });
});

app.post("/api/participants", (req, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: "name is required" });
  const db = load();
  const p = { id: newId(), name, note: String(req.body?.note ?? "").slice(0, 300), joinedAt: now() };
  db.participants.push(p);
  save(db);
  res.json(p);
});

app.get("/api/participants/:id", (req, res) => {
  const db = load();
  const p = db.participants.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const mine = <T extends { participantId: string }>(a: T[]) => a.filter((x) => x.participantId === p.id);
  res.json({ participant: p, messages: mine(db.messages).reverse(), entries: mine(db.entries), questions: mine(db.questions).reverse() });
});

// Log a message the participant sent you. Proposed entries are NOT saved until the operator confirms them.
app.post("/api/participants/:id/messages", async (req, res) => {
  const db = load();
  const p = db.participants.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const text = String(req.body?.text ?? "").trim();
  if (!text || text.length > 5000) return res.status(400).json({ error: "text required (max 5000 chars)" });
  const at = req.body?.at && !Number.isNaN(Date.parse(req.body.at)) ? new Date(req.body.at).toISOString() : now();

  const message = { id: newId(), participantId: p.id, text, at };
  db.messages.push(message);
  save(db);

  let proposals: unknown[] = [];
  let error: string | undefined;
  if (llmEnabled()) {
    try {
      proposals = await extractEntries(text, today(), p.name);
    } catch (e) {
      error = `Extraction failed: ${(e as Error).message}. Add the entries by hand.`;
    }
  }
  res.json({ message, proposals, llm: llmEnabled(), error });
});

app.post("/api/participants/:id/entries", (req, res) => {
  const db = load();
  const p = db.participants.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const raws: unknown[] = Array.isArray(req.body?.entries) ? req.body.entries : [];
  if (!raws.length) return res.status(400).json({ error: "no entries" });

  const added: Entry[] = [];
  for (const raw of raws) {
    const r = cleanEntry(raw);
    if ("error" in r) return res.status(400).json({ error: r.error });
    added.push({ id: newId(), participantId: p.id, messageId: req.body.messageId, status: "open", createdAt: now(), ...r.value });
  }
  db.entries.push(...added);
  save(db);
  res.json({ added });
});

app.patch("/api/entries/:id", (req, res) => {
  const db = load();
  const e = db.entries.find((x) => x.id === req.params.id);
  if (!e) return res.status(404).json({ error: "not found" });
  if (req.body?.status === "open" || req.body?.status === "done") e.status = req.body.status;
  save(db);
  res.json(e);
});

app.delete("/api/entries/:id", (req, res) => {
  const db = load();
  const before = db.entries.length;
  db.entries = db.entries.filter((x) => x.id !== req.params.id);
  save(db);
  res.json({ deleted: before - db.entries.length });
});

// The participant asked you something ("what does John owe me?"). Logged because question-asking is a retention signal.
app.post("/api/participants/:id/ask", async (req, res) => {
  const db = load();
  const p = db.participants.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const text = String(req.body?.question ?? "").trim();
  if (!text || text.length > 500) return res.status(400).json({ error: "question required (max 500 chars)" });

  const entries = db.entries.filter((e) => e.participantId === p.id);
  let answer: string;
  let source: "llm" | "search";
  try {
    if (!llmEnabled()) throw new Error("no key");
    answer = await answerQuestion(text, entries, today());
    source = "llm";
  } catch {
    const hits = keywordSearch(text, entries);
    answer = hits.length ? hits.map(describe).join("\n") : "Nothing in the ledger matches. Check their earlier messages.";
    source = "search";
  }
  db.questions.push({ id: newId(), participantId: p.id, text, answer, at: now() });
  save(db);
  res.json({ answer, source });
});

// Reminders to send today: open entries due today/tomorrow/overdue, with ready-to-paste text.
app.get("/api/nudges", (_req, res) => {
  const db = load();
  const t = today();
  const items = nudges(db.entries, t).map((e) => ({
    entryId: e.id,
    participant: db.participants.find((p) => p.id === e.participantId)?.name ?? "?",
    text: nudgeText(e, t),
    due: e.due,
  }));
  res.json(items);
});

const port = Number(process.env.PORT) || 3100;
app.listen(port, "127.0.0.1", () => {
  console.log(`Ahadi concierge tool on http://localhost:${port}  (${llmEnabled() ? "LLM on" : "no ANTHROPIC_API_KEY: manual entry mode"})`);
});
