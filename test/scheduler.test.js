import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectMeetings, assignSlots, buildSchedule, reassign, findIssues, computeStats, pairKey } from '../app/scheduler.js';
import { demoProject, emptyProject, withParticipants, withSlots, withScores, seededRandom, randomScores } from '../app/state.js';

const ids = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}` }));

function project(teamCount, dmCount, slotCount, dmScores = {}, teamScores = {}) {
  return { teams: ids(teamCount, 't'), dms: ids(dmCount, 'd'), slotCount, dmScores, teamScores, meetings: [] };
}

function assertValidPlacement(placed, slotCount) {
  const seen = new Set();
  for (const m of placed) {
    assert.ok(m.slot >= 0 && m.slot < slotCount, `slot ${m.slot} out of range`);
    for (const k of [`t|${m.team}|${m.slot}`, `d|${m.dm}|${m.slot}`]) {
      assert.ok(!seen.has(k), `double booking: ${k}`);
      seen.add(k);
    }
  }
}

test('selectMeetings: DM interest beats team interest, caps respected', () => {
  const p = project(3, 1, 2, { [pairKey('t1', 'd1')]: 1, [pairKey('t2', 'd1')]: 3 }, { [pairKey('t3', 'd1')]: 3 });
  const chosen = selectMeetings(p);
  assert.deepEqual(
    chosen.map((m) => m.team),
    ['t2', 't1'],
  );
});

test('selectMeetings: team-only requests are honoured when there is room', () => {
  const p = project(2, 1, 5, {}, { [pairKey('t1', 'd1')]: 1 });
  assert.deepEqual(selectMeetings(p), [{ team: 't1', dm: 'd1' }]);
});

test('selectMeetings: equal interest is spread to teams with fewer meetings', () => {
  // d1 and d2 each have 1 slot; both like t1 and t2 equally. Fair result: each team gets one.
  const scores = {};
  for (const t of ['t1', 't2']) for (const d of ['d1', 'd2']) scores[pairKey(t, d)] = 2;
  const chosen = selectMeetings(project(2, 2, 1, scores));
  assert.equal(chosen.length, 2);
  assert.deepEqual(new Set(chosen.map((m) => m.team)), new Set(['t1', 't2']));
});

test('selectMeetings: nothing is chosen when nobody asked, unless fillGaps', () => {
  assert.deepEqual(selectMeetings(project(3, 3, 2)), []);
  const filled = selectMeetings({ ...project(2, 2, 2), fillGaps: true });
  assert.equal(filled.length, 4);
  // Greedy selection is not optimal: with 3×3 and 2 slots a perfect 6 exists,
  // but load-balanced greedy paints itself into a corner and finds 5.
  // Kept as documentation; an optimal selector (max-flow) would make this 6.
  assert.equal(selectMeetings({ ...project(3, 3, 2), fillGaps: true }).length, 5);
});

test('selectMeetings is deterministic', () => {
  const p = demoProject(7);
  assert.deepEqual(selectMeetings(p), selectMeetings(p));
});

test('assignSlots: places every meeting without double booking (random graphs)', () => {
  const rand = seededRandom(42);
  for (let trial = 0; trial < 200; trial++) {
    const T = 1 + Math.floor(rand() * 12);
    const D = 1 + Math.floor(rand() * 12);
    const S = 1 + Math.floor(rand() * 8);
    const p = randomScores(withSlots(withParticipants(emptyProject(), ids(T, 'Team ').map((x) => x.name), ids(D, 'DM ').map((x) => x.name)), S, []), rand);
    const chosen = selectMeetings({ ...p, fillGaps: rand() > 0.5 });
    const placed = assignSlots(chosen, S);
    assert.equal(placed.length, chosen.length);
    assertValidPlacement(placed, S);
  }
});

test('assignSlots: handles a 6-cycle that defeats greedy earliest-slot placement', () => {
  // Two slots, everybody has exactly two meetings, arranged in a cycle
  // t1-d1-t2-d2-t3-d3-t1. Greedy earliest-slot in this order puts the first three
  // in slot 0 and then t2-d1, t3-d2 in slot 1 — leaving t1-d3 with no common free
  // slot. Edge colouring recolours the chain and fits all six.
  const meetings = [
    { team: 't1', dm: 'd1' },
    { team: 't2', dm: 'd2' },
    { team: 't3', dm: 'd3' },
    { team: 't2', dm: 'd1' },
    { team: 't3', dm: 'd2' },
    { team: 't1', dm: 'd3' },
  ];
  const placed = assignSlots(meetings, 2);
  assert.equal(placed.length, 6);
  assertValidPlacement(placed, 2);
});

test('assignSlots: throws when someone exceeds the cap', () => {
  assert.throws(() => assignSlots([{ team: 't1', dm: 'd1' }, { team: 't1', dm: 'd2' }], 1), /Team t1/);
});

test('buildSchedule on the demo: every chosen meeting is placed', () => {
  const p = demoProject();
  const chosen = selectMeetings(p);
  const placed = buildSchedule(p);
  assert.equal(placed.length, chosen.length);
  assertValidPlacement(placed, p.slotCount);
  const stats = computeStats(p, placed);
  assert.equal(stats.meetings, placed.length);
  assert.ok(stats.mustMeetSatisfied > 0);
});

test('reassign: frees, assigns, and swaps', () => {
  const start = [
    { team: 't1', dm: 'd1', slot: 0 },
    { team: 't2', dm: 'd2', slot: 0 },
  ];
  const freed = reassign(start, 0, 'd1', null);
  assert.deepEqual(freed, [{ team: 't2', dm: 'd2', slot: 0 }]);

  const swapped = reassign(start, 0, 'd1', 't2');
  assert.deepEqual(new Set(swapped.map((m) => `${m.team}-${m.dm}-${m.slot}`)), new Set(['t2-d1-0', 't1-d2-0']));

  const moved = reassign([{ team: 't1', dm: 'd1', slot: 0 }], 0, 'd2', 't1');
  assert.deepEqual(moved, [{ team: 't1', dm: 'd2', slot: 0 }]);
  assert.deepEqual(findIssues(swapped), []);
});

test('findIssues: reports duplicates and clashes', () => {
  const issues = findIssues([
    { team: 't1', dm: 'd1', slot: 0 },
    { team: 't1', dm: 'd1', slot: 1 },
    { team: 't2', dm: 'd1', slot: 0 },
  ]);
  assert.deepEqual(
    issues.map((i) => i.type),
    ['duplicate', 'dm-clash'],
  );
});

test('computeStats: unmet lists requested pairs that were not scheduled, strongest first', () => {
  const p = project(3, 1, 1, { [pairKey('t1', 'd1')]: 3, [pairKey('t2', 'd1')]: 2 }, { [pairKey('t3', 'd1')]: 1 });
  const placed = buildSchedule(p);
  const stats = computeStats(p, placed);
  assert.equal(stats.mustMeetSatisfied, 1);
  assert.deepEqual(
    stats.unmet.map((u) => u.team),
    ['t2', 't3'],
  );
  assert.equal(stats.teamsWithoutMeetings, 2);
});

test('withScores prunes unknown participants', () => {
  const p = withScores(project(1, 1, 1), { [pairKey('t1', 'd1')]: 2, [pairKey('t9', 'd1')]: 3 }, {});
  assert.deepEqual(Object.keys(p.dmScores), [pairKey('t1', 'd1')]);
});
