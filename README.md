# Ahadi: concierge test tool

Operator tool for running the "promises & debts assistant" experiment by hand. Read **PROTOCOL.md** first.

```bash
npm install
npm.cmd start        # PowerShell: use npm.cmd; Git Bash/cmd: npm start   → http://localhost:3100
npm.cmd test         # 23 self-checks for validation, the scorecard verdict and reminders
```

- **With `ANTHROPIC_API_KEY` set:** pasted messages are turned into *proposed* ledger entries (Swahili/Sheng/English) that you confirm, and questions are answered from the participant's ledger. Model output is validated like manual input. Override the model with `AHADI_MODEL`.
- **Without a key:** everything works in manual mode (you type the entries; questions use keyword search).
- Data lives in `data/ahadi.json` (gitignored: it contains other people's private information). The server listens on localhost only.
- Scorecard thresholds live in `src/metrics.ts` and are mirrored in PROTOCOL.md; change both together, and before the test starts.
