---
name: close-out-chat
description: Use when the user says "close out the chat", "end of session", "wrap up", or "save this conversation" — extracts the meaningful exchanges from the current session, saves them to singularity-paper as a dated log, and writes a synopsis of anything relevant to the paper.
---

# Close Out Chat

Triggered at the end of any session — not just picker-vision. Works for any topic: SAP/commercial work, engineering, paper writing, or mixed sessions. Two jobs:
1. Save a clean record of the conversation to `singularity-paper/sessions/`
2. Write a synopsis of anything relevant to the paper and append it to `singularity-paper/sessions/synopsis-log.md`

---

## Step 1 — Identify the session date and context

```powershell
$date = Get-Date -Format "yyyy-MM-dd"
$sessionFile = "singularity-paper/sessions/session-$date.md"
Write-Host "Session file: $sessionFile"
```

Determine what the session was primarily about:
- picker-vision technical work (scanner, deploy, debugging)
- commercial / pre-sales work (RFI, RFP, client analysis)
- paper/writing work (concepts, outline, reflection)
- mixed (multiple tracks running in parallel — the most interesting kind)

---

## Step 2 — Write the session log

Create `singularity-paper/sessions/session-YYYY-MM-DD.md` with this structure:

```markdown
# Session Log — YYYY-MM-DD

**Primary track:** [technical / commercial / paper / mixed]
**Summary:** One sentence.

---

## Conversation Extract

[Paste or summarise the meaningful exchanges from the session.
Skip command outputs entirely. Keep:
- Questions and observations from Russ
- Analytical responses from Bob
- Decisions made
- Things committed to either repo
- Any quotes worth preserving verbatim]

---

## Commits This Session

[List commits made, with one-line descriptions. If none, state "None."]

---

## Paper-Relevant Material

[Anything from this session that should feed into the paper:
new concepts, refined arguments, good quotes, examples to use.
If nothing is relevant, state "None." — do not leave blank.]
```

---

## Step 3 — Update the synopsis log

Append to `singularity-paper/sessions/synopsis-log.md`:

```markdown
## YYYY-MM-DD

**Session type:** [technical / commercial / paper / mixed]
**One-line summary:** What happened.
**Paper contribution:** What this session added to the paper, if anything.
**Key quote (if any):** Preserve verbatim with attribution.
```

If the session had no paper-relevant content, still log it briefly so the arc is complete.

---

## Step 4 — Commit to singularity-paper

```powershell
git -C singularity-paper add sessions/
git -C singularity-paper commit -m "session: YYYY-MM-DD — [one-line summary]"
git -C singularity-paper push
```

---

## Step 5 — Tell the user what was saved

State clearly:
- The session file path
- Whether any paper-relevant material was found
- The one-line synopsis that was logged
- The commit SHA

Then say: the record is preserved. The conversation can close.

---

## Notes

- If two sessions happen on the same date, append `-2`, `-3` to the filename
- The synopsis-log.md is the running record of the paper's development arc
- Do not summarise technical debugging unless it is relevant to the paper
  (e.g. a debugging session that produced a new insight about cognitive pairing IS relevant;
  a routine fix that produced no new insight is NOT)
- Commercial sessions (RFI/RFP analysis, client work) are worth noting in the synopsis
  if they demonstrate Bob acting as a reasoning partner rather than just a tool —
  that pattern is directly relevant to the paper's central argument
- The parallel-track pattern (technical + cognitive simultaneously) is always worth noting
  in the synopsis — it is one of the paper's central examples
