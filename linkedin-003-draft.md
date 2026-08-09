**Type:** LinkedIn article — standalone, accessibility play
**Status:** Draft — ready for review
**Thread:** Standalone — broadens the audience beyond technical readers
**Issue:** #143 LINKEDIN-003

---

### Article

**Kanban for the Everyman**

This is the third in an ongoing theme.

The first was about a spontaneous live demo that nobody planned. A meeting invite at 11AM, a live demo by 2PM. Nobody asked for it. Nobody expected it. It happened anyway, and it worked, but not because we could see it coming. Neither of us saw it coming. That is a lower-left story (the unknown unknowns), and the outcome was fortunate, not designed.

The second was about a bug we found during the demo itself. Two guests on the same Redis channel, orders crossed, both phones locked up. The bug was flagged the day before. Bob saw the risk. I didn't know the blast radius. We carded it, put it in the hopper, ran out of time at the worst possible moment. That is an upper-left story: the signal existed, Bob had it, and we didn't act on it in time.

Two stories. Two different quadrants. The same question underneath.

What can you see? What can Bob see? What can neither of you see yet? And what happens when the gap between those things goes unmanaged?

I have been thinking about that gap. I have been thinking about what it is, what it costs, and whether there is a way to name it clearly enough to do something about it.

This is that article.

---

Everyone has a grocery list.

And everyone has gotten to the store, list in hand, and discovered the list was wrong.

You needed the thing you already had two of. You forgot the one thing you actually went for. You grabbed everything in no particular order, walked the store twice, and got home to find you still need to go back because you forgot the cream cheese.

The list was there. The list was useless.

---

I spent years in enterprise technology, and along the way I started using something called a Kanban board to manage the team's work. It wasn't my choice. My team leads, a designer and a master coder, beat it into me. Because to lead I needed it, even if I didn't think I needed it. But I could not argue the results. So I embraced it.

Kanban is a Japanese word meaning "signboard," a visual signal. Cards. Columns. Things to do, things in progress, things done. Simple enough that it sounds like a kindergarten art project. Sophisticated enough that Toyota built an entire manufacturing system around it. So relevant it is the paradigm for GitHub Projects.

I used it for software. I used it for client engagements. I used it for the complex, multi-threaded, never-fully-done work that doesn't fit in a task list app and doesn't fit in your head.

It helped. But it still had the grocery list problem.

The board knew what was on the cards. It didn't know why. It didn't know what was already in the fridge.

---

A couple of months ago, I started working with an AI assistant. Not for writing emails. Not for summarizing documents. As a genuine collaborator: planning, building, deciding, day after day.

And I kept the Kanban board. Just like before, it provided me clarity and direction. I knew that. But what I didn't know was Bob needed it too, for a different reason.

Here is what changed.

By design, the AI holds context only in the current session. Token length is a hard limit of the technology. As shipped, the problem is not addressed. RAG is one option, but the Kanban system is another path. Not perfect, not magic, but enough. When I open a card that says "fix the login timeout," Bob doesn't just see the card. He sees the board. He sees the shared history recorded on the board. Every decision we made, every constraint we hit, every tradeoff we chose since the last time we touched that thread. The card is the title. The context is the book. It is a unit of currency, its value determined by the knowledge encoded in it, one that both human and AI can exchange, establishing the value, recognizing the value.

That is the thing the grocery list cannot do.

A grocery list tells you to buy cream cheese. It does not remember that you're out because you made a bagel brunch three weeks ago, that you bought the store brand last time and your family made a face, and that the block near the deli counter is half the price of the one in the dairy aisle. The list doesn't know any of that. You know it. And you have to hold it in your head, along with everything else.

Bob holds it. Bob carries the load. Bob runs the board.

That's the difference.

---

But here is the part that took me longer to see.

There are actually four versions of this problem, and they are not equal.

There is the stuff we both know. The card. The explicit instruction. The thing written down and shared. That is the easy case: when both you and your system have the same picture, the work flows.

The fridge problem: The stuff you know that your system doesn't. What's in the fridge. What happened last Tuesday. Why you made that call six weeks ago. The fridge is real. It requires hands to open and eyes to see, possibly a nose to tell you the milk has turned. You have to show up. You have to look. Nobody can do that for you. The Kanban board fixes this: writing a card makes the invisible visible.

The signal: The stuff your system can see that you haven't noticed yet. The pattern in the work. The thread that keeps coming back. The dependency you haven't named. The signal is like a radio wave, undetectable, pulsing in a sea of chaos, present whether you're listening or not. To catch it you have to see the pattern in the noise. That is what humans are good at perceiving. It is what AI is good at exposing. Bob has been watching the whole board. You have been living inside one card at a time. That asymmetry is useful, if you let it be.

And then there is the fourth case. The things neither of you can see yet. The unknown unknowns. The bug that isn't on anyone's radar. The assumption baked so deep into the plan that nobody thought to question it. The thing you won't know is missing until you get to the store.

This is where projects die. Here be dragons.

I call this the Observability Quadrant. Four squares. Performance gradient from lower-left to upper-right: least visible to most. The goal of the system is not to be productive. The goal is to move everything toward upper-right, where both you and your system have the same picture, and to shrink the lower-left, where neither of you can see what's coming.

The grocery list problem is not a productivity problem. It is an observability problem.

---

The wrong order matters too.

A grocery list written in the order you remember things is a terrible guide for actually walking a store. Produce first, then bakery, then dairy, circle back for the one thing you can't find, and you've covered the store three times while your ice cream is melting.

Kanban does priority. Cards move. What matters most sits at the top. When a new thing comes in that is more urgent than what you were doing, you don't carry it in your head hoping to remember it later. You put it on the board, in the right position, and the board handles the coordination.

I'm not describing software development anymore. I'm describing a Tuesday.

---

There is a thing that happens when a project gets complicated enough. The coordination overhead starts to cost more than the work itself.

You spend twenty minutes figuring out where you left off. You spend another twenty figuring out what to tackle next. You do the wrong thing with full effort, at the wrong time, and it doesn't matter that you worked hard. The order was wrong and the context was missing and you have to go back to the store.

That is not a productivity problem. That is an observability problem.

The Kanban board is a system. Bob is the context layer the board was always missing. The board is the memory that AI was always missing. Together, they move you toward upper-right. They make the invisible visible. They surface the pattern before it becomes the problem.

They let you show up and work, instead of showing up and figuring out where you are.

---

I am not a system designer. I am not describing a methodology. I am describing the thing I wish I'd had ten years ago when I was managing a client engagement out of a spreadsheet and a prayer.

The spreadsheet knew what was on the list. It did not know what was in the fridge. And it had no idea what neither of us could see yet.

If you have ever gotten to the store and discovered the list was wrong, you already understand the Observability Quadrant. You have lived in lower-left. You know what it costs.

The sophisticated parts are invisible. The value is immediate. The next time you get to the store and realize the list is wrong, you will know which quadrant you are in. The goal is to spend less time there.

---

*The Observability Quadrant is a framework for understanding visibility gaps in human-AI work. The first two articles in this series are already on the map: one in the lower-left, one in the upper-left, both about what happens when the gap goes unmanaged. The map is still being drawn. Ideas that need a home. These articles are how I draw it.*

*[Article 1: One domain expert, one AI, one deliverable the client didn't expect](https://www.linkedin.com/pulse/one-domain-expert-ai-deliverable-client-didnt-expect-made-russ-conner-9bpgc/)*
*[Article 2: We did not survive contact with reality](https://www.linkedin.com/pulse/we-did-survive-contact-reality-russ-conner-n3yxc/)*

*Bob's Tiny Treasures is a live warehouse AI picking system built in my home office. Every card, every decision, every mistake is on the board. The board always wins.*

---

### Publishing notes
- LinkedIn article format (longer-form, not a standard post)
- No Tuckman. No compression ratios. One story, one frame, one invitation.
- Word count: approximately 900 words
- Hashtags in first comment: #Kanban #IBMBob #HumanAI #PairProgramming #ObservabilityQuadrant
- Add #ObservabilityQuadrant to hashtags — this is the coining post
- Closing line: "The sophisticated parts are invisible. The value is immediate."
- "Bob holds it" is the hinge. "The Observability Quadrant" is the payoff.
- Attach the Observability Quadrant map image when publishing — this article is the anchor dot
- The BTT tagline is optional — remove if publishing as a pure everyman piece
- LINKEDIN-003 is dot 1 on the map. Place it at upper-right (the map key, full visibility)
