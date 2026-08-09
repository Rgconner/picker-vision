**Type:** LinkedIn article — published
**Status:** PUBLISHED
**URL:** https://www.linkedin.com/pulse/we-did-survive-contact-reality-russ-conner-n3yxc/
**Thread:** Standalone — cred-building, not CE series
**Observability Quadrant placement:** The Signal (upper-left) — Bob saw the risk, Russ didn't know the blast radius; the signal existed but wasn't acted on in time

---

### Post

I had another post planned for today. Needed some polish, but almost ready.

Then one of the tech sellers on my team got wind of my side project.

"Show me," she said.

Sure, why not?

---

3 cell phones scattered across the internet, with flight times we had not — could not — test in the lab. Just like a real warehouse with real scanners.

We came up against reality. We did not survive contact.

Two guests scanning simultaneously. A supervisor dashboard watching it all in real time. Right in the middle of it, both Guest phones locked up. Neither could advance. Orders crossed — two people on the same Redis channel, stepping on each other's scans.

We found the bug during the demo.

Here's the part I want to be honest about.

The day before, Claude flagged it in an independent code audit. Two Guest users on the same session ID — potential channel collision. Bob scanned the code, agreed with Claude, but couldn't be sure of the blast radius just from reading it. We carded it, put it in the hopper. We'd come back when we had time.

We ran out of time at the worst possible moment.

The old instinct: *it's only a demo, fix it later.* Ship the impression. Clean it up after the meeting.

We didn't do that — because we built the logging harness to reproduce it. Followed the flow from the logs to the data to the smoking gun.

Both phones getting `id: 'guest'`. Same channel. Each receiving the other's events. Four lines of code. `Guest-XXXX` random suffix. Channel collision gone.

Then we wrote a rule into the operating system:

> "It's only a demo" is not a scope reduction. Bugs found in demos get fixed or get a card. Demo code is production code. The wall does not care about the context in which it was built.

This is what AI under discipline looks like — including the parts where the discipline isn't perfect. Claude saw it. Bob rationalized it. The demo confirmed it. The fix took four lines. The lesson took a rule.

The demo doesn't get a pass. The meeting doesn't get a pass. The deadline doesn't get a pass.

The board always wins.

---

*[Screenshot: the Kanban cards. Caption: "99% done is not done. The gap can live in the 1%."]*

---

*Bob's Tiny Treasures is a live warehouse AI picking system — built in ~18 sessions on a K8s cluster running in my office. Every bug, every fix, every decision is on the board.*

---

### Publishing notes
- Hashtags go in the first comment, not the post body — so the post ends on "The board always wins."
- Hashtags: #IBMBob #HumanAICollaboration #Kanban #SoftwareEngineering #AI
- "OMS technical seller" stays generic — no name
- Tone: confessional-then-principled. Frank over polished.
- This is stage-setting, not CE series. Standalone.
