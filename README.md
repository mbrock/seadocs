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
3. **Schedule** — press *Generate*. You get a short table of alternative
   boards, each scored on the objectives below, with the first one loaded onto
   the board (columns = decision makers, rows = slots) together with headline
   stats and a list of requested meetings that did not fit. Any cell can be
   changed by hand; picking a team already booked elsewhere in that slot swaps
   the two meetings. Duplicates and double bookings created by hand are
   flagged. Setup also has a *minimum meetings per team* setting so no team
   goes home with an empty day when there is room to avoid it.
4. **Personal boards** — pick any team or decision maker to see their running
   order; print it, or export everyone's at once as CSV.

## The sample day

*Load sample day (BSD 2026)* in Setup fills in a realistic instance: the 13
projects pitched on the first day of the 30th Baltic Sea Docs (Riga,
10 September 2026), the 17 decision makers in the room, and nine 20-minute
slots from 15:20 to 18:00. Names and countries are from the public programme;
the interest grids are **invented** — authored in
[`src/lib/sample.ts`](src/lib/sample.ts) from what each kind of decision maker
plausibly wants (sales agents cast a wide net, broadcasters go for national and
neighbouring projects, festivals want a little of everything, funds only their
own country's co-productions).

It shows the shape of a real day well: with 13 teams and 9 slots there are only
117 seats, but the decision makers asked for 142 meetings, so the teams — not
the decision makers — are the bottleneck, and around 25 requests cannot be met
whatever the board. *Load random 26 × 26* is a larger synthetic stress test.

## How the schedule is built

There is no single "best" board: a board that honours more decision-maker
requests usually honours fewer team requests, and packing one person's day
tightly can spread out someone else's. So *Generate* does not return one
answer. It builds a handful of good boards, measures each against the
objectives below, discards every board that is beaten on all counts by another
(the survivors are the **Pareto frontier**), and shows them as a table. The
first row is loaded onto the board; click any other row to load it instead.

### Objectives

All are counts to be made as small as possible, listed in the order used to
rank the table (see [`src/lib/objectives.ts`](src/lib/objectives.ts)):

| Objective | Meaning |
| --- | --- |
| must-meets missed | decision-maker must-meets (score 3) that got no meeting |
| DM interest lost | decision-maker scores of requested meetings that did not happen, added up |
| teams short | teams with fewer meetings than the *minimum meetings per team* set in Setup |
| DM windows | empty slots between a decision maker's first and last meeting, summed over all decision makers |
| team interest lost | team scores of requested meetings that did not happen, added up |
| fillers | meetings nobody asked for |
| team windows | as DM windows, for teams |

"Windows" capture the request that a decision maker's day should not be one
meeting at 9, one at 13 and one at 18: idle slots before the first or after the
last meeting are fine, idle slots in the middle are not.

### Pipeline

Generation is three pure steps.

**1. Candidate selections** ([`src/lib/optimize.ts`](src/lib/optimize.ts)).
Which meetings happen is decided several ways: the original greedy ranking
(decision-maker score, then team score, then whoever has fewest meetings), with
and without filling leftover capacity, and an **exact** maximum-weight selector
([`src/lib/flow.ts`](src/lib/flow.ts), min-cost flow) run under several
weightings of decision-maker vs team interest, with and without enforcing the
per-team minimum. The "dm-first" weighting is strictly lexicographic (one point
of decision-maker interest outweighs all team interest put together), so its
board loses the least decision-maker interest any board can. Each selection
respects one-meeting-per-slot capacity on both sides.

**2. Slot assignment** ([`src/lib/scheduler.ts`](src/lib/scheduler.ts)).
Because the teams/decision-makers graph is bipartite, König's edge-colouring
theorem guarantees any selection from step 1 fits into the slots with nobody
double-booked. The implementation is alternating-path recolouring and never
fails to place a chosen meeting. (The original prototype put each meeting in
the earliest slot free for both sides, which can strand a meeting that would
have fitted.)

**3. Compaction** ([`src/lib/compact.ts`](src/lib/compact.ts)). Slot
assignment says nothing about *which* slots, so a further pass swaps pairs of
slots along alternating chains (Kempe chains; always valid in a bipartite graph)
whenever that reduces windows, decision makers first, then teams. Which
meetings happen never changes here, only when.

Every board is then measured, dominated ones are dropped, and the frontier is
sorted by the objective order above. The table also shows a *Current board*
row whenever the board has been edited by hand so you can see what the edit
cost or gained. Generation is deterministic: the same input gives the same
table. A 26 × 26 × 12 day takes about a tenth of a second.

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
src/lib/scheduler.ts       greedy selection, slot assignment (edge colouring), stats, issues
src/lib/flow.ts            exact max-weight selection via min-cost flow
src/lib/compact.ts         Kempe-chain slot swaps that close windows in people's days
src/lib/objectives.ts      the objective vector, dominance, frontier merge
src/lib/optimize.ts        runs the candidates through the pipeline, returns the frontier
src/lib/generate.ts        ties the frontier to a project snapshot (stale detection)
src/lib/project.ts         project model: participants, slots, scores, meetings, with* update functions
src/lib/persist.ts         project file format (v3) with v1/v2 migration, localStorage
src/lib/sample.ts          the BSD 2026 sample day (real names, invented interest)
src/lib/fixtures.ts        seeded random 26 × 26 stress-test day
src/lib/csv.ts             CSV exports and file download
src/lib/*.test.ts          Vitest suites
```

The scheduling and model code has no React or DOM dependency; the components
only call its functions and render the result.

### Project file format (v3)

```jsonc
{
  "version": 3,
  "teams": [{ "id": "t1", "name": "Team A" }],
  "dms":   [{ "id": "d2", "name": "Fund X" }],
  "slots": [{ "id": "s3", "label": "09:00" }, { "id": "s4", "label": "" }],  // in order; "" shows as "Slot n"
  "dmScores":   { "t1|d2": 3 },           // 1..3; zero is simply absent
  "teamScores": { "t1|d2": 1 },
  "meetings":   [{ "team": "t1", "dm": "d2", "slot": "s3" }],
  "teamFloor": 1,                         // minimum meetings per team
  "nextId": 5
}
```

Participants and slots have stable ids from one shared counter, so you can add,
remove, or reorder names in Setup without the interest grid shifting under you,
and change the slot count without meetings jumping to different times. Older
files are converted on open: v1 (the original single-file prototype, everything
by list position) and v2 (`slotCount` + `slotLabels`, meetings by slot
position). A v2 `fillGaps` flag is ignored (filling gaps is now one of the
alternatives rather than a switch).
