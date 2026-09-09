# Meeting Board

A small browser tool for scheduling one-to-one meetings at a festival
marketplace: **project teams** (artists, companies, producers pitching work)
meet **decision makers** (programmers, commissioners, funders) in short, fixed
time slots. Given who wants to meet whom, it builds the board — which team sits
with which decision maker in which slot.

It is a static site with no server. Everything stays in the browser (autosaved
to localStorage); projects are saved as JSON files you can email to a colleague.
The interface follows the browser's light or dark system preference.

## What it does

Setup and the generated board share one page. The header bar holds undo / redo,
save / export / open / new, the sample loader, and the action that clears all
requests, and shows a problem count linking to the board when it has one. With
no saved browser state, the sample day is loaded automatically.

- **Two festival days** — Day 1 / Day 2 share one decision-maker roster and
  are saved, opened, and autosaved together in one file. Each day has its own
  film teams, title, requests, time slots, availability and board. Renaming a
  decision maker updates both days; removing one prunes their meetings and
  requests on both days. Building or editing a board only affects the selected
  day. Switching days cancels a running build. Undo/redo covers the whole festival.
  Existing single-day files become Day 1 without changing their times or board;
  Day 2 starts with no teams or meetings.
- **Setup** — “Edit setup” opens three multiline lists on the same page:
  decision makers, film teams, and time slots, plus the event/day title.
  Apply saves them as one undoable change; Cancel discards the draft.
  Line position preserves identity, so simultaneous renames keep requests,
  availability and meetings. Inserting, deleting or reordering lines reassigns
  those positions; removed trailing entries are pruned. Blank lines and duplicate
  participant names are ignored. There must be 1–60 time slots.
  New days default to twelve 15-minute slots from 15:00 (an editable starting
  point, not an assumed festival timetable). The 15-minute generator accepts a
  start time and slot count; the resulting time ranges can be edited to leave
  breaks. There is no 27-person roster limit; the solver is tested with 27
  decision makers and 13 film teams per day.
  Two read-only-name request matrices sit beside each other when the viewport
  is wide enough and wrap otherwise. Changing a request takes effect immediately
  but does not rebuild the board. A green or blue
  square means that side requested the meeting; its check mark means the current
  schedule fulfills it.
  Names use
  `Name | Organisation, Country`; the country becomes a small tag
  and names are shortened to "J. Cornejo" in dense tables, while project titles
  get a one-word code — "The Crust of Europe" → Europe, "Evening School" →
  Evening — the way a crew refers to films it knows by heart; write
  `Title = Code` or `Name = Code` to choose the short form yourself; a
  trailing `*` marks someone who joins online. Not asked is not a refusal;
  it only means nobody asked, and the board still fills those seats so that
  everyone gets to meet. Decision-maker
  interest is the primary signal; team interest is
  secondary: it is heard once every decision maker has been served as well as
  possible, and lets a team ask for a meeting the decision maker didn't request
  (placed if there's room).
- **Board** — “Build schedule” explicitly starts the local CP-SAT solver,
  giving each of its nine objective stages up to one second. Rebuilding an
  existing board asks for confirmation: meetings may move and removed meetings
  may return. The whole build is undoable. Any project edit or Undo cancels an
  in-flight build; Cancel build leaves the existing board intact. No automatic
  solving happens on loading, editing requests, or changing availability.
  Both board orientations are always visible: decision makers × slots and teams
  × slots. A green dot means the decision maker asked for the meeting, a blue
  dot means the team asked, and a hatched cell is a slot that person cannot do.
  Red is reserved for problems.
  Click any cell to open a visible editor drawer, with full names, search,
  and Undo/Redo. Remove leaves a gap without rearranging other meetings.
  Select a replacement to preview its effect, then confirm the booking or
  swap. All counterparts appear, strongest request first; unavailable or
  repeated pairs are disabled with a reason. Moving a meeting requires an
  explicit confirmation and only offers times when both people are free.
  The time selector browses this person's slots without moving any meetings.
  The same editor records that someone **can't do a slot** — blocking
  the cell also removes any meeting there. Export is disabled while problems
  remain. The solver runs entirely in a Web Worker in this browser and never
  uploads roster or interest data.
- **Individual schedules** — select any decision maker or film team below the
  board to preview their schedule, copy or download plain text, or download a
  formatted RTF document for Word / Google Docs. Exports use the current board,
  full names, the event title, and every slot in order, including free and
  unavailable times. Decision-maker exports include both days with explicit day
  headings; film-team exports include only the selected day. The toolbar CSV
  exports the selected day, while “Save both days” saves the whole festival.
Every change is undoable (Ctrl/Cmd+Z, Shift for redo).

## The sample day

*BSD 2026 sample day* from the header fills in a realistic instance: the 13
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

The first requested build lazily loads the portable WebAssembly build of
`cpsat-js@1.3.0` in an app-owned module Worker. The model decides whether each
team × decision-maker pair meets **and** its slot together, so availability,
one meeting per person per slot, and pair uniqueness are hard constraints
rather than assumptions made before placement. Every returned board is checked
again by ordinary TypeScript before it can replace the board on screen.
While solving, the Worker sends structured loading, model-building, stage,
incumbent, bound and completion status objects to the main thread and renders
detailed `[CP-SAT]` lines in the browser console.

Optimization uses clear sequential objectives rather than a hidden weighted
score. Phase A maximizes mutual requests, then DM requests, teams receiving at
least one meeting, team requests, and total meetings. Each proven optimum or
time-limited incumbent value becomes the next stage's constraint. Phase B
rebuilds the full selectable pair × slot model, then balances fulfilled DM
requests, balances total meetings per DM, minimizes DM gaps, and finally
favors unchanged current-board cells. Each fairness stage minimizes the sum
of squared per-DM counts: spreading two meetings as 1 + 1 is preferred over
2 + 0. This balances counts, not percentages of requests fulfilled. Earlier
request and meeting totals remain protected; availability is always hard.
Fairness is best-effort within the time limit, not a promise of equal schedules
or a requested meeting for everyone. It
does not freeze Phase A pair choices. There is no cap on meetings a decision
maker did not ask for: everyone is at the event to meet, so a request is a
priority, not a permission. The request stages run first and are locked in as
floors, then the "total meetings" stage fills every remaining seat with
introductions nobody asked for. On the board these fillers are the cells
without a coloured dot, so you can see at a glance which meetings were wanted
and which are the mingling.

Manual edits never invoke the solver: Remove leaves both participants free;
“Move this meeting” offers times when both people are free and available;
replacement candidates describe their local swap or displacement. The entire
board stays stable until an explicit rebuild, rather than requiring pins for
ordinary editing. Current project files do not distinguish locks/pins from
editable board cells, so on rebuild manual cells are stability preferences,
not hidden hard locks. If lock/pin
fields are added later they must become explicit hard constraints and validator
checks. Team coverage remains a higher priority than DM balancing; the fairness
stages do not reduce the number of teams served to equalize DM schedules.
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
src/App.tsx                page layout, project history (undo/redo), localStorage autosave
src/components/ui.tsx      shared pieces: Button, RequestMark, Name
src/components/useNames.ts       display names by participant id
src/components/useScheduleSolve.ts explicitly requested Worker solve; cancellation and progress
src/components/Toolbar.tsx       solver progress, problems, undo / redo, save / export / open / new / sample
src/components/DaySetup.tsx      bulk roster, title and time-slot editor
src/components/SetupPanel.tsx    request matrices with read-only names
src/components/ParticipantExport.tsx individual schedule preview and downloads
src/components/BoardPanel.tsx    both board grids and the selected cell
src/components/Inspector.tsx     the selected cell: who is there and who could be
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

### Festival file format (v6)

The file has `version: 6`, a single `dms` array (names/codes/online flags), and
exactly two `days`. Each day contains `title`, `teams`, `slots`, `dmAsks`,
`teamAsks`, `meetings`, `nextId`, and `dmUnavailable` (DM ID → slot IDs).
Asks are objects mapping pair keys to `true`. Team availability remains on each
day's team records. Shared DM records never contain day-specific availability.
`festival.ts` adapts a day to the single-day solver model; `festivalPersist.ts`
handles festival files and imports v1–v5 files through the legacy loader.

### Legacy single-day file format (v5, still accepted on Open)

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
