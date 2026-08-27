# Detective Map Product Requirements Document (PRD)

**Document status:** Living Source of Truth  
**PRD version:** 2.0  
**Last updated:** 2026-08-25  
**Product:** Detective Map / 侦探外脑  
**Primary concept:** Living Learning Map  
**Core principle:** *Minimum manual effort, maximum cognitive ownership.*

> This PRD supersedes the former “one-shot AI mind-map generator” framing.
> Detective Map is now a persistent visual learning workspace that evolves with the learner’s understanding over time.
> The map is not an output. The map is the learner’s current state of understanding.

---

# 1. Product Vision

## 1.1 Product Positioning

Detective Map is a **persistent, cross-device, AI-assisted visual learning workspace**.

It helps a learner continuously convert new learning material—whether a sentence, paragraph, ChatGPT conversation, article, pasted text, or later a document/PDF—into **one evolving concept map for a topic**.

The learner can continuously add new learning material, let AI propose how the new material changes the existing understanding, edit the concept map structurally on a computer, annotate the same map by hand on iPad with Apple Pencil, keep all changes synchronized, return to the source behind every important concept, and continue learning without starting over.

The product must feel like a **living external model of understanding**, not a collection of disconnected notes.

---

# 2. Core Product Thesis

## 2.1 The Map Is Never “Finished”

```text
Learn something
→ Add it to the current Workspace
→ AI compares it with the existing map
→ AI proposes incremental changes
→ User accepts / edits
→ User restructures on computer
→ User annotates by hand on iPad
→ Everything syncs
→ Learn something else
→ Add again
→ Same map keeps growing
```

A Workspace is a persistent learning topic.

Examples: AI-assisted learning, Pharmaceutical microbiology, Regulatory affairs, Interview preparation, English pronunciation, a book, a course, or a research question.

A new input does **not** create a new concept map unless the learner explicitly creates a new Workspace.

---

# 3. Locked Product Principles

## 3.1 Incremental Merge, Not Regeneration

When new material is added, AI must **not regenerate the entire map**.

Default behavior: add genuinely new concepts, enrich an existing concept, add a new relationship, flag a contradiction, suggest a merge, or suggest a structural change.

AI must preserve existing node IDs, user-created relationships, manual edits, node positions, ink, pinned layout, and source provenance.

Large-scale restructuring must be shown as a proposal and require explicit user approval.

## 3.2 AI Proposes; Human Commits

AI must not silently rewrite the learner’s map.

After processing new material, show a compact proposal:

```text
New learning processed

+ 3 new concepts
+ 2 new relationships
~ 1 existing concept enriched
! 1 possible conflict

[Apply All]   [Review]
```

The low-friction default is **Apply All**. Review allows per-operation accept/reject. Destructive operations such as merge, delete, replacement, or large restructuring always require confirmation.

### 3.2.1 Durable Server-Side Mutation Audit Trail
To provide a durable, attributable server-side mutation audit trail ensuring "AI Proposes; Human Commits" is verifiable and traceable:
- **Server Mutation Audit Table (`mutation_audit`)**: Every proposal apply attempt, stale conflict (409), unprovenanced block (403), error, and successful application is durably recorded in SQLite.
- **Provenance Guard**: Calls without valid human UI action headers (`X-Detective-Surface` and `X-Detective-Action-Id`) are blocked with HTTP 403 `PROVENANCE_REQUIRED`, recorded as `proposal_apply_blocked`, and produce zero map mutation.
- **Atomic Transaction Guarantee**: Map mutation, revision increment, proposal status update (`applied`), and `proposal_apply_success` audit recording execute inside a single atomic SQLite transaction (`executeTransaction`). Any failure inside the transaction triggers a complete rollback to the prior state.
- **Enrichment Audit (`enrich_concept`)**: Tracks structural `enrichedConceptIds` and `enrichedConceptCount` in success audit metadata for complete attribution of incremental knowledge updates.
- **Zero-Secret & Zero-Content Logging**: Device tokens are SHA-256 fingerprinted (`fp_...`). Raw auth tokens, pairing codes, source bodies, summaries, and concept content text are strictly excluded from audit records.
- **Authenticated Audit Endpoint**: `GET /api/audit?workspaceId=...` exposes recent mutation events for auditability without data leakage.

## 3.3 Source ≠ Concept

Raw learning material and conceptual understanding are separate layers.

**Source** = evidence the learner consumed, such as a ChatGPT quote, paragraph, article, pasted text, web URL, or later PDF/document section.

**Concept** = the learner’s abstracted understanding.

Every AI-created or AI-enriched concept should maintain provenance links back to supporting Sources.

## 3.4 Preserve Cognitive Ownership

The system automates mechanical work: parsing, concept extraction, deduplication, relationship detection, source linking, and initial placement.

The learner retains cognitive decisions: what matters, what is wrong, what belongs together, what should be emphasized, how concepts should be arranged, and what handwritten annotations mean.

## 3.5 Never Separate an Insight from Its Context

A learner must be able to move from Concept → supporting Source → original ChatGPT conversation / webpage.

Captured Sources preserve source text, title, URL when available, timestamp, originating Workspace, and source type.

---

# 4. Primary User Experience

## 4.1 Windows / Desktop Role: Structural Thinking

Desktop is optimized for capturing new material, selecting Workspace, reviewing AI proposals, moving nodes, editing concept titles/descriptions, creating/deleting edges, merging concepts, pinning concepts, searching, undo, and managing sources.

Desktop is the primary **structural editing surface**.

## 4.2 iPad Role: Cognitive Annotation

iPad Safari is optimized for viewing the same live concept map, Apple Pencil handwriting, circling concepts, freehand arrows, highlighting, question marks, handwritten comments, erasing strokes, and pan/zoom.

iPad is the primary **thinking / ink surface**.

Windows and iPad are two interfaces to the **same Workspace state**, not two copies.

---

# 5. Core Workflow

## 5.1 Create or Select Workspace

The extension and canvas must always have an **Active Workspace**.

First run:

```text
Create your first learning map
Workspace name: __________
[Create]
```

The extension Side Panel includes a Workspace selector.

## 5.2 Add Learning Material

V2.0 supports three ingestion paths:

### Path A — Chrome Selection Capture

On ChatGPT: select text → right-click → Add to Detective Map. The content is added to the current Active Workspace. Capture remains locally successful even if cloud/AI processing fails.

### Path B — Paste / Add Source

Desktop Canvas includes `+ Add Source`. User can paste one sentence, one paragraph, long notes, or article text. V2.0 target: support at least ~10,000 words through server-side chunking.

### Path C — Manual Concept

User can create a Concept directly without AI.

---

# 6. AI Incremental Update Engine

## 6.1 Input

The AI update endpoint receives Workspace metadata, current Concepts, current Edges, relevant Sources, the new Source, relevant user edits, and map revision number.

Do not send raw ink to AI in V2.0 unless explicitly requested.

## 6.2 Required AI Output

AI returns a **structured patch**, not a whole replacement map.

```json
{
  "workspaceId": "ws_...",
  "baseRevision": 17,
  "sourceId": "src_...",
  "summary": "What this source adds to the learner's current model.",
  "operations": [
    {
      "op": "add_concept",
      "tempId": "tmp_1",
      "label": "Independent Retrieval",
      "description": "Ability to produce knowledge without cues.",
      "sourceRefs": ["src_..."]
    },
    {
      "op": "enrich_concept",
      "conceptId": "concept_existing",
      "addition": "Understanding can exist without successful retrieval.",
      "sourceRefs": ["src_..."]
    },
    {
      "op": "add_edge",
      "from": "concept_existing",
      "to": "tmp_1",
      "relation": "does_not_guarantee",
      "label": "≠",
      "sourceRefs": ["src_..."]
    }
  ]
}
```

## 6.3 Allowed Patch Operations

- `add_concept`
- `enrich_concept`
- `add_edge`
- `update_edge`
- `suggest_merge`
- `flag_conflict`
- `suggest_restructure`

AI must not directly emit destructive `delete_concept` operations as automatic actions.

## 6.4 Two-Sided Concept Boundary & Merge Policy

Before proposing an operation, AI evaluates both directions (Attachment vs Independence) to balance cognitive density with conceptual accuracy:
- **Attachment Test (Anti-Fragmentation)**: Mechanisms, definitions, schedule rules, implementation steps, examples, or properties that depend on an existing concept $X$ MUST generate `enrich_concept` targeting $X$. AI is strictly forbidden from creating fragmented satellite nodes for sub-mechanisms.
- **Independence Escape Hatch (Anti-Over-Merging)**: Claims that have independent identity (counterfactually true without $X$, broader/parallel conceptual scope, or general reusable methodology across domains) MUST generate `add_concept` (and link via `add_edge`) rather than being improperly absorbed into $X$ (e.g. `Distributed Learning` as a broader phenomenon, `Testing Effect`, `Primer Design`, `Cellular Respiration`).
- **Deduplication**: Semantic equivalents enrich existing concepts or create merge suggestions rather than duplicating nodes.

## 6.5 Long Source Processing

```text
Source
→ chunk
→ extract candidate concepts/relationships
→ reconcile candidates
→ compare against existing map
→ produce one consolidated patch
```

The user receives one proposal, not chunk-level result spam.

## 6.6 Human-Readable Proposal Review UI ("AI Proposes; Human Commits")

- **ID Resolution**: All `tempId` and `conceptId` references in `add_edge` and `suggest_merge` are automatically resolved to human-readable concept titles before rendering the review card.
- **Direction & Relation Clarity**: Review modal displays explicit `From → To` directional flow, semantic `relation` badges, and proposed explanatory labels.
- **Subset Preservation**: Users can selectively check/uncheck individual concepts, enrichments, or edges without dangling references.

---

# 7. Map Data Model

## Workspace

```js
{ id, title, createdAt, updatedAt, revision, archived }
```

## Source

```js
{
  id,
  workspaceId,
  type,
  title,
  text,
  url,
  capturedAt,
  contentHash,
  processingStatus
}
```

## Concept

```js
{
  id,
  workspaceId,
  label,
  description,
  x,
  y,
  width,
  pinned,
  createdAt,
  updatedAt,
  sourceRefs,
  createdBy
}
```

## Edge

```js
{
  id,
  workspaceId,
  from,
  to,
  relation,
  label,
  sourceRefs,
  createdBy
}
```

## Ink Stroke

```js
{
  id,
  workspaceId,
  tool,
  color,
  width,
  opacity,
  points: [{ x, y, pressure }],
  createdAt
}
```

## Change Proposal

```js
{
  id,
  workspaceId,
  sourceId,
  baseRevision,
  createdAt,
  summary,
  operations,
  status
}
```

---

# 8. Visual Layers

```text
Infinite World Space
│
├── Ink Layer
│   ├── handwriting
│   ├── highlighter
│   ├── free arrows
│   └── sketches
├── Edge Layer
├── Concept Layer
├── Source / Evidence UI
└── Application UI
```

All spatial content uses the same pan/zoom/world-coordinate model.

---

# 9. Desktop Map Editing Requirements

V2.0 must support drag Concept, edit label, edit description, delete Concept with confirmation, manually create Edge, delete Edge, edit relationship label, pin/unpin Concept, pan, zoom, Undo, fit map, select Concept, view supporting Sources, open original source URL, and apply/reject AI proposals.

Manual structural edits synchronize to iPad.

---

# 10. iPad Ink Requirements

Required tools:

```text
👆 Select
✍️ Pen
🖍 Highlighter
🧽 Stroke Eraser
↩ Undo
```

Apple Pencil (`pointerType === "pen"`) creates ink. Pen/Highlighter should ignore accidental single-finger ink. Touch is primarily navigation. Two-finger pan/zoom is preferred. While a pen stroke is active, unrelated touch pointers should not create ink.

Pressure may be stored; fixed-width drawing is acceptable in V2.0.

---

# 11. Cross-Device Synchronization

Synchronize Concepts, Concept positions, Concept edits, Edges, Sources, AI proposal/status, Ink, and Workspace changes.

A Windows capture should appear on an already-open iPad without refresh. An iPad ink stroke should persist and reappear after reopening.

Use revision-aware updates to avoid silent overwrites.

---

# 12. Cloud Architecture

```text
Chrome Extension / Desktop Canvas
             │
             │ HTTPS / WSS
             ▼
       Cloudflare Worker
             │
             ▼
       Durable Object
             │
     persistent Workspace state
             │
             ▼
        iPad Safari
```

Frontend remains Vanilla HTML/CSS/JavaScript unless a later PRD changes this.

---

# 13. Security Requirements — Locked

- no hardcoded pairing codes,
- no credentials in Git,
- no credentials in URLs,
- no public `/api/state`,
- all state APIs require authentication,
- WebSocket sends no state before authentication,
- old compromised pairing credentials must be invalidated,
- device tokens stored locally only,
- Chrome capture continues locally when cloud fails,
- no `<all_urls>` extension permission,
- extension host permission limited to deployed Worker domain,
- do not log source content or auth tokens unnecessarily.

Pairing secrets must be provisioned securely outside source control.

---

# 14. AI Provider Architecture

The Worker exposes a provider-neutral internal AI interface.

Preferred order:

1. Detect whether the current Cloudflare account can use a supported Cloudflare Workers AI text model.
2. If available, configure Workers AI through an account binding rather than hardcoded secrets.
3. If unavailable, implement the provider interface and clearly report that an external AI provider must be configured.

Do not fake AI output with a simple sentence splitter and call it AI.

AI response must be validated against the patch schema before becoming a Proposal. Invalid AI output fails safely without modifying the existing map.

---

# 15. Workspace Revision / Conflict Model

Every structural Workspace mutation increments a revision.

Each AI Proposal records `baseRevision`.

If `currentRevision !== baseRevision`, do not blindly apply. Rebase/regenerate or mark the Proposal stale.

---

# 16. Failure Behavior

## AI unavailable

```text
Source saved
AI update pending / unavailable
[Retry]
```

Existing map remains untouched.

## Cloud unavailable

```text
Saved locally
Cloud sync pending
```

## WebSocket disconnect

Reconnect with backoff. Do not discard local edits.

## Invalid AI patch

Reject patch. Do not mutate map.

---

# 17. V2.0 Acceptance Scenarios

## Scenario 1 — First Learning Input

Create Workspace `AI Learning`. Capture `Active recall improves retrieval strength.` AI proposes an initial concept map. User applies it.

## Scenario 2 — Incremental Learning

Later capture `Understanding something does not mean you can independently retrieve it.` AI compares against the existing map, proposes incremental changes, does not create a new map, and preserves existing node positions.

## Scenario 3 — Long Article

Paste a multi-thousand-word article. Source is saved, processing happens in background, chunking produces one consolidated proposal, duplicates are avoided, and the existing map is preserved.

## Scenario 4 — Desktop Manual Editing

User drags a node, edits its label, and creates an edge. Changes persist and sync. AI may not silently reverse them on the next ingestion.

## Scenario 5 — iPad Handwriting

Open the same Workspace on iPad Safari. Use Apple Pencil to circle, write, highlight, and erase. Ink uses map world coordinates and persists.

## Scenario 6 — Continuous Growth

Capture five additional Sources over multiple sessions. The same Workspace keeps evolving with no duplicate maps and no loss of prior manual structure or ink.

---

# 18. V2.0 Non-Goals

Do not implement yet: handwriting OCR, AI interpretation of handwritten symbols, automatic conversion of ink arrow to semantic Edge, collaborative multi-user editing, public sharing, complex knowledge graph analytics, spaced-repetition generation, automatic PDF OCR, full Obsidian integration, or autonomous large-scale AI rearrangement.

---

# 19. V2.1 / Future Direction

## 19.1 Human-AI Co-thinking Canvas
```text
User circles concepts
+ writes “same thing?”
+ draws an arrow
        ↓
AI interprets selected ink context
        ↓
AI proposes merge / relation / clarification
        ↓
Human approves
```
This is the intended **Human-AI Co-thinking Canvas** direction.

## 19.2 Pluggable AI Provider Layer & Long-Context Evolution
```text
Detective Map Core
        │
        ▼
AI Provider Abstraction Layer
  ├─ Cloudflare Workers AI (Default / Built-in / 0-config)
  ├─ Agnes 2.5 Flash (OpenAI-compatible / 512K Long Context candidate)
  └─ External Providers (OpenAI GPT-4o / Gemini 1.5 Pro)
```

**Key Architectural Decisions**:
1. **Zero Coupling to Single Model**: The core concept map, workspace, SQLite schema, and proposal state machine remain strictly isolated from LLM provider details.
2. **Long-Context Advantage for Large Living Maps**: As a map grows to hundreds of concepts and source documents, 512K context models (like Agnes 2.5 Flash) can ingest the entire existing knowledge graph + new incoming text to make highly contextual decisions (`add_concept` vs `enrich_concept` vs `detect_conflict` vs `add_edge`).
3. **A/B Benchmark Strategy**: Run side-by-side evaluations on identical sources and mature maps (`Workers AI` vs `Agnes 2.5 Flash` vs `GPT-4o-mini`) to measure structural extraction accuracy and relationship quality before promoting any secondary provider.
4. **Credential Security**: All third-party provider keys must reside exclusively in Cloudflare Worker Secrets (`wrangler secret put`), never in chat logs, client storage, or code commits.

---

# 20. Product Definition

> **Detective Map is a persistent visual learning workspace that continuously updates with what you learn, while preserving your own spatial edits, handwritten thinking, and source context.**

Short form:

> **Learn → Add → AI Merge → Edit → Ink → Sync → Keep Learning.**

The product succeeds when the learner can study for days or weeks and feel that one map is becoming an increasingly accurate external representation of their own understanding.
