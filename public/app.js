const $ = (s, el = document) => el.querySelector(s);
const main = $("#main");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const api = async (url, opts) => {
  const r = await fetch(url, opts && { ...opts, headers: { "Content-Type": "application/json" }, body: JSON.stringify(opts.body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};

const KIND = {
  owed_to_me: "They owe me",
  i_owe: "I owe them",
  promise_to_me: "Promised me",
  promise_by_me: "I promised",
};

let state = null;
let view = { name: "score" };

async function refresh() {
  state = await api("/api/state");
  const mode = $("#mode");
  mode.className = "mode " + (state.llm ? "on" : "off");
  mode.textContent = state.llm ? "● AI extraction on" : "● No API key: manual entry mode";

  $("#people").innerHTML = state.scorecard.participants
    .map((p) => {
      const cold = p.daysSinceLast !== null && p.daysSinceLast >= 4;
      const dot = p.messages === 0 ? "" : cold ? "cold" : "good";
      return `<button class="person ${view.id === p.id ? "active" : ""}" data-id="${p.id}"><span><span class="dot ${dot}"></span>${esc(p.name)}</span><span class="muted">${p.messages}</span></button>`;
    })
    .join("") || '<p class="muted">No one yet.</p>';

  const n = (await api("/api/nudges")).length;
  $("#nudge-count").textContent = n || "";
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("active", b.dataset.view === view.name));
}

async function render() {
  await refresh();
  if (view.name === "score") return renderScore();
  if (view.name === "nudges") return renderNudges();
  if (view.name === "person") return renderPerson(view.id);
}

function go(next) { view = next; render(); }

// ---- scorecard ----------------------------------------------------------------------------------
function renderScore() {
  const { cohort, verdict, participants } = state.scorecard;
  const cls = verdict.label.split(" ")[0];
  main.innerHTML = `
    <h1>Scorecard</h1>
    <div class="verdict ${cls}"><b>${esc(verdict.label)}</b>${esc(verdict.why)}</div>
    <div class="stats">
      <div class="stat"><b>${cohort.n}</b><span>participants who started</span></div>
      <div class="stat"><b>${cohort.matured}</b><span>reached day 14</span></div>
      <div class="stat"><b>${cohort.week2ActivePct}%</b><span>still sending in week 2</span></div>
      <div class="stat"><b>${cohort.askedQuestionPct}%</b><span>asked a question</span></div>
      <div class="stat"><b>${cohort.avgMessagesPerWeek}</b><span>messages / week (avg)</span></div>
      <div class="stat"><b>${cohort.avgEntries}</b><span>ledger entries (avg)</span></div>
    </div>
    <h3>Per participant</h3>
    <table><tr><th>Name</th><th>Msgs</th><th>Wk 1</th><th>Wk 2</th><th>Entries</th><th>Open</th><th>Questions</th><th>Days in</th><th>Quiet for</th></tr>
    ${participants.map((p) => `<tr><td><a href="#" data-id="${p.id}" class="plink">${esc(p.name)}</a></td><td>${p.messages}</td><td>${p.week1Messages}</td><td>${p.week2Messages}</td><td>${p.entries}</td><td>${p.openEntries}</td><td>${p.questions}</td><td>${p.daysInTest}</td><td>${p.daysSinceLast === null ? "-" : p.daysSinceLast + "d"}</td></tr>`).join("")}
    </table>
    <p class="muted">Decision rule (set before you start, so you can't talk yourself into it later): need at least 5 participants past day 14. <b>STRONG</b> = ≥50% still sending in week 2 and ≥50% asked a question. <b>PROMISING</b> = ≥30% in week 2. Otherwise <b>WEAK</b>. See PROTOCOL.md.</p>`;
  main.querySelectorAll(".plink").forEach((a) => (a.onclick = (e) => { e.preventDefault(); go({ name: "person", id: a.dataset.id }); }));
}

// ---- reminders to send --------------------------------------------------------------------------
async function renderNudges() {
  const items = await api("/api/nudges");
  main.innerHTML = `<h1>Send today</h1><p class="muted">Open items due today, tomorrow or overdue. Copy the text and send it to the participant on WhatsApp. This is the reminder value the real product would automate, so note whether they react.</p>
    ${items.map((n) => `<div class="card"><div class="row"><b>${esc(n.participant)}</b><span class="muted">due ${esc(n.due)}</span></div><p>${esc(n.text)}</p><button class="small copy" data-text="${esc(n.text)}">Copy</button></div>`).join("") || '<p class="muted">Nothing due. 🎉</p>'}`;
  main.querySelectorAll(".copy").forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.text); b.textContent = "Copied"; } catch { b.textContent = "Select text manually"; } }));
}

// ---- participant --------------------------------------------------------------------------------
const entryRow = (e = {}) => `
  <div class="erow">
    <select class="f-kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${e.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select>
    <input class="f-person" placeholder="Who" value="${esc(e.person)}">
    <input class="f-what" placeholder="What" value="${esc(e.what)}">
    <input class="f-amount" placeholder="Amount" type="number" min="0" value="${e.amount ?? ""}">
    <input class="f-due" type="date" value="${esc(e.due)}">
    <button class="ghost small rm" type="button" title="Remove">✕</button>
  </div>`;

function collectRows(container) {
  return [...container.querySelectorAll(".erow")]
    .map((r) => ({ kind: $(".f-kind", r).value, person: $(".f-person", r).value, what: $(".f-what", r).value, amount: $(".f-amount", r).value, due: $(".f-due", r).value }))
    .filter((e) => e.person.trim() || e.what.trim());
}

async function renderPerson(id) {
  const d = await api(`/api/participants/${id}`);
  const { participant: p, messages, entries, questions } = d;
  const open = entries.filter((e) => e.status === "open");
  const done = entries.filter((e) => e.status === "done");

  main.innerHTML = `
    <h1>${esc(p.name)}</h1>
    <p class="muted">Joined ${p.joinedAt.slice(0, 10)}${p.note ? " · " + esc(p.note) : ""}</p>

    <h3>1. Log what they sent you</h3>
    <textarea id="msg-text" placeholder="Paste their WhatsApp text, or the transcript of their voice note…"></textarea>
    <div class="row" style="margin-top:8px"><label class="muted">Sent at <input id="msg-at" type="datetime-local" style="width:auto"></label><span class="muted">(leave blank for now)</span>
      <button id="msg-send">${state.llm ? "Log & extract" : "Log message"}</button></div>
    <div id="msg-status" class="muted"></div>
    <div id="proposals"></div>

    <h3>2. Ledger <span class="muted">(${open.length} open)</span></h3>
    <div id="ledger">${open.concat(done).map((e) => `
      <div class="entry ${e.status}"><div><span class="tag">${KIND[e.kind]}</span><b>${esc(e.person)}</b>: ${esc(e.what)}${e.amount !== undefined ? ` · ${esc(e.currency)} ${e.amount.toLocaleString("en-US")}` : ""}${e.due ? ` <span class="muted">· due ${e.due}</span>` : ""}</div>
      <div class="row"><button class="ghost small tog" data-id="${e.id}" data-s="${e.status === "open" ? "done" : "open"}">${e.status === "open" ? "Done" : "Reopen"}</button><button class="ghost small del" data-id="${e.id}">✕</button></div></div>`).join("") || '<p class="muted">Empty.</p>'}</div>
    <button class="ghost small" id="add-manual">+ Add entry by hand</button><div id="manual"></div>

    <h3>3. They asked you something</h3>
    <div class="row"><input id="q-text" placeholder='e.g. "What does John owe me?"' style="flex:1"><button id="q-send">Answer</button></div>
    <div id="q-answer"></div>
    ${questions.length ? `<p class="muted">${questions.length} question(s) so far</p>` : ""}

    <h3>History</h3>
    ${messages.map((m) => `<div class="msg"><time>${esc(m.at.slice(0, 16).replace("T", " "))}</time>${esc(m.text)}</div>`).join("") || '<p class="muted">No messages yet.</p>'}`;

  const status = $("#msg-status");
  const props = $("#proposals");

  const showEditor = (target, heading, rows, messageId) => {
    target.innerHTML = `<div class="card"><b>${heading}</b><div class="rows">${rows.map(entryRow).join("")}</div>
      <div class="row" style="margin-top:8px"><button class="save">Save to ledger</button><button class="ghost add-row" type="button">+ row</button><button class="ghost cancel" type="button">Discard</button></div><div class="err"></div></div>`;
    const card = target.firstElementChild;
    card.onclick = (ev) => { if (ev.target.classList.contains("rm")) ev.target.closest(".erow").remove(); };
    $(".add-row", card).onclick = () => $(".rows", card).insertAdjacentHTML("beforeend", entryRow());
    $(".cancel", card).onclick = () => (target.innerHTML = "");
    $(".save", card).onclick = async () => {
      const entries = collectRows(card);
      if (!entries.length) return;
      try { await api(`/api/participants/${id}/entries`, { method: "POST", body: { messageId, entries } }); render(); }
      catch (e) { $(".err", card).textContent = e.message; }
    };
  };

  $("#msg-send").onclick = async () => {
    const text = $("#msg-text").value.trim();
    if (!text) return;
    const at = $("#msg-at").value;
    status.textContent = state.llm ? "Extracting…" : "";
    $("#msg-send").disabled = true;
    try {
      const r = await api(`/api/participants/${id}/messages`, { method: "POST", body: { text, at: at ? new Date(at).toISOString() : undefined } });
      $("#msg-text").value = "";
      status.innerHTML = r.error ? `<span class="err">${esc(r.error)}</span>` : r.proposals.length ? '<span class="ok">Check the proposed entries, edit, then save.</span>' : "Logged. No commitments detected: add one by hand if you see it.";
      showEditor(props, r.llm ? "Proposed entries" : "Add entries from this message", r.proposals.length ? r.proposals : r.llm ? [] : [{}], r.message.id);
      refresh();
    } catch (e) { status.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
    $("#msg-send").disabled = false;
  };

  $("#add-manual").onclick = () => showEditor($("#manual"), "New entry", [{}]);

  main.querySelectorAll(".tog").forEach((b) => (b.onclick = async () => { await api(`/api/entries/${b.dataset.id}`, { method: "PATCH", body: { status: b.dataset.s } }); render(); }));
  main.querySelectorAll(".del").forEach((b) => (b.onclick = async () => { if (confirm("Delete this entry?")) { await api(`/api/entries/${b.dataset.id}`, { method: "DELETE" }); render(); } }));

  $("#q-send").onclick = async () => {
    const question = $("#q-text").value.trim();
    if (!question) return;
    $("#q-send").disabled = true;
    try {
      const r = await api(`/api/participants/${id}/ask`, { method: "POST", body: { question } });
      $("#q-answer").innerHTML = `<div class="card"><span class="tag">${r.source === "llm" ? "AI answer" : "keyword matches"}</span><pre class="answer">${esc(r.answer)}</pre><p class="muted">Review before sending it to them on WhatsApp.</p></div>`;
      $("#q-text").value = "";
      refresh();
    } catch (e) { $("#q-answer").innerHTML = `<span class="err">${esc(e.message)}</span>`; }
    $("#q-send").disabled = false;
  };
}

// ---- wiring -------------------------------------------------------------------------------------
document.querySelectorAll(".nav").forEach((b) => (b.onclick = () => go({ name: b.dataset.view })));
$("#people").onclick = (e) => { const b = e.target.closest(".person"); if (b) go({ name: "person", id: b.dataset.id }); };
$("#add-form").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("#add-name").value.trim();
  if (!name) return;
  const p = await api("/api/participants", { method: "POST", body: { name } });
  $("#add-name").value = "";
  go({ name: "person", id: p.id });
};

render();
