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

The app has three views, reached from the header bar (the view is in the URL
hash, so links and back/forward work). The same bar holds undo / redo and
save / open / new, and shows a problem count when the board has one.

- **Setup** — one editable matrix: film teams are rows, decision makers are
  columns, and every cell contains both sides' requests. Editing a row or column
  name keeps its identity and requests attached. Names can also be pasted in bulk (one
  per line as `Name | Organisation, Country`; the country becomes a small tag
  and names are shortened to "J. Cornejo" in dense tables, while project titles
  get a one-word code — "The Crust of Europe" → Europe, "Evening School" →
  Evening — the way a crew refers to films it knows by heart; write
  `Title = Code` or `Name = Code` to choose the short form yourself; a
  trailing `*` marks someone who joins online), name the event (printed on
  every running order), and list the slots, one line per slot — usually the
  times. Pasting adds entries and never silently replaces existing people;
  destructive deletions require confirmation when edits are applied. The sample
  loader fills in the BSD 2026 day. Unapplied text stays intact while moving around the app.
  Every matrix cell has two checkboxes, gold for the decision maker and blue for the
  team. Not asked is not a refusal; it only means nobody asked. Decision-maker
  interest is the primary signal; team interest is
  secondary: it is heard once every decision maker has been served as well as
  possible, and lets a team ask for a meeting the decision maker didn't request
  (placed if there's room).
- **Board** — *Generate* runs the local CP-SAT solver and puts its board on
  screen. **Quick** returns a validated incumbent in about three seconds;
  **Prove optimal** runs without a time limit until every objective stage is
  proven, and can be cancelled at any time. The current board stays visible
  while either mode runs. Rows are decision makers (or teams),
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
  the cell (and removes any meeting there). When no cell is selected the side
  panel shows the board's
  figures (DM and team asks met / asked, windows, DMs under half, teams left out), any
  *problems* (a repeat, a double booking or a meeting at a blocked time, which
  only a hand-written file can contain — the editor cannot create one), how
  many meetings each decision maker got of those they asked for (worst first),
  and the requested meetings that did not fit, each with why (both full, DM
  full, team full, or the slot where both are still free). Export is disabled
  while problems remain. The solver runs entirely in a Web Worker in this
  browser and never uploads roster or interest data.
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
or so decision-maker asks cannot be met whatever the board.

## How the schedule is built

Generate lazily loads the portable WebAssembly build of
`cpsat-js@1.3.0` in an app-owned module Worker. The model decides whether each
team × decision-maker pair meets **and** its slot together, so availability,
one meeting per person per slot, and pair uniqueness are hard constraints
rather than assumptions made before placement. Every returned board is checked
again by ordinary TypeScript before it can replace the board on screen.
While solving, the Worker sends structured loading, model-building, stage,
incumbent, bound and completion status objects to the main thread; these are
currently rendered as readable `[CP-SAT]` progress lines in the browser console.

Optimization uses clear sequential objectives rather than a hidden weighted
score. Phase A maximizes mutual requests, then DM requests, teams receiving at
least one meeting, team requests, and total meetings. Each proven optimum or
time-limited incumbent value becomes the next stage's constraint. Phase B
rebuilds the full selectable pair × slot model with DM internal-gap variables,
then minimizes DM gaps and finally favors unchanged current-board cells. It
does not freeze Phase A pair choices. Because the present project
format has binary asks but no explicit filler consent or per-DM cap, generation
allows at most one meeting per DM that the DM did not request; this
is the deliberately conservative burden guardrail for team-only and filler
meetings.

Current project files do not distinguish locks/pins from editable board cells,
so manual cells are stability preferences, not hidden hard locks. If lock/pin
fields are added later they must become explicit hard constraints and validator
checks. The current fairness compromise is similarly intentional: v1 maximizes
the number of teams served rather than using the old “DMs under half” threshold.
The previous JavaScript scheduler remains only as a starting hint and emergency
fallback if WebAssembly fails; it is not a visible alternative or a correctness
oracle for the integrated model.

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
src/components/SetupPanel.tsx    editable participant/request matrix, day settings and sample loader
src/components/BoardPanel.tsx    generate, board grid, cell inspector, summary
src/components/SchedulesPanel.tsx per-person running orders, print, CSV
src/lib/history.ts         undo/redo stack over immutable project values
src/lib/names.ts           short display names ("J. Cornejo" + country tag) from "Name | Org, Country"
src/lib/scheduler.ts       participants and availability, greedy selection, slot assignment (edge colouring), cell edits and their effects, stats, issues
src/lib/flow.ts            exact max-weight selection via min-cost flow
src/lib/compact.ts         Kempe-chain slot swaps that close windows in people's days
src/lib/objectives.ts      the objective vector, dominance, frontier merge
src/lib/describe.ts        shared request descriptions
src/lib/advancedSolver.ts  Worker protocol, independent validation and audit metrics
src/lib/cpsatModel.ts      integrated pair × slot CP-SAT model and staged objectives
src/lib/optimize.ts        legacy JavaScript incumbent hint and emergency fallback
src/workers/cpsat.worker.ts lazy local WebAssembly solver worker
src/lib/project.ts         project model: participants, slots, asks, meetings, with* update functions
src/lib/persist.ts         project file format (v5) with v1–v4 migration, localStorage
src/lib/sample.ts          the BSD 2026 sample day (real names, invented interest)
src/lib/fixtures.ts        seeded random 26 × 26 stress-test day
src/lib/csv.ts             CSV exports and file download
src/lib/*.test.ts          Vitest suites
```

The scheduling and model code has no React or DOM dependency; the components
only call its functions and render the result.

### Project file format (v5)

```jsonc
{
  "version": 5,
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

Team, DM and slot IDs are durable references. Names are display data: each
matrix heading carries its ID, so any rename keeps requests, availability and meetings
attached. Existing v1 files receive IDs during migration; v2–v4 IDs and linked
data are retained. A stale `nextId` counter is repaired. Current-format files
with duplicate identities or dangling requests/meetings are rejected rather
than guessed at, leaving the project already open in the browser untouched.

Participants and slots have stable ids from one shared counter, so you can add,
remove, or rename people in Setup without requests shifting under you,
and change the slot count without meetings jumping to different times. Older
files are converted on open: v1 (the original single-file prototype, everything
by list position), v2 (`slotCount` + `slotLabels`, meetings by slot position)
and v3 (`dmScores`/`teamScores` graded 1–3: any grade becomes an ask). A v2
`fillGaps` flag is ignored (filling gaps is now one of the alternatives rather
than a switch), as is a v3 `teamFloor` (every board now tries to leave no team
out).
