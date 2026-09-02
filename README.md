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

- **Setup** — paste the list of teams and the list of decision makers (one
  per line as `Name | Organisation, Country`; the country becomes a small tag
  and names are shortened to "J. Cornejo" in dense tables, while project titles
  get a one-word code — "The Crust of Europe" → Europe, "Evening School" →
  Evening — the way a crew refers to films it knows by heart; write
  `Title = Code` or `Name = Code` to choose the short form yourself; a
  trailing `*` marks someone who joins online), name the event (printed on
  every running order), and list the slots, one line per slot — usually the
  times. Example loaders fill in the BSD 2026 sample day or a random 26 × 26.
- **Interest** — two grids, rows = decision makers, columns = teams; a cell
  is either **asked** or not. Not asked is not a refusal; it only means nobody
  asked. *Decision makers ask* is the primary signal; *Teams ask* is
  secondary: it is heard once every decision maker has been served as well as
  possible, and lets a team ask for a meeting the decision maker didn't request
  (placed if there's room). You edit one person's asks at a time — pick them on
  the left, tick everyone they want on the right, with the other side's ask
  shown alongside — or switch to *Overview* for the whole grid on a wide
  screen. Asks usually arrive in a spreadsheet: *Paste* takes a grid copied
  from one (names across the top and down the side, either way round, `x`,
  `1` or `yes` in the asked cells, names matched loosely) and *CSV* exports
  the grid in the same shape.
- **Board** — the solver runs on the current input as you work; *Generate*
  puts its **recommended** board on screen: the one that misses the fewest
  decision-maker asks, then leaves the fewest decision makers with under half
  of what they asked for, then leaves the fewest teams out. The strip under the
  header names the board on screen and says how good it is in plain words
  ("102 of 116 DM asks, 95 of 114 team asks · 3 DM windows"); once you edit it
  becomes *Your board*, with *Use recommended* to go back. *Compare* unfolds
  the other boards, each named by what it gains and what it costs ("More team
  asks met · 1 more team ask met · costs 6 DM asks, 2 DM windows"), and one
  click puts any of them on screen. Rows are decision makers (or teams),
  columns are slots; the key in the panel header explains the cells: gold
  means the decision maker asked for this meeting, the blue bar at a cell's
  right edge means the team asked, a white cell with a name is a meeting
  nobody asked for, and a hatched cell is a slot that person cannot do. Red is
  reserved for problems.
  Click any cell to open it in the side panel: who is there (with *Remove*),
  and every counterpart that could be booked, strongest request first, each
  marked with what picking it would do — *free now*, *swap* (the two meetings
  trade partners; the row shows who the other person gets and who asked for
  that pair) or *moves from …* (the candidate leaves someone else's slot free).
  A pair meets at most once a day, and nobody is booked when they are away:
  counterparts that would break either rule are not listed, only counted
  ("Not listed: 4 already meet Kawakami today"). The same panel is where you
  record that someone **can't do a slot** — "Kawakami can't do 15:20" blocks
  the cell (and removes any meeting there); the solver's recommendation
  updates around it. When no cell is selected the side panel shows the board's
  figures (DM and team asks met / asked, windows, DMs under half, teams left out), any
  *problems* (a repeat, a double booking or a meeting at a blocked time, which
  only a hand-written file can contain — the editor cannot create one), how
  many meetings each decision maker got of those they asked for (worst first),
  and the requested meetings that did not fit, each with why (both full, DM
  full, team full, or the slot where both are still free). Export is disabled
  while problems remain.
- **Schedules** — one running order per team or decision maker, headed with
  the event name and stamped with the print time, to print one at a time or
  all at once (one page each), or export everyone's as CSV. Decision makers
  stay at a numbered table (their position in the roster; "online" for those
  joining remotely) and teams walk, so team sheets say where to go.

Every change is undoable (Ctrl/Cmd+Z, Shift for redo).

## The sample day

*BSD 2026 sample day* in Setup fills in a realistic instance: the 13
projects pitched on the first day of the 30th Baltic Sea Docs (Riga,
10 September 2026), the 17 decision makers in the room, and nine 20-minute
slots from 15:20 to 18:00. Names and countries are from the public programme;
the interest grids are **invented** — authored in
[`src/lib/sample.ts`](src/lib/sample.ts) from what each kind of decision maker
plausibly wants (sales agents cast a wide net, broadcasters go for national and
neighbouring projects, festivals want a little of everything, funds only their
own country's co-productions).

It shows the shape of a real day well: with 13 teams and 9 slots there are only
117 seats, but the decision makers asked for 116 meetings and the teams for
114, so the teams — not the decision makers — are the bottleneck, and a dozen
or so decision-maker asks cannot be met whatever the board. *Random 26 × 26* is a larger synthetic stress test.

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
| DM asks | decision-maker asks that got no meeting |
| DMs under half | decision makers who got fewer than half of the meetings they asked for |
| teams left out | teams with no meeting at all |
| DM windows | empty slots between a decision maker's first and last meeting, summed over all decision makers |
| team asks | team asks that got no meeting |
| fillers | meetings nobody asked for |
| team windows | as DM windows, for teams |

Asks are either/or — there are no grades of interest — because that is how
the people ticking the boxes think of them, and it keeps every count above
something you can check by hand. The app shows missed counts as *met / asked*.

"DMs under half" is the fairness objective: with more asks than seats the
decision makers who asked for the most would otherwise soak up the room while
someone who ticked six boxes gets one meeting. It ranks below DM asks (it never
costs one) and above team asks.

"Windows" capture the request that a decision maker's day should not be one
meeting at 9, one at 13 and one at 18: idle slots before the first or after the
last meeting are fine, idle slots in the middle are not.

### Pipeline

Generation is three pure steps.

**1. Candidate selections** ([`src/lib/optimize.ts`](src/lib/optimize.ts)).
Which meetings happen is decided several ways: the original greedy ranking
(asked by the decision maker, then by the team, then whoever has fewest
meetings), with and without filling leftover capacity, and an **exact**
maximum-weight selector ([`src/lib/flow.ts`](src/lib/flow.ts), min-cost flow)
run under several weightings of decision-maker vs team asks, with and without
a one-meeting-per-team floor. The "dm-first" and "fair" weightings are
strictly lexicographic (one decision-maker ask outweighs every team ask put
together), so their boards meet the most DM asks possible. Among boards
equally good for the decision makers as a group, "fair" breaks ties by **fair
share** — it prefers giving a meeting to the decision maker who has so far
received the smallest fraction of what they asked for — and only then by team
asks; that weighting usually produces the recommended board. Each selection respects one-meeting-per-slot
capacity on both sides, counting only the slots each person can do.

**2. Slot assignment** ([`src/lib/scheduler.ts`](src/lib/scheduler.ts)).
Because the teams/decision-makers graph is bipartite, König's edge-colouring
theorem guarantees any selection from step 1 fits into the slots with nobody
double-booked. The implementation is alternating-path recolouring, so with
everyone available all day no chosen meeting is stranded. (The original
prototype put each meeting in the earliest slot free for both sides, which
can.) Blocked slots break the guarantee; the rare meeting that then cannot be
placed is dropped and shows up under *Not scheduled*.

**3. Compaction** ([`src/lib/compact.ts`](src/lib/compact.ts)). Slot
assignment says nothing about *which* slots, so a further pass swaps pairs of
slots along alternating chains (Kempe chains; always valid in a bipartite graph)
whenever that reduces windows, decision makers first, then teams. Which
meetings happen never changes here, only when.

Every board is then measured, dominated ones are dropped, and the frontier is
sorted by the objective order above. The comparison also shows a *Your board*
row whenever the board differs from every generated one, so you can see what
the edit cost or gained. Generation is deterministic: the same input gives the
same boards, which is why there is no "generate again" — the frontier is
recomputed whenever people, interest, slots or availability change. A
26 × 26 × 12 day takes about a third of a second.

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
src/components/ui.tsx      shared pieces: Button, Segmented, Panel, Figure, Name, AskPair, ask tints
src/components/Toolbar.tsx       clashes, undo / redo, save / open / new (in the header)
src/components/SetupPanel.tsx    rosters, event name, slots, example loaders
src/components/InterestPanel.tsx dense grid and one-person-at-a-time editor
src/components/BoardPanel.tsx    generate, board grid, cell inspector, summary
src/components/Frontier.tsx      which board is on screen, and the folded-away comparison of alternatives
src/components/SchedulesPanel.tsx per-person running orders, print, CSV
src/lib/history.ts         undo/redo stack over immutable project values
src/lib/names.ts           short display names ("J. Cornejo" + country tag) from "Name | Org, Country"
src/lib/scheduler.ts       participants and availability, greedy selection, slot assignment (edge colouring), cell edits and their effects, stats, issues
src/lib/flow.ts            exact max-weight selection via min-cost flow
src/lib/compact.ts         Kempe-chain slot swaps that close windows in people's days
src/lib/objectives.ts      the objective vector, dominance, frontier merge
src/lib/describe.ts        boards in words: names by trade-off, one-line quality
src/lib/import.ts          interest grids pasted from a spreadsheet
src/lib/optimize.ts        runs the candidates through the pipeline, returns the frontier
src/lib/project.ts         project model: participants, slots, asks, meetings, with* update functions
src/lib/persist.ts         project file format (v4) with v1–v3 migration, localStorage
src/lib/sample.ts          the BSD 2026 sample day (real names, invented interest)
src/lib/fixtures.ts        seeded random 26 × 26 stress-test day
src/lib/csv.ts             CSV exports and file download
src/lib/*.test.ts          Vitest suites
```

The scheduling and model code has no React or DOM dependency; the components
only call its functions and render the result.

### Project file format (v4)

```jsonc
{
  "version": 4,
  "title": "Baltic Sea Docs 2026 · One-to-one meetings, day 1",   // optional
  "teams": [{ "id": "t1", "name": "Team A", "code": "ALPHA" }],   // "code" only when set by hand
  "dms":   [{ "id": "d2", "name": "Fund X", "online": true, "unavailable": ["s4"] }],  // "online" only when true; "unavailable" = slot ids they cannot do
  "slots": [{ "id": "s3", "label": "09:00" }, { "id": "s4", "label": "" }],  // in order; "" shows as "Slot n"
  "dmAsks":   ["t1|d2"],                  // pairs the decision maker asked for; not asked is simply absent
  "teamAsks": ["t1|d2"],
  "meetings":   [{ "team": "t1", "dm": "d2", "slot": "s3" }],
  "nextId": 5
}
```

Participants and slots have stable ids from one shared counter, so you can add,
remove, or reorder names in Setup without the interest grid shifting under you,
and change the slot count without meetings jumping to different times. Older
files are converted on open: v1 (the original single-file prototype, everything
by list position), v2 (`slotCount` + `slotLabels`, meetings by slot position)
and v3 (`dmScores`/`teamScores` graded 1–3: any grade becomes an ask). A v2
`fillGaps` flag is ignored (filling gaps is now one of the alternatives rather
than a switch), as is a v3 `teamFloor` (every board now tries to leave no team
out).
