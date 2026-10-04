# Ahadi concierge test: protocol

**Question being tested:** will people keep telling a "promises & debts" assistant what's owed and promised, and come back to ask it things? You are the assistant. No app, no bot. Participants just message you on WhatsApp.

**Why not build first:** if people won't keep logging for two weeks when a human answers instantly, software won't fix it.

## 1. Who to recruit: 10-12 people
Aim for people who already juggle informal debts and promises:
- small shop owners / hustlers who give credit ("deni")
- chama members and treasurers
- landlords and tenants
- freelancers who chase payments
- people who lend to family and friends

Avoid friends who'll be "nice". Ask for people who'd tell you it's useless. Recruit a few more than 10: some never start.

## 2. What you tell them (copy-paste)
> I'm testing a simple assistant that remembers who owes you and what people promised you. For two weeks, just WhatsApp me whenever you lend money, borrow, or someone promises you something. Text or voice note, any language. I'll keep your list, remind you when things are due, and you can ask me things like "what does John owe me?". I'll never share your list, and I'll delete everything if you ask. Want to try?

Obtain a clear yes before logging anything. They are sharing details about *other people*, so keep it to what's needed, keep the data on your own machine only, and delete it when asked. (Kenya's Data Protection Act applies once this is more than a private experiment; check registration requirements with the ODPC before any public launch.)

## 3. Rules (these keep the result honest)
1. **Don't coach or nag.** Never message first to ask "any new debts?" The question is whether *they* come back. You may only send reminders for items they logged (use the **Send today** tab).
2. **Answer fast** (within ~1 hour in the day) so slow replies aren't why they quit.
3. **Don't explain features.** If they ask what they can do, say "anything about debts and promises".
4. Log **everything** they send, with the real send time (use "Sent at" if you're catching up).
5. Log every question they ask you, even if you answer from memory.

## 4. Daily routine (about 15 minutes)
1. Open **Ahadi** (`npm.cmd start`, then http://localhost:3100).
2. For each new message: paste it into the participant's page, check the proposed entries (or type them), save.
3. Answer any questions using the **Ask** box, read the answer before sending.
4. Open **Send today**, send each reminder text.
5. Glance at **Scorecard**; note who has gone quiet (red dot).

## 5. Day 14: decide
Fixed in advance so you can't rationalise later. Needs **at least 5 participants past day 14**:

| Result | Meaning | Action |
|---|---|---|
| **STRONG**: ≥50% still sending in week 2 **and** ≥50% asked a question | Habit + value | Build the WhatsApp bot, then the app |
| **PROMISING**: ≥30% active in week 2 | Real but weak pull | Interview drop-offs; fix the biggest reason; re-run with 5 new people |
| **WEAK**: <30% | They don't keep logging | Drop or radically change the idea |

"Active in week 2" = at least one message 7-13 days after their first.

## 6. Exit interviews (15 min each, especially drop-offs)
- When did you last use it, and what happened that day?
- What did you do *instead* (notebook, memory, M-Pesa messages, asking the person)?
- Did a reminder ever change what you did? Tell me about it.
- What would you have paid for this? Would you have paid *me*?
- What did you not trust it with?
- Who else do you know who has this problem worse than you?

## 7. Also record
- Languages used (English / Swahili / Sheng mix): does the mix break extraction?
- Voice notes vs text, and how many entries you had to correct by hand
- The most common *kind* of entry (money owed to them? their own debts? promises?). That's the product.
- Any entry involving money over KES 10,000 (do people trust a stranger with big amounts?)
