# Value Tree Builder (prototype)

Configurable value driver tree generator + AI insight. Built with Next.js,
React, React Flow, and a PostgreSQL schema for production persistence.

## Run

```bash
npm install
npm run dev
# open http://localhost:3000
```

Open a seeded tree:
- **EVA Value Tree** — financial, formula-driven (mirrors the reference screenshot).
- **Strategic Health Scorecard** — qualitative, weighted 1–5 scoring.

## Try it

1. Edit any blue **input** node's value → the whole tree recomputes instantly.
2. Select a node → edit label / type / operator / target in the right rail.
3. `+ child` on a node to grow the tree; `Auto layout` to tidy it.
4. **Generate AI Insight** → anomalies + recommended actions (click an item to
   focus its node).

## Enable real Claude insight (optional)

Create `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Without it, a deterministic heuristic is used so the feature always works.

## Tests

Unit tests (Vitest) cover the core domain logic — the calculation engine,
operand ordering, validation, AI-insight heuristics, and layout invariants.

```bash
npm test            # run once
npm run test:watch  # watch mode
npm run test:coverage
npm run typecheck   # tsc --noEmit
```

CI (`.github/workflows/ci.yml`) runs the typecheck + tests on every pull
request, so a change that breaks existing behaviour is caught before merge.

## Layout

```
app/            Next.js routes (home, /editor/[id], /api/insight)
components/      ValueTreeEditor, ValueNode, InsightPanel
lib/            types, calc (engine), layout, insight, seed, db, repo
tests/          Vitest unit tests + factory helpers
db/schema.sql   PostgreSQL production schema
ARCHITECTURE.md design & rationale
```
