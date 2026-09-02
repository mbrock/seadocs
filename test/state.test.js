import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, parseNames, withParticipants, withSlots, cycleScore, serialize, deserialize, slotLabel, demoProject } from '../app/state.js';
import { pairKey } from '../app/scheduler.js';

test('parseNames trims, drops blanks and duplicates', () => {
  assert.deepEqual(parseNames(' A \n\nB\nA\n  '), ['A', 'B']);
});

test('withParticipants keeps ids for names that survive, so scores survive too', () => {
  let p = withParticipants(emptyProject(), ['Alpha', 'Beta'], ['Fund X']);
  const alpha = p.teams[0].id;
  const fund = p.dms[0].id;
  p = cycleScore(p, 'dm', alpha, fund);
  p = cycleScore(p, 'dm', alpha, fund);
  assert.equal(p.dmScores[pairKey(alpha, fund)], 2);

  // Remove Beta, add Gamma, reorder: Alpha keeps its id and score.
  p = withParticipants(p, ['Gamma', 'Alpha'], ['Fund X']);
  assert.equal(p.teams[1].id, alpha);
  assert.equal(p.dmScores[pairKey(alpha, fund)], 2);
  assert.notEqual(p.teams[0].id, alpha);
  assert.equal(p.teams.length, 2);
});

test('withParticipants prunes scores and meetings for removed people', () => {
  let p = withParticipants(emptyProject(), ['A', 'B'], ['X']);
  const [a, b] = p.teams.map((t) => t.id);
  const x = p.dms[0].id;
  p = cycleScore(p, 'dm', b, x);
  p = { ...p, meetings: [{ team: b, dm: x, slot: 0 }, { team: a, dm: x, slot: 1 }] };
  p = withParticipants(p, ['A'], ['X']);
  assert.deepEqual(p.dmScores, {});
  assert.deepEqual(p.meetings, [{ team: a, dm: x, slot: 1 }]);
});

test('withSlots clamps and drops meetings past the new end', () => {
  let p = withParticipants(emptyProject(), ['A'], ['X']);
  p = { ...p, meetings: [{ team: p.teams[0].id, dm: p.dms[0].id, slot: 5 }] };
  p = withSlots(p, 3, ['09:00']);
  assert.equal(p.slotCount, 3);
  assert.deepEqual(p.meetings, []);
  assert.equal(slotLabel(p, 0), '09:00');
  assert.equal(slotLabel(p, 2), 'Slot 3');
  assert.equal(withSlots(p, 0, []).slotCount, 1);
  assert.equal(withSlots(p, 'abc', []).slotCount, 1);
});

test('cycleScore wraps 0→1→2→3→0 and removes zero entries', () => {
  let p = withParticipants(emptyProject(), ['A'], ['X']);
  const k = pairKey(p.teams[0].id, p.dms[0].id);
  for (const expected of [1, 2, 3]) {
    p = cycleScore(p, 'team', p.teams[0].id, p.dms[0].id);
    assert.equal(p.teamScores[k], expected);
  }
  p = cycleScore(p, 'team', p.teams[0].id, p.dms[0].id);
  assert.equal(k in p.teamScores, false);
});

test('serialize/deserialize round-trips', () => {
  const p = demoProject(3);
  const back = deserialize(serialize(p));
  for (const key of ['teams', 'dms', 'slotCount', 'slotLabels', 'dmScores', 'teamScores', 'meetings', 'fillGaps', 'nextId']) {
    assert.deepEqual(back[key], p[key], key);
  }
});

test('deserialize reads v1 files from the original prototype', () => {
  const v1 = {
    version: 1,
    teams: ['Team A', 'Team B'],
    dms: ['DM 1', 'DM 2'],
    slotCount: 2,
    slotLabels: ['09:00', '09:20'],
    dmScores: { '0_1': 3, '1_0': 1 },
    teamScores: { '1_1': 2 },
    schedule: [
      [1, 0],
      [null, null],
    ],
  };
  const p = deserialize(JSON.stringify(v1));
  assert.deepEqual(
    p.teams.map((t) => t.name),
    ['Team A', 'Team B'],
  );
  const [a, b] = p.teams.map((t) => t.id);
  const [d1, d2] = p.dms.map((d) => d.id);
  assert.equal(p.dmScores[pairKey(a, d2)], 3);
  assert.equal(p.dmScores[pairKey(b, d1)], 1);
  assert.equal(p.teamScores[pairKey(b, d2)], 2);
  assert.deepEqual(p.meetings, [
    { team: b, dm: d1, slot: 0 },
    { team: a, dm: d2, slot: 0 },
  ]);
  assert.equal(p.slotLabels[1], '09:20');
});

test('deserialize rejects junk', () => {
  assert.throws(() => deserialize('{"hello":1}'), /Not a Meeting Board/);
  assert.throws(() => deserialize('[]'), /Not a Meeting Board/);
});
