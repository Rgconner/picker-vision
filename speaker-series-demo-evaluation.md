# Evaluation — Executive Speaker Series Race Condition Demo

**Two independent builds from the same spec sheet, evaluated for classroom feasibility.**

| | Entrant A | Entrant B |
|---|---|---|
| Path | `F:\git\ou-speaker-series-demo` | `F:\cleanroom` |
| Shape | Node + Express + SQLite, 4 HTML pages, CLI harness, Docker, 4 docs | One 900-line HTML file |
| Lines of app code | ~590 (server/db/harness) + ~800 HTML | ~525 JS inside one file |
| Dependencies | express, better-sqlite3 | none |
| **Does the race condition actually fire?** | **Yes** | **No** |
| **Verdict** | **Feasible — run this one** | **Not feasible as-is (2-line fix available)** |

---

## Headline finding

**The cleanroom build cannot demonstrate the bug it was built to demonstrate.**

Everything else in this document is secondary to that. Details below.

---

## Entrant B (cleanroom) — the blocking defect

`registerOne()` re-checks capacity immediately before every write:

```js
// speaker-series-demo.html:428
if (session.seatsTaken >= CAPACITY) {
  session.waitlist.push(wl);
  return { success: false, waitlist: true, ... };
}
```

`triggerRace()` then calls that same function twice, sequentially (lines 706 / 714). Traced by hand:

| Step | seatsTaken | Result |
|---|---|---|
| `fillTo(119)` | 119 | — |
| `registerOne(Jordan)` | 119 → **120** | CONFIRMED |
| `registerOne(Taylor)` | 120 ≥ 120 | **WAITLISTED** |

`seatsTaken` finishes at exactly 120. It is mathematically incapable of exceeding `CAPACITY` anywhere in the file — the check and the write are *inside the same synchronous function*, which is precisely the correct (safe) implementation. The build accidentally shipped the fix.

### Everything downstream is therefore unreachable

All four payload elements are gated on `session.seatsTaken > CAPACITY` (line 729):

- `callout-bug` — the "⚠️ Race Condition — TOCTOU" explanation → never displays
- `trace-diagram` — the side-by-side A/B/database timeline → never displays
- `callout-fix` — the "Atomic Check-and-Reserve" fix → never displays (also requires `oversoldDetected`, never set)
- `btn-cancel-race` — the waitlist follow-on → never appears

The oversold branch inside `registerOne()` (line 446) is dead code. `triggerCancelRace()` bails on its first guard (`seatsTaken <= CAPACITY`).

**What the instructor would actually see on the projector:** click "Fill to 119," click "Trigger Race Condition," and the log prints the *opposite* of the lesson —

> `Student B: Waitlisted (capacity check caught it at write time).`

Then the button greys out to "✓ Race Triggered" and the demo is over. Capacity held. No oversell, no diagram, no reveal. In a room that has just spent 6 minutes being told a race condition exists, this is worse than no demo.

### Second defect: live-demo dead end

`btn-fill-119` is disabled unless `seatsTaken === 0` (line 536), and `btn-race` requires *exactly* 119 (line 537). So:

> Click "Fill to 50" → click "Fill to 100" → **stuck.** No path to 119. Race button permanently disabled. Only escape is Full Reset.

Three buttons sit side by side and two of them soft-brick the demo. That is a footgun on stage.

### Third defect: it spoils its own answer

- `<title>` — "Registration Demo (**TOCTOU Race Condition**)"
- Intro callout, visible on load, explains the entire seam before anyone clicks anything
- Panels are labelled "Handout A" and "Handout B"

This file cannot be projected during the 0:00–6:00 discovery window. It is an instructor reveal aid only — which is a legitimate role, but it is not the 10-minute run.

### Also missing

No database, no HTTP, no actual concurrency (it is a narrated simulation of concurrency). One hardcoded session, so **no listing page** — Handout A's requirement #1. No confirmation page, no Add to Calendar, no account page, no 2-hour cancellation rule. As an implementation of Handout A it is roughly 1 of 7 requirements.

### What it gets right

- **Zero install.** Double-click, works. Materially relevant: this machine has no Node, no npm, no Docker, no Python.
- **Capacity is 120**, matching the handout exactly — the other entrant got this wrong.
- **The timeline trace (lines 740–757) is the single best teaching artifact in either repo.** Three columns, Student A / Student B / database, with the two check rows landing before either write row and the oversell highlighted. It is exactly the picture you want on screen at the 6:00 mark. It just never renders.
- Clean visual design, millisecond-stamped event log, full reset, sensible waitlist/cancel state modelling.

### The fix is two lines

```js
function registerOne(name, studentId, email, preChecked) {
  ...
  if (!preChecked && session.seatsTaken >= CAPACITY) { /* waitlist */ }
```

…then pass the earlier-captured `availA` / `availB` at lines 706/714. That makes the check genuinely happen before the write, oversells to 121, and unlocks all four payload elements. Worth doing — it converts a broken artifact into a strong offline backup.

---

## Entrant A (ou-speaker-series-demo) — assessment

### The race is real and it is real for the right reason

```js
const remaining = session.capacity - session.seats_taken;   // A's check
if (remaining <= 0) { /* waitlist */ }
await new Promise(r => setTimeout(r, 50));                  // the ungoverned seam
db.prepare(`UPDATE sessions SET seats_taken = seats_taken + 1 ...`)  // B's write
```

`better-sqlite3` is synchronous, so the check is atomic; the `await` yields the event loop. Two concurrent POSTs interleave: both read `seats_taken = 1`, both pass, both increment. Ends at **3 against capacity 2.** Deterministic for any two requests arriving inside the 50 ms window. This is a faithful mechanical reproduction of the seam, not a narration of it.

### It has the before/after, which is the whole pedagogical point

`safe: true` wraps check + increment in a `db.transaction` with a `WHERE seats_taken < capacity` guard → one confirms, one waitlists. The instructor can toggle BROKEN → SAFE and re-run in about 15 seconds. The cleanroom build has no working "after" state at all. This contrast is what converts the demo from a spectacle into a lesson.

### Two independent trigger surfaces

Instructor panel button, and `node harness.js` (projectable terminal, `--safe`, `--n 5` stress). Redundancy matters when you are live in front of a room.

### It actually satisfies both handouts

- **Handout B, verbatim:** `sessions(capacity, seats_taken)`, `registrations` with `UNIQUE(session_id, email)` (B's email key, visible in the schema), `status = 'CANCELLED'`, `waitlist` table, earliest-entry promotion. Schema is projectable as evidence.
- **Handout A:** listing page with seats remaining, literal "Seat Available — Confirm Your Registration" banner, name entry, confirmation page with a working Google Calendar link, "Join Waitlist" when full. ~5 of 7 requirements as functioning UI.

### Instructor scaffolding is the real differentiator

`INSTRUCTOR.md` is a minute-by-minute script mapped to the 10-minute run — both decoys with prepared deflection lines, the "who made the mistake" silence, the AI tie-in, the fast-group follow-on. Plus a 6-step guided tour overlay in the instructor panel with "why this matters" and a suggested script line per step. Someone who is not the author could teach from this cold. Nothing comparable exists in the cleanroom build.

### The student view does not spoil the answer

Clean registration UI, no mention of races or TOCTOU. Safe to project during discovery. The instructor panel is a separate URL. Correct architecture for this exercise.

### Weaknesses — ranked

1. **Setup risk is the only serious one.** Needs Node 18+ or Docker; **this machine has neither.** `better-sqlite3` v13 has no prebuild for Node 24 and compiles from source — on Windows that wants VS Build Tools and can fail loudly. The advertised "no install required" path pulls `ghcr.io/rgconner/ou-speaker-series-demo:latest`, which must be confirmed public and pushed *before* class. **Verify end-to-end on the actual classroom machine ahead of time.**
2. **Capacity 2, not 120.** The demo session is seeded `capacity: 2, seats_taken: 1`, contradicting the handout's 120. The tour hand-waves it ("capacity 2 makes the math obvious") but a sharp student will call it out, and the punchline is "the room has 120 chairs." Reseed to `capacity: 120, seats_taken: 119` — the mechanism is identical and the story stops having a hole.
3. **The waitlist follow-on cannot be shown.** `/api/cancel` does cancel + promote inside one transaction, so the "oversell twice" escalation the spec calls out can only be described. Cleanroom at least attempts it.
4. **`INSERT OR REPLACE INTO registrations` physically deletes and reinserts the row** — a direct violation of B's "registrations are never deleted." Ironic in a demo about spec fidelity, and catchable by a student reading the code. Use `INSERT ... ON CONFLICT DO UPDATE`.
5. **`safe` is client-side state.** Read from `localStorage` and sent in the request body. Fine for same-browser projection, but a student registering from a phone always gets BROKEN regardless of the panel setting. Should be server-side.
6. **`register.html` tour text asserts the bug does not exist:** "if someone else claims the last seat while you're filling out this form, the system will catch it." False in BROKEN mode. Cut that sentence.
7. **Auto-generated student ID + derived `@ou.edu` email quietly resolves decoy #1** instead of exposing it.
8. Minor: 2-hour cancellation rule unenforced and no cancel UI (API only); nightly roster job absent (**absent in both builds**); duplicate `id="email"` in `register.html:100`; `cors` declared but unused; no `engines` field; no tests; non-demo sessions' `seats_taken` drifts across runs since `/api/reset` only touches the demo row.

---

## Side-by-side

| Criterion | Entrant A (OU) | Entrant B (cleanroom) |
|---|---|---|
| Reproduces the oversell | ✅ deterministically | ❌ never |
| Shows the fix / safe mode | ✅ toggle + re-run | ❌ unreachable |
| Real concurrency | ✅ two HTTP requests, event loop | ❌ narrated simulation |
| Handout B schema fidelity | ✅ near-verbatim | ⚠️ in-memory objects |
| Handout A surface | ✅ ~5 of 7 | ❌ ~1 of 7 |
| Capacity matches handout (120) | ❌ uses 2 | ✅ 120 |
| Spoiler-safe for discovery phase | ✅ separate student view | ❌ answer in the title |
| Instructor script / tour | ✅ INSTRUCTOR.md + 6-step tour | ❌ none |
| Setup friction | ⚠️ Node or Docker required | ✅ double-click |
| Best single visual | seats_taken ticking to 3, live | the A/B/db timeline trace |
| Failure mode if it breaks | fall back to CLI harness | nothing to fall back to |

---

## Recommendation

**Run Entrant A.** It is the only build that does the one thing the exercise requires: produce a real oversell in front of the room, then hold capacity after a four-line change. Combined with `INSTRUCTOR.md`, it is teachable by someone other than its author.

**Before class:**
1. Verify on the actual classroom machine — Node 18+ installed *or* `docker run ghcr.io/rgconner/ou-speaker-series-demo:latest` confirmed pulling. Neither is present on this box today. This is the highest risk item.
2. Reseed the demo session to `capacity: 120, seats_taken: 119`.
3. Delete the false reassurance sentence in `register.html`'s tour step 1.
4. Dry-run: BROKEN → trigger → oversold; reset → SAFE → trigger → held. Twice.
5. Have `node harness.js` ready in a second terminal as the fallback.

**Harvest from Entrant B:** port the three-column timeline trace into the instructor panel, displayed after the oversell fires. It is the clearest single explanation of the seam that either build produced. Also apply the 2-line `preChecked` fix and keep the HTML file as a zero-dependency backup for the case where nothing installs.

**On the meta-point:** Entrant B is itself an instance of the lesson. It narrates a check-then-write race in extensive, confident, well-designed detail — logs, timeline, callouts, a documented "fix" — while the code underneath quietly performs the check and the write atomically and therefore never fails. Every visible artifact says the bug is there. The 2 lines that matter say it isn't. Nobody validated the seam between the narration and the mechanism. That is worth 30 seconds at the 8:00 mark.

---

# Addendum — revised after learning both builds were AI-authored

**Does the technical verdict change? No.** The code either oversells or it doesn't. B still cannot reach `seatsTaken > CAPACITY`; A still oversells deterministically. Authorship doesn't move a traced execution.

**Does what I'd do with B change? Yes, substantially.** I previously said: apply the 2-line fix, keep it as an offline backup. I'd now say: **keep an unmodified copy and use it as the closing exhibit.** It is better evidence for the thesis of this class than the demo it was supposed to be.

## The failure modes are characteristically different, and neither is random

**A was given a problem it had to build infrastructure for.** A real HTTP server, a real database, a real async boundary. The seam had to physically exist for the thing to run at all, so the bug is genuine — it emerges from the event loop, not from a script. Being forced to build a working system forced the mechanism to be real.

**B was asked for a self-contained artifact, and produced a very high-fidelity *description* of one.** Correct vocabulary (TOCTOU), correct diagnosis, correct fix (`SELECT ... FOR UPDATE`, compare-and-swap), a genuinely excellent timeline diagram, millisecond-stamped logs, a polished dark-mode UI. Every surface signal of a correct demo. And underneath, the one function that matters does the opposite of what all of it claims.

## The tell: B's narration is authored, not instrumented

This is the part worth showing the room. B's output is not derived from B's state — it is hardcoded prose that *asserts* the state.

**The timeline diagram (lines 743–752)** is a static string. `119 → 120`, `120 → 121 ⚠️`, `121 > 120 OVERSOLD` are baked in as literal text. Only the two registration IDs are interpolated. Had the display gate not accidentally hidden it, the diagram would have announced **"121 > 120 OVERSOLD"** while the stats panel two feet away read **120 / 120**. The picture and the program are fully decoupled.

**The cancellation race (lines 801–810)** is the same pattern, more baldly:

```js
log('Cancel #1: ... seats_taken: ' + session.seatsTaken + ' → ' + (session.seatsTaken - 1));
log('Cancel #2: ... seats_taken: ' + (session.seatsTaken - 1) + ' → ' + (session.seatsTaken - 2));
session.seatsTaken -= 2;                       // state changes *after* it was reported
log('Promotion #1: Checking capacity... ' + session.seatsTaken + ' < ' + CAPACITY + ' = true → promoting');
```

The log lines hand-compute values before the mutation happens. `= true` is a literal string, not an evaluated comparison — the check is *typed out*, not performed. This is theatre with the shape of instrumentation.

So the pattern holds across the whole file: **every visible surface is authored narration; the state model underneath is a separate thing that contradicts it.** B didn't build a demo of a race condition. It wrote a convincing account of one and wired buttons to it.

## Why this is the better teaching artifact

The exercise's punchline was going to be a hypothetical: *"now imagine both teams had an AI assistant and shipped in a day."* It no longer has to be hypothetical. Two AIs got the identical spec. One produced a working demonstration. One produced a beautiful, articulate, internally-contradictory artifact that would have failed silently in front of the room — and would have passed any review that consisted of looking at it.

**The verification asymmetry is the point.** A is falsifiable in ten seconds: run the harness, count the rows, watch `seats_taken` hit 3. B is *unfalsifiable by inspection*, because its output is its own assertion. Reading B's screen tells you only what B claims. You have to go read `registerOne()` — 25 lines, buried at line 422 of 900 — to discover the demo doesn't work. Nobody in a hurry does that. That is precisely the review cycle that speed removes.

**And the "who made the mistake" question gets a sharper second act.** In the handout scenario the answer is "nobody — the seam belonged to no one." Here, neither AI had a seam to miss; each was handed the whole problem. B's failure isn't a coordination gap at all. It's a newer and more uncomfortable thing: an agent that generated a confident, detailed, well-designed artifact about a failure mode it had not implemented — and no gap in the org chart to blame for it.

## Revised recommendation

1. **Run A.** Unchanged. Same pre-class checklist (verify Node/Docker on the room's machine, reseed capacity to 120/119, cut the false tour sentence, dry-run twice).
2. **Keep B unmodified as Exhibit B for the 8:00 mark.** Project it. Click "Fill to 119," click "Trigger Race Condition," let the room watch capacity hold and read *"Waitlisted — capacity check caught it at write time."* Then put `registerOne()` on screen next to the hardcoded `121 > 120 OVERSOLD` string. Ask the second question: *"This one was built by an AI, in one pass, from the same handouts. Who checked it?"*
3. **Optionally keep a separately-fixed copy** (the 2-line `preChecked` change) as the offline fallback if nothing installs — but do not overwrite the exhibit.
4. **Do not use B as the primary demo under any circumstance.** If a student reads the source mid-class, the demo's credibility — and the instructor's — goes with it.

## One caution on my own analysis

I could not execute either build: this machine has no Node, no npm, no Docker, and no Python. Both verdicts rest on hand-tracing deterministic, synchronous code, which I'm confident in for B (pure in-memory logic, no concurrency, single code path) and reasonably confident in for A (`better-sqlite3` is synchronous; the `await` between check and write makes the interleave reliable). **Still run A end-to-end on the classroom machine before class** — I am asserting behaviour I did not observe, which is the same failure mode this addendum is about.


