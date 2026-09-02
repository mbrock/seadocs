# Meeting Board

A small browser tool for scheduling one-to-one meetings at a festival
marketplace: **project teams** (artists, companies, producers pitching work)
meet **decision makers** (programmers, commissioners, funders) in short, fixed
time slots. Given who wants to meet whom, it builds the board — which team sits
with which decision maker in which slot — and produces the per-person running
orders you'd print or send out.

It is a static site with no server. Everything stays in the browser (autosaved
to localStorage); projects are saved as JSON files you can email to a colleague.

## What it does

1. **Setup** — paste the list of teams and the list of decision makers (one per
   line), say how many slots the day has, and optionally label them with times.
2. **Interest** — two grids, rows = decision makers, columns = teams. Click a
   cell to cycle 0 → 1 → 2 → 3 (none / interested / priority / must-meet).
   - *Decision-maker interest* is the primary signal: how keen each decision
     maker is to meet each team.
   - *Team interest* is secondary: it breaks ties between meetings a decision
     maker rated equally, and lets a team ask for a meeting the decision maker
     didn't request (those are placed last, if there's room).
3. **Schedule** — press *Generate*. You get the board (columns = decision
   makers, rows = slots), headline stats, and a list of requested meetings that
   did not fit. Any cell can be changed by hand; picking a team already booked
   elsewhere in that slot swaps the two meetings. Duplicates and double
   bookings created by hand are flagged.
4. **Personal boards** — pick any team or decision maker to see their running
   order; print it, or export everyone's at once as CSV.

## How the schedule is built

Generation is two independent steps (see [`src/lib/scheduler.ts`](src/lib/scheduler.ts)):

**1. Choose which meetings happen.** Every team × decision-maker pair gets a
rank: decision-maker score first, team score as tie-break. Pairs are taken in
descending rank. Within one rank, the pair whose team (then decision maker) has
the fewest meetings so far goes first, so equal interest is spread evenly
rather than by list order. A pair is skipped once either side already has as
many meetings as there are slots. Optionally, leftover capacity is filled with
pairs nobody asked for.

**2. Fit them into slots.** Because each participant has at most one meeting
per slot, and the teams/decision-makers graph is bipartite, König's
edge-colouring theorem guarantees every selection from step 1 can be fitted
into the slots with nobody double-booked. The implementation is the standard
alternating-path recolouring; it never fails to place a chosen meeting.

The original prototype placed meetings greedily into the earliest slot free for
both sides, which can strand a meeting that would have fitted with a different
arrangement. Step 2 removes that failure mode entirely.

Step 1 is still a greedy heuristic. It is deterministic (same input → same
board) and easy to explain, but not guaranteed to maximise the number of
must-meets. The test suite contains a small example where it finds 5 of a
possible 6 gap-fill meetings. A max-flow / min-cost-flow selector would make it
optimal; that's a candidate for a later iteration.

## Running it

React + TypeScript + Tailwind, built with Vite. Tests run with Vitest.

```sh
npm install
npm run dev          # dev server with hot reload
npm test             # scheduler and model tests
npm run lint         # oxlint
npm run build        # production build into dist/
```

### Deploying to GitHub Pages

The `build and deploy` workflow lints, tests, builds, and publishes `dist/` to
GitHub Pages on every push to `main`. One-time setup in the repository:
Settings → Pages → Source: **GitHub Actions**. The build uses a relative base
path, so it works under a project path like `/seadocs/` without configuration.

## Layout

```
index.html                 Vite entry
src/main.tsx               mounts <App/>
src/index.css              Tailwind import and the colour/font theme
src/App.tsx                tabs, project state (persisted to localStorage)
src/components/            one component per panel, plus small shared UI pieces
src/lib/scheduler.ts       pure scheduling logic: select meetings, assign slots, stats, issues
src/lib/state.ts           project model, stable participant ids, save/load, v1 import, demo data
src/lib/csv.ts             CSV exports and file download
src/lib/*.test.ts          Vitest suites
```

The scheduling and model code has no React or DOM dependency; the components
only call its functions and render the result.

### Project file format (v2)

```jsonc
{
  "version": 2,
  "teams": [{ "id": "t1", "name": "Team A" }],
  "dms":   [{ "id": "d2", "name": "Fund X" }],
  "slotCount": 12,
  "slotLabels": ["09:00", "09:20"],       // missing ones show as "Slot n"
  "dmScores":   { "t1|d2": 3 },           // 1..3; zero is simply absent
  "teamScores": { "t1|d2": 1 },
  "meetings":   [{ "team": "t1", "dm": "d2", "slot": 0 }],
  "fillGaps": false,
  "nextId": 3
}
```

Participants have stable ids so you can add, remove, or reorder names in Setup
without the interest grid shifting under you. Files saved by the original
single-file prototype (v1, index-based) are converted on open.
