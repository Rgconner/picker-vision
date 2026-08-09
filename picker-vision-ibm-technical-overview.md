# Picker Vision — IBM Technical Overview

> Internal innovation artifact. Operationally real, architecturally serious, not yet claiming enterprise production completeness.

## Abstract

Picker Vision is a full-stack warehouse pick-assist and pack-verification platform developed as an internal innovation artifact and case study in AI-assisted delivery. Its technical significance is twofold: first, it is a credible event-driven application with real operational flows, real deployment concerns, real hardware validation, and a clean enterprise evolution path; second, it demonstrates that a non-coder domain expert, paired closely with AI, can originate software that a senior IBM engineer can inspect and recognize as structurally legitimate.

The system should be understood as a serious prototype with production-grade architectural instincts rather than as a finished enterprise product. It has already proven real workflow correctness in hardware-backed demo operation. Its next-stage evolution is not about rescuing an overloaded design, but about hardening reliability, resilience, recoverability, enterprise integration, and deployment posture.

## 1. Executive Summary

Picker Vision is a real-time pick-assist and pack-verification system built to show that a human domain expert working with AI can produce a production-grade internal innovation artifact without a traditional handoff-heavy software lifecycle.

For the expected workload, database throughput is not the limiting factor. Any enterprise-grade transactional database would be more than sufficient. The case for PostgreSQL is not raw scan-rate pressure; it is reliability, recovery, resilience, operational standardization, and alignment with enterprise deployment patterns.

At runtime, the system combines:

- mobile and camera-based barcode detection
- order-aware validation and pick confirmation
- event-driven state propagation through Redis and WebSockets
- supervisor and picker user interfaces
- demo-shop flows that make warehouse operations visible, testable, and explainable
- a back-end service boundary that now assumes **PostgreSQL** as the system-of-record database

The importance of this artifact is not only what it does, but how it was produced.

This system demonstrates that a non-coder human with deep domain context can, with AI as an implementation partner, drive the creation of a serious full-stack application that an IBM senior programmer can inspect and recognize as legitimate engineering rather than a toy prototype. The result is not “AI replacing engineering.” The result is domain expertise expressing itself directly in software through an AI-mediated build loop.

This document is written for IBM senior programmers, architects, and technical leaders who need to understand:

- what the system is
- how the runtime architecture works
- what user and system flows are implemented
- what has been validated on real hardware
- what remains deliberately out of scope or deferred
- why this matters as a model for AI-assisted internal delivery

---

## Executive Highlights

| Topic | Summary |
|---|---|
| What it is | Event-driven pick-assist and pack-verification system with mobile scanning, supervisor control, Redis/WebSocket state propagation, and transactional workflow management |
| Why it matters | Demonstrates that domain expertise plus AI can produce a technically credible full-stack application without the usual translation loss of handoff-heavy delivery |
| Persistence posture | Any enterprise-grade transactional database is sufficient for expected load; PostgreSQL is preferred for reliability, recovery, resilience, and enterprise deployment alignment |
| Real proof | End-to-end pick flow and pick-to-pack flow validated on real hardware; synthetic multi-picker load and assertion tooling also implemented |
| Architectural character | Multi-service, event-driven, operationally informed, and explicitly shaped by runtime debugging rather than post hoc theory |
| Correct framing | Internal innovation artifact and proof-of-capability, not yet claiming full enterprise-production completeness |

---

## 2. Why This Matters

### 2.1 Business and technical significance

Picker Vision is a concrete answer to a useful internal question:

**Can a human with real operational intuition, but without conventional coding ability, collaborate with AI to create a technically credible software system that solves a real workflow problem?**

The answer here is yes.

This matters because the bottleneck in enterprise software is often not raw coding capacity. It is translation loss:

- the operator explains the problem to the business analyst
- the analyst explains it to the architect
- the architect explains it to developers
- the resulting software partially reflects the original need

Picker Vision collapses that chain. The human contributor supplied the warehouse logic, demo logic, edge cases, sign-off criteria, and acceptance judgment directly. AI supplied implementation speed, cross-stack execution, refactoring capacity, documentation, and iteration throughput.

### 2.2 What this artifact proves

This system demonstrates all of the following in one connected artifact:

- serious multi-service application structure
- event-driven runtime behavior
- mobile and browser UX
- stateful order workflow management
- infrastructure and deployment concerns
- real operational debugging on hardware
- regression instrumentation and synthetic load generation
- documentation sufficient for technical inspection

That combination is the point. The value is not a single clever feature. The value is the emergence of a coherent software system from a human+AI pairing where the human was not a conventional programmer.

---

## 3. Scope and Positioning

Picker Vision should be understood as an **internal innovation artifact** with real runtime behavior and verified operational flows.

### 3.1 What it is

- a full-stack warehouse pick-assist platform
- a demonstration environment for Bob's Tiny Treasures
- an event-driven mobile picking workflow
- a pack-and-verify workflow for downstream validation
- a testbed for AI-assisted delivery methods

### 3.2 What it is not claiming

This document does **not** claim that Picker Vision is already complete enterprise product software. It does not claim:

- full enterprise security hardening
- finished ERP integration
- full-scale production operations governance
- exhaustive device certification
- final multi-layer and multi-tote validation across all physical permutations

The correct framing is:

**architecturally serious, operationally real, internally credible, and intentionally limited where enterprise hardening would normally follow.**

### 3.3 Database posture

This document assumes the back end has completed migration to **PostgreSQL as system of record**.

That should not be read as an admission that the prototype persistence model was incapable of handling store-scale load. The workload math discussed during the architecture review points the other way: spread across roughly 1,000 stores, expected per-store scan volume is modest. The persistence decision is therefore driven by enterprise-operability requirements, not by scan-rate pressure.

SQLite remains relevant as the original prototype-stage persistence model that allowed rapid early development and local iteration. It was a reasonable early-stage choice for a self-contained demo stack. PostgreSQL is the better long-term enterprise choice because it provides the reliability, recovery, resilience, operational consistency, and deployment alignment expected in broader IBM and customer environments.

Architecturally, the system should now be read as:

- PostgreSQL = durable transactional data store for orders, products, pack state, and related workflow entities
- Redis = ephemeral shared state, coordination, and pub/sub transport

---

## 4. System Overview

Picker Vision supports a warehouse-inspired operational loop:

1. a picker starts or resumes a demo session
2. the mobile client scans product and staging codes
3. detections are posted into the platform
4. server-side services enrich and validate the event stream against active order state
5. the picker confirms picks through guided UI gates
6. supervisors see live state in parallel
7. completed picks transition into pack-and-verify flow
8. the system records, propagates, and visualizes state transitions in near real time

The same platform also supports:

- demo control and reset flows
- supervisor visibility across active sessions
- synthetic swarm testing through the Load Generator
- regression assertions against server-side telemetry

---

## 5. Architecture Overview

### 5.1 High-level logical architecture

```text
Mobile Picker / Browser Clients / Load Generator
                  |
                  v
             API Gateway
          /       |       \
         v        v        v
 Order Service  Event Processor  WebSocket Hub
      |              |               |
      v              v               v
 PostgreSQL       Redis Pub/Sub   WebSocket clients
```

### 5.2 Major subsystems

| Subsystem | Role in the architecture |
|---|---|
| Mobile client | Performs scanning, shows pick workflow, receives live state, drives picker actions |
| Supervisor UI | Controls demo sessions, observes state, runs load generation and regression checks |
| API Gateway | Single front door for browsers and device-like clients; routes workflow operations and aggregates internal APIs |
| Order Service | Owns transactional workflow state, order progression, packing state, and demo-session business logic |
| Event Processor | Interprets incoming detection events in workflow context and produces enriched operational state |
| WebSocket Hub | Pushes real-time state to connected clients |
| PostgreSQL | Durable source of truth |
| Redis | Shared ephemeral state, pub/sub, short-lived operational coordination |

### 5.3 Architectural style

The system is not a monolith with incidental AJAX updates. It is a deliberately split event-driven application with clear responsibility boundaries:

- transactional state and business transitions belong in the Order Service
- event interpretation belongs in the Event Processor
- fan-out to live clients belongs in the WebSocket Hub
- entry-point simplification and API mediation belong in the Gateway
- human interaction belongs in the browser clients

That separation is one reason the artifact reads as credible engineering.

### 5.4 Scale interpretation

One of the more important architectural conclusions from the project work is that **throughput is not the hard part at store level**.

Using the retailer thought experiment captured during the architecture discussion — `$2.8B` annual sales, `25%` online mix, `$50` average item value, and roughly `1,000` stores — the implied online workload is about `$700M` in online revenue, about `14M` items per year, about `38,000` items per day aggregate, and about `38` items per store per day if distributed evenly. Even allowing for peak skew, that is not a rate that stresses a competent transactional database.

The architectural problem is therefore not "can a database ingest the writes." The architectural problem is:

- topology: centralized vs regional vs edge deployment
- reliability and recovery across real environments
- resilience to restarts and partial failures
- multi-tenant isolation where applicable
- live session coordination and UI correctness
- enterprise integration and fleet management

That distinction is important for the case study because it shows the design decisions were not driven by fake scale panic. They were driven by the real engineering concerns that appear once workflow logic leaves the whiteboard and enters operation.

### 5.5 Key architectural decisions

| Decision | Why it matters |
|---|---|
| `BarcodeDetector` primary with ZXing fallback | Preserves best path for modern Android devices while retaining compatibility fallback for browsers and devices without consistent native behavior |
| Full format list passed to `BarcodeDetector` | Avoids a previously observed regression where narrowing formats broke QR detection |
| QR for on-screen codes rather than Data Matrix | Aligns with actual Samsung device behavior and reduces presentation-path incompatibility |
| Per-value debounce in scanning pipeline | Prevents simultaneous codes from incorrectly suppressing one another |
| End-of-order gate before `demo/advance` | Gives the picker explicit control over readiness and creates a clean transition into packing |
| No mid-pick tray verification in phase 1 | Keeps the pick loop continuous and pushes downstream validation into the PackWizard where it belongs |
| `demo_reset` propagation through Redis/WebSocket | Makes reset semantics explicit across live clients instead of assuming infrastructure restarts are invisible |
| Redis for transient coordination, PostgreSQL for durable truth | Separates high-churn event state from transactional system-of-record data |
| Built-in load generator and assertion path | Proves the architecture can be exercised and inspected using the same API surface as live clients |

---

## 6. Runtime Components

### 6.1 Mobile picker client

The mobile picker client is the operational front end for the person doing the work.

Core responsibilities:

- camera access and scan loop management
- barcode detection using `BarcodeDetector` as primary path with ZXing fallback
- scan coalescing and event submission
- order display and pick guidance
- confirmation gating to avoid accidental repeated picks
- reception of live workflow state over WebSocket
- pack workflow entry when pick phase is complete

Important runtime decisions captured in the project context include:

- `BarcodeDetector` primary, ZXing fallback
- full format list for `BarcodeDetector`; narrowing formats previously broke QR detection
- QR codes for on-screen codes rather than Data Matrix for Samsung compatibility
- per-value debounce to handle simultaneous codes correctly
- explicit end-of-order gating before `demo/advance`
- no mid-pick tray verification in phase 1; continuous blind pick flow first, pack verification second

### 6.2 Supervisor UI

The supervisor experience is not just a dashboard. It is an operational control plane for demo-scale orchestration.

Capabilities include:

- monitor active sessions and picker state
- start, stop, and reset demo behavior
- inspect remaining quantities and order progression
- use the Load Generator to simulate picker swarms
- run regression assertions against server-observed state

### 6.3 API Gateway

The Gateway provides the coherent external surface of the platform.

Responsibilities include:

- request entry point for browser and device clients
- proxying workflow calls to internal services
- picker registration and liveness management
- telemetry aggregation endpoints
- operational helper endpoints such as load-generation assertion support
- publication of demo reset events into the real-time channel path
- operational telemetry and assertion surfaces used by the supervisor and load-generation path

This layer is important because it keeps clients simple while preserving service separation behind the gateway boundary.

### 6.4 Order Service

The Order Service is the transactional heart of the application.

Responsibilities include:

- order retrieval and mutation
- pick confirmation and line-level progress tracking
- demo session lifecycle management
- pack initiation and pack progression
- persistence of workflow entities in PostgreSQL
- adapter-oriented boundary for future external back-end integration

Architecturally, this is where business truth lives.

### 6.5 Event Processor

The Event Processor turns raw detection traffic into workflow-aware operational state.

Responsibilities include:

- accept and interpret scan events in order context
- classify detections as correct, wrong, expected, unexpected, or staging-related
- detect completion conditions
- maintain enriched transient state
- publish operational updates into Redis for downstream fan-out

This separation matters because raw sensor input is not business meaning. The Event Processor is where the system converts one into the other.

### 6.6 WebSocket Hub

The WebSocket Hub maintains the live feel of the system.

Responsibilities include:

- subscribe to Redis pub/sub channels
- fan out state transitions to connected clients
- keep picker and supervisor views synchronized
- reduce polling and latency in workflow UIs

### 6.7 PostgreSQL and Redis

The data architecture is intentionally split.

| Store | Purpose |
|---|---|
| PostgreSQL | durable system-of-record data: orders, lines, products, pack state, workflow history |
| Redis | ephemeral coordination data: pub/sub events, liveness, cached session state, transient ledgers |

This is the correct architectural split for the problem being solved.

It also reflects a load-bearing architectural lesson from the project: once the problem is understood correctly, the durable data store choice is primarily about enterprise reliability characteristics, while Redis handles the transient high-churn coordination path. That is a cleaner separation than trying to force one store to act as both transactional truth and real-time event bus.

---

## 7. Core Operational Flows

### 7.1 Demo session start and assignment flow

Purpose: establish a picker session and attach work to it.

Nominal flow:

1. picker registers with the platform
2. session starts in personal or presentation mode
3. order-service selects or creates the active demo order context
4. picker receives active order state
5. supervisor view reflects the new session

Why it matters:

- establishes who is working
- binds scan interpretation to an active order
- creates the basis for traceable workflow progression

### 7.2 Pick flow

Purpose: guide a picker from scan to confirmed pick without silent misclassification.

Nominal flow:

1. mobile client scans product barcode
2. detection event is sent through gateway
3. event processor enriches against active order context
4. client receives updated state
5. if correct, confirmation UI appears
6. picker confirms
7. line quantity is updated in the transactional store
8. UI advances to the next required item or holds on multi-quantity logic

Important design characteristics:

- wrong scans remain visible as wrong rather than silently ignored
- confirmation is explicit, not inferred from scan alone
- multi-quantity orders provide progress-aware feedback such as first-of-many and last-item states
- scan loop behavior is controlled so repeated in-frame detections do not accidentally double-pick

### 7.3 End-of-order gate and advance flow

Purpose: avoid uncontrolled automatic order advancement and give the picker operational agency.

Nominal flow:

1. final required pick is confirmed
2. picker sees an order-complete gate
3. picker chooses whether to proceed
4. on acceptance, client calls `demo/advance`
5. next order becomes active

This was an important architectural correction. It prevents hidden state transitions and creates a natural handoff point to packing. It is also a good example of the human+AI method at its best: the correction did not emerge from abstract framework doctrine, but from observed operator friction during real walkthroughs.

### 7.4 Pack-and-verify flow

Purpose: validate downstream handling after picking is complete.

Nominal flow:

1. pick flow completes
2. PackWizard opens automatically or becomes available from the end-of-order transition
3. picker reviews tote and layer assignments
4. each layer is verified explicitly
5. order is marked packed when pack verification is complete

Current validated posture:

- pack flow has been exercised successfully in single-layer scenarios on real hardware
- multi-layer and multi-tote permutations remain a clearly named deferred validation area rather than a hidden assumption

### 7.5 Supervisor stop and reset flow

Purpose: let the system be safely stopped or reset during demos and testing.

Nominal flow:

1. supervisor invokes stop or reset
2. gateway routes to service logic
3. active sessions are cleared
4. orphan-sensitive state is cancelled where applicable
5. `demo_reset` is published to picker channels
6. mobile clients stop scanning and present a session-ended state

This flow is important because demo environments are vulnerable to partial state loss during restarts. The system evolved explicit behavior for that scenario rather than leaving it undefined. Recorded decisions such as publishing `demo_reset` to all picker channels and cancelling orphan-sensitive state on stop are load-bearing evidence that the architecture was being refined against runtime failure modes, not just feature checklists.

### 7.6 Load generation and automated regression flow

Purpose: validate system behavior under synthetic but realistic picker traffic.

Nominal flow:

1. supervisor opens Load Gen tab
2. N simulated pickers are created in-browser
3. each simulated picker registers, opens WebSocket, starts demo work, emits realistic scan traffic, and confirms picks
4. server telemetry and client-side metrics are compared
5. assertion endpoint verifies expected event-processing behavior

This is a significant architectural signal. The system does not only run demos; it includes a built-in operational test harness that exercises the same API surface as live clients.

---

## 8. State and Data Model Perspective

### 8.1 Core business entities

At a conceptual level, the system revolves around these entities:

- picker
- session
- order
- order line
- product
- staging location or tote
- pack container and pack layer
- detection event
- pick confirmation
- workflow state transition

### 8.2 Durable vs transient state

The architectural distinction is important.

**Durable state in PostgreSQL** includes:

- orders and their lines
- quantities and pick status
- pack progression and completion state
- product and staging reference data
- session-linked workflow truth where persistence is required

**Transient state in Redis** includes:

- live presence and liveness markers
- real-time enriched picker state
- pub/sub fan-out messages
- short-lived debug and scan ledgers
- operational coordination that should not be treated as business truth

That split is part of why the system can evolve from prototype toward serious architecture without redesigning everything from scratch.

---

## 9. Deployment and Operations Model

### 9.1 Deployment shape

Picker Vision is deployed as a small service-based stack with separately versioned components.

Operational characteristics already visible in the project include:

- containerized services
- gateway-mediated service topology
- Redis-based coordination
- web UI served as a deployable front end
- explicit versioning of deployed services
- branch-aware deployment patterns in the BTT environment

### 9.2 Operational reality

This artifact has not only been coded. It has been operated.

The project context records real-world issues and corrections involving:

- pod restarts and session continuity
- stale demo sessions
- UI synchronization problems
- scanner regressions and restoration
- route and proxy mistakes
- deploy verification concerns
- hardware-specific scanner behavior

That matters because it means the architecture has been shaped by runtime truth rather than pure diagram design.

Load-bearing architectural decisions recorded during the work include:

- `BarcodeDetector` primary with ZXing fallback after a documented regression caused by removing the native path without evidence
- do not narrow `BarcodeDetector` formats without testing because QR detection broke when formats were constrained
- use QR for on-screen codes because Samsung support for `data_matrix` was not dependable
- persist and broadcast reset semantics explicitly rather than assuming pod restarts are invisible to clients
- insert an order-complete gate before `demo/advance` so the picker, not the server, controls readiness for the next order
- keep phase 1 pick flow continuous and defer tray verification to the pack stage rather than overloading the scan loop
- treat deploy verification and bundle verification as first-class operational concerns, not afterthoughts

These are valuable in the case study because they show real architectural judgment under feedback, not generic best-practice language pasted on after the fact.

---

## 10. Evidence of Real Validation

The strongest technical credibility in this project comes from verified flows rather than abstract claims.

Documented milestone evidence includes:

- three full end-to-end pick runs completed without mechanical failure on real hardware
- two clean end-to-end pick-to-pack runs confirmed on real hardware
- wrong-scan handling verified as part of the stable pick loop
- live deployment and pod-bundle verification practices captured in session context

This is enough to justify calling the artifact operationally real.

---

## 11. Why the Human+AI Delivery Model Matters Technically

### 11.1 This was not prompt theater

The meaningful part of this project is not that AI wrote code. The meaningful part is that the human contributor supplied the things software organizations usually struggle to preserve:

- operational intent
- acceptance judgment
- edge-case recognition
- debugging priority
- business relevance
- demo viability
- narrative coherence about why the system exists

AI supplied the things that are expensive to move across a team boundary at speed:

- implementation breadth across languages and layers
- rapid iteration
- code changes synchronized across client, server, infra, and docs
- regression follow-through
- documentation and report generation

### 11.2 The non-coder aspect is the point, not the caveat

If the human were already a conventional senior programmer, the result would be impressive but unsurprising.

What makes Picker Vision important is that the human was not functioning as a traditional coder. The human functioned as:

- domain owner
- product owner
- acceptance authority
- systems critic
- workflow designer
- runtime truth source

AI functioned as:

- implementation engine
- technical translator
- cross-stack integrator
- documentation partner

That pairing is strategically important for IBM because it suggests a path where deep subject-matter experts can participate much more directly in software creation without pretending they have become full-time developers.

### 11.3 Why an IBM senior programmer should care

A strong engineer reviewing this artifact should see at least three things:

1. the system is structurally real
2. the implementation decisions reflect actual debugging and runtime learning
3. the delivery method changes who can successfully originate software

That is the real architectural significance.

---

## 12. Deferred Enterprise Concerns

The next-stage work for Picker Vision is not conceptual rescue. It is enterprise hardening and integration.

| Area | Current posture | Enterprise follow-on |
|---|---|---|
| Security and identity | Demo/integration-grade controls | Hardened identity, authorization boundaries, secrets handling, audit posture |
| Persistence | Enterprise-ready direction assumed via PostgreSQL | HA configuration, backup/restore, migration discipline, operational runbooks |
| Integration | Adapter-oriented boundary exists | Production OMS/ERP integration, canonical events, contract governance |
| Device support | Real hardware validation performed on known devices | Broader device certification matrix and support policy |
| Pack verification | Single-layer flows validated live | Multi-layer and multi-tote validation across broader physical scenarios |
| Operations | Strong debug and telemetry instincts in place | SRE-grade observability, alerting, support workflows, and service objectives |
| Deployment | BTT and cluster deployment patterns proven | Regional or enterprise topology choice, fleet management, GitOps discipline |
| Tenancy model | Demo-oriented environment model | Explicit multi-store or multi-tenant partitioning strategy where needed |

These items are important to name because they show maturity in scoping. The artifact is credible not because it claims completeness, but because it distinguishes clearly between what has been proven and what would come next in an enterprise program.

---

## 13. Deferred Work and Honest Limits

To preserve credibility, the document should be explicit about what remains beyond current scope.

Deferred or future-hardening areas include:

- broader enterprise security and identity hardening
- full external system integration through production adapters
- more complete pack-flow physical validation for multi-layer and multi-tote cases
- device matrix validation across a larger hardware set
- long-horizon operational observability and support tooling
- formal non-demo production readiness criteria

These are not signs of weakness. They are the normal next steps once an internal innovation artifact proves technical and operational value.

---

## 13. Recommended Reading of the Artifact

The correct way to understand Picker Vision is not as “an app someone hacked together with AI.”

It should be understood as:

- a working event-driven warehouse workflow system
- a proof that domain expertise can be expressed directly in software through AI partnership
- a credible internal architecture that a conventional engineering team could extend
- a reference model for future IBM human+AI delivery experiments

---

## Appendix A — Reference Flow Summary

### A.1 Picker lifecycle

- register picker
- establish live connection
- start or resume session
- receive active order
- scan and confirm picks
- complete order
- pack and verify
- advance or reset

### A.2 System event lifecycle

- detection created at client
- event submitted to gateway
- event processor enriches against active workflow state
- enriched state published through Redis
- websocket hub broadcasts update
- clients redraw UI and allow next action

### A.3 Reliability patterns visible in the artifact

- explicit gating around confirmation and advancement
- liveness and session handling
- reset propagation through real-time channels
- fallback scanning strategy for device variability
- synthetic load generation using the same functional surface as real clients

---

## Appendix B — Suggested Follow-on Documents

This overview should be followed by more detailed artifacts as needed:

1. **Runtime flow spec** — endpoint-by-endpoint sequence flows for pick, advance, reset, and pack
2. **Data model overview** — PostgreSQL entities and relationships
3. **Deployment architecture note** — environments, service topology, and operational dependencies
4. **AI-assisted delivery retrospective** — explicit method, strengths, failure modes, and governance implications
