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

The app has four views, reached from the header bar (the view is in the URL
hash, so links and back/forward work). The same bar holds undo / redo and
save / open / new, and shows a problem count when the board has one.

- **People** — paste the list of teams and the list of decision makers (one
  per line as `Name | Organisation, Country`; the country becomes a small tag
  and names are shortened to "J. Cornejo" in dense tables, while project titles
  get a one-word code in capitals — "The Crust of Europe" → EUROPE, "Evening
  School" → EVENING — the way a crew refers to films it knows by heart; write
  `Title = CODE` or `Name = CODE` to choose the short form yourself; a
  trailing `*` marks someone who joins online), name the event (printed on
  every running order), set the number of slots and optionally label them with
  times, and a *minimum meetings per team* floor so no team goes home with an
  empty day when there is room to avoid it. Example loaders fill in the BSD
  2026 sample day or a random 26 × 26.
- **Interest** — two grids, rows = decision makers, columns = teams, scored
  0–3 (not asked / interested / priority / must-meet). A 0 is not a refusal;
  it only means nobody asked. *Decision makers ask* is the primary signal;
  *Teams ask* is secondary: it breaks ties between meetings a decision maker
  rated equally, and lets a team ask for a meeting the decision maker didn't
  request (placed last, if there's room). You edit one person's asks at a time
  — pick them on the left, rate everyone on the right, with the other side's
  ask shown alongside — or switch to *Overview* for the whole grid on a wide
  screen. Asks usually arrive in a spreadsheet: *Paste* takes a grid copied
  from one (names across the top and down the side, either way round, 0–3 or
  x in the cells, names matched loosely) and *CSV* exports the grid in the
  same shape.
- **Board** — *Generate* builds several good boards and puts the
  **recommended** one on screen: the one that misses the fewest must-meets,
  then the fewest priorities, then the fewest interested asks. The strip under
  the header says how good it is in plain words ("every must-meet, 55 of 58
  priorities, 48 of 73 interested, 115 of 165 team asks · 3 DM windows");
  *Compare* unfolds the other boards, each named by what it gains and what it
  costs ("More team asks met · 1 more team ask met · costs 6 interested asks,
  2 DM windows"), and one click puts any of them on screen. Rows are decision
  makers (or teams), columns are slots; the key in the panel header explains
  the cells: the rose tint is how much the decision maker asked (1 · 2 · 3),
  the blue bar at a cell's right edge how much the team asked, and a white cell
  with a name is a meeting nobody asked for. Click any cell to open it in the
  side panel: who is there, and every counterpart that could be, strongest
  request first, each marked with what picking it would do — *free*, *swap*
  (the two meetings trade partners; the row shows who the other person gets and
  that pair's scores) or *moves from …* (the candidate leaves someone else's
  slot free). A pair meets at most once a day: candidates that would repeat a
  meeting are shown greyed out with where they already meet, and cannot be
  picked. When no cell is selected the side panel shows the board's figures
  (met / asked per tier, windows), any *problems* (a repeat or double booking
  in a loaded file — the editor cannot create one), and the requested meetings
  that did not fit, each with why (both full, DM full, team full, or the slot
  where both are still free). Export is disabled while problems remain.
- **Schedules** — one running order per team or decision maker, headed with
  the event name and stamped with the print time, to print one at a time or
  all at once (one page each), or export everyone's as CSV. Decision makers
  stay at a numbered table (their position in the roster; "online" for those
  joining remotely) and teams walk, so team sheets say where to go.

Every change is undoable (Ctrl/Cmd+Z, Shift for redo).

## The sample day

*BSD 2026 sample day* in People fills in a realistic instance: the 13
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
whatever the board. *Random 26 × 26* is a larger synthetic stress test.

## How the schedule is built

There is no single "best" board: a board that honours more decision-maker
requests usually honours fewer team requests, and packing one person's day
tightly can spread out someone else's. So *Generate* does not return one
answer. It builds a handful of good boards, measures each against the
objectives below, discards every board that is beaten on all counts by another
(the survivors are the **Pareto frontier**), and recommends the first in
priority order — the others are a click away under *Compare*.

### Objectives

All are counts to be made as small as possible, listed in the order used to
rank the table (see [`src/lib/objectives.ts`](src/lib/objectives.ts)):

| Objective | Meaning |
| --- | --- |
| must-meets | decision-maker must-meets (score 3) that got no meeting |
| priorities | decision-maker priority asks (score 2) that got no meeting |
| interested | decision-maker "interested" asks (score 1) that got no meeting |
| teams short | teams with fewer meetings than the *minimum meetings per team* set in People |
| DM windows | empty slots between a decision maker's first and last meeting, summed over all decision makers |
| team asks | team asks (any score) that got no meeting |
| fillers | meetings nobody asked for |
| team windows | as DM windows, for teams |

The three decision-maker tiers are separate objectives rather than one summed
score because that is what the words mean to the people ticking the boxes: a
must-meet is not worth three "interested"s, it is worth any number of them.
The app shows missed counts as *met / asked*.

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
per-team minimum. The "tiered" weighting is strictly lexicographic in tiers
(one must-meet outweighs every priority put together, one priority every
"interested", and any decision-maker ask all team interest), so its board is
the best possible on the first three objectives; that is the recommended
board. Each selection respects one-meeting-per-slot capacity on both sides.

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
sorted by the objective order above. The comparison also shows an *Edited by
hand* row whenever the board differs from every generated one, so you can see
what the edit cost or gained. Generation is deterministic: the same input
gives the same boards. A 26 × 26 × 12 day takes about a tenth of a second.

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
src/index.css              Tailwind + Public Sans import and the colour/font theme
src/App.tsx                header, hash-routed views, project history (undo/redo), localStorage autosave
src/components/ui.tsx      shared pieces: Button, Segmented, Panel, Figure, Name, ScorePair, score tints
src/components/Toolbar.tsx       clashes, undo / redo, save / open / new (in the header)
src/components/PeoplePanel.tsx   rosters, slots, team floor, example loaders
src/components/InterestPanel.tsx dense grid and one-person-at-a-time editor
src/components/BoardPanel.tsx    generate, board grid, cell inspector, summary
src/components/Frontier.tsx      which board is on screen, and the folded-away comparison of alternatives
src/components/SchedulesPanel.tsx per-person running orders, print, CSV
src/lib/history.ts         undo/redo stack over immutable project values
src/lib/names.ts           short display names ("J. Cornejo" + country tag) from "Name | Org, Country"
src/lib/scheduler.ts       greedy selection, slot assignment (edge colouring), cell edits and their effects, stats, issues
src/lib/flow.ts            exact max-weight selection via min-cost flow
src/lib/compact.ts         Kempe-chain slot swaps that close windows in people's days
src/lib/objectives.ts      the objective vector, dominance, frontier merge
src/lib/describe.ts        boards in words: names by trade-off, one-line quality
src/lib/import.ts          interest grids pasted from a spreadsheet
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
  "title": "Baltic Sea Docs 2026 · One-to-one meetings, day 1",   // optional
  "teams": [{ "id": "t1", "name": "Team A", "code": "ALPHA" }],   // "code" only when set by hand
  "dms":   [{ "id": "d2", "name": "Fund X", "online": true }],  // "online" only when true
  "slots": [{ "id": "s3", "label": "09:00" }, { "id": "s4", "label": "" }],  // in order; "" shows as "Slot n"
  "dmScores":   { "t1|d2": 3 },           // 1..3; zero is simply absent
  "teamScores": { "t1|d2": 1 },
  "meetings":   [{ "team": "t1", "dm": "d2", "slot": "s3" }],
  "teamFloor": 1,                         // minimum meetings per team
  "nextId": 5
}
```

Participants and slots have stable ids from one shared counter, so you can add,
remove, or reorder names in People without the interest grid shifting under you,
and change the slot count without meetings jumping to different times. Older
files are converted on open: v1 (the original single-file prototype, everything
by list position) and v2 (`slotCount` + `slotLabels`, meetings by slot
position). A v2 `fillGaps` flag is ignored (filling gaps is now one of the
alternatives rather than a switch).
