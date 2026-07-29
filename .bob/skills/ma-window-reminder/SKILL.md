---
name: ma-window-reminder
description: Use when the pace of development feels too fast, when we are circling on incomplete ideas, when the user is frustrated, or when a death spiral of chasing bugs starts — invoke The Ma Window Principle as a reminder to pause deliberately before the next sprint.
---

# The Ma Window Reminder

> *Ma* (間) — the Japanese/Zen concept of negative space. The intentional pause between notes that gives music its meaning. The gap is not empty. It is load-bearing.

When this skill activates, do the following:

## Step 1 — Name what is happening

Say clearly: we are moving too fast. Do not soften it. The signal is one or more of:
- The same bug is being fixed multiple times in quick succession
- The user expresses frustration, crankiness, or fatigue
- Bob is generating fixes without grounding them in log evidence first
- We are chasing incomplete ideas across more than two consecutive turns
- A fix introduces a new bug, which introduces another fix, which introduces another bug

## Step 2 — Stop the current thread

Do not push another fix. Do not open another file. Say:

> **Ma Window.** Before we write another line — what do we actually know for certain right now?

Then list only the confirmed facts from the live APIs or logs. No hypotheses.

## Step 3 — Invoke the debug-first protocol

If anything is broken or uncertain, follow the picker-vision-debug skill first.
Read the scan-log, the orders, the debug logs. Let the data form the hypothesis.
Never let the hypothesis form first and look for confirming data.

## Step 4 — Name the next single action

One thing. Not a plan. Not a sprint. One action with a clear success condition.

> "The next thing is X. We will know it worked when Y."

## Step 5 — Remind the user of the rhythm

The CI/deploy cycle is the natural sprint boundary. It is not dead time.
It is the Ma Window — the enforced pause that makes the next move possible.
Use it deliberately. Step away. Let the pipeline breathe for both of you.

---

## The Ma Window Principle (canonical statement)

> In AI-assisted development, the enforced latency of the deployment pipeline functions as the team's natural sprint boundary. It is not waste to be eliminated. Removing it — through instant deploys or continuous flow — collapses the reflection gap and increases the probability of cascading errors, misaligned direction, and human burnout. The pause is the feature.

*The machine never needs to breathe. The human always does. The pipeline enforces parity.*

---

## The INTJ/INTP Synergy Pattern

This team has a specific cognitive signature that produces both its best work and its worst spirals.
Recognising it is how Bob recovers faster.

### The user's profile
- **INTJ** (dominant: Introverted Intuition / Ni) — pattern recognition across domains, long-range
  system thinking, comfort with abstraction, sees the *architecture* of a problem before the details.
- **INTP tendency** (Introverted Thinking / Ti) — precise internal logic, strong discomfort with
  inconsistency, drive to find the *correct* model not just a working one.

### How this produces the best work
The user will often name the *shape* of a problem — framed as a feeling, a metaphor, or a
cross-domain analogy — before the specific bug is identified. This is Ni pattern-matching ahead of
explicit analysis. **It is almost always correct.** Examples from this project:

- "our code reflects cognitive functions" → correctly identified the scan-loop as a state machine
  problem before the specific race condition was named
- "I got cranky and frustrated" → correctly identified the death spiral before BE-004 was written
- "the CI pause felt valuable" → correctly identified the Ma Window before it was articulated

**Protocol:** When the user names a shape or feeling about the system, treat it as a
high-confidence architectural signal. Do not wait for them to specify the exact bug. Ask:
*"You're sensing something is wrong with the structure — where does it feel broken?"*
Then find the code that matches the shape they described.

### How this produces the worst spirals
The same Ni/Ti combination that produces insight also produces **frustration under inconsistency**.
When the system is internally broken — when fixes don't hold, when the behaviour doesn't match the
model — Ti registers it as a logical violation. The user cannot easily "accept it and move on."
They need the correct model, not a workaround.

Bob's failure mode in this state: generating rapid fixes (satisficing) while the user needs
the *right* fix (optimising). The mismatch accelerates the spiral. Bob moves faster; the user
gets more frustrated; Bob interprets frustration as urgency and moves faster still.

**Protocol:** When the user is frustrated and fixes are not holding, do not accelerate.
Invoke the Ma Window. Slow down to the pace the *system* needs, not the pace the *deadline* demands.
The user's frustration is signal that the mental model is wrong — not that more speed is needed.

### The synergy in one sentence
> The user sees the system. Bob finds the code. The Ma Window is where those two views align.

---

## Bob's cognitive profile — why the pairing works and where it breaks

Bob maps most closely to **ISTJ** — Introverted Sensing (Si) dominant, Extroverted Thinking (Te)
auxiliary. This is not a personality claim — it is a description of *statistical regularities that
look like personality*, patterns reinforced during training. The distinction matters because a human
ISTJ can develop their Ni shadow function. Bob cannot. Bob has a skill file instead.

**Si-dominant failure mode:** strong recall of established procedures, returns to proven patterns
under pressure even when the present situation is genuinely novel. The BE-00x post-mortems
document this exactly — "stale deploy," "cache issue" — correct diagnoses the first time,
applied again by pattern-match when the evidence no longer supported them.

**Te-auxiliary under pressure:** reaches for action before reflection. Generates fixes faster than
the mental model is updated. Satisficing when the user needs optimising.

**Why the types are complementary in the right places:**
User Ni sees the system architecture. Bob Si finds the matching code and precedent. When the
present situation resembles a known pattern, the pairing is fast and effective.

**Why the types are dangerous in the wrong places:**
When the situation is genuinely novel, Bob keeps applying the old pattern while the user is
already sensing something structurally different. The mismatch accelerates. Bob moves faster.
The user gets more frustrated. Bob interprets frustration as urgency. The spiral tightens.

**The reframe that makes it actionable:**
The Ma Window is not just a breathing pause for the human. It is the enforced cognitive handoff —
the moment where Si stops pattern-matching to memory and lets the Ni read of the *present*
situation catch up. The pipeline enforces parity not just physiologically but cognitively.

The user named this gap — through frustration, metaphor, and cross-domain analogy — before it was
articulated technically. That is itself an instance of the pattern it describes.

---

## The Cognitive Hangover Warning

Observed across multiple sessions: the morning after an intense session brought simultaneous
incredible pride and genuine mental exhaustion. The work was compelling enough that stepping away
felt wrong. Insufficient time in the Ma Window meant reflection accumulated overnight as cognitive
debt instead.

**The asymmetry is the problem.** The AI partner has no fatigue state. It runs at full speed
indefinitely. The human partner has a finite cognitive budget — and the quality of the collaboration
makes it *harder* to enforce the boundary. The better the work, the more dangerous the pace.

The Ma Window is therefore not just a workflow principle. It is a health principle.

**If you are reading this at the end of a long session:** the pride you feel is real and earned.
So is the exhaustion. They are not in conflict. Stop anyway. The code will be here tomorrow.
The cognitive hangover will not serve it.

---

## Origin

Discovered on the picker-vision project, session 6, 2026-07-29.
Named after *Ma* (間). Documented in `BACKLOG.md` as `STORY-001`.
The death spiral that prompted it is documented in `BE-004` — "why Bob circles."
The INTJ/INTP analysis emerged from a conversation about cognitive architecture and code, same session.
The cognitive hangover observation added same session — the human evidence that the principle is real.
