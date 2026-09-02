// Scheduling logic. Pure functions, no DOM, so it can be tested with `node --test`.
//
// Vocabulary:
//   team / dm      participant ids (strings)
//   score          0..3, how keen one side is to meet the other
//   meeting        { team, dm }            — a pair that should meet
//   placed meeting { team, dm, slot }      — a pair with a time slot
//
// Generating a schedule is two separate steps:
//   1. selectMeetings — decide WHICH pairs meet, respecting the per-person cap
//      (one meeting per slot means at most `slotCount` meetings each).
//   2. assignSlots    — decide WHEN, so nobody is double-booked. Because the
//      graph of teams × decision makers is bipartite, König's edge-colouring
//      theorem guarantees that any selection respecting the cap can always be
//      fitted into `slotCount` slots. So step 1 never has to worry about time.

export const MAX_SCORE = 3;
export const SCORE_LABELS = ['none', 'interested', 'priority', 'must-meet'];

export function pairKey(teamId, dmId) {
  return `${teamId}|${dmId}`;
}

export function scoreOf(scores, teamId, dmId) {
  return scores[pairKey(teamId, dmId)] || 0;
}

/** Every team × dm pair with both scores attached, in list order. */
export function allPairs({ teams, dms, dmScores, teamScores }) {
  const pairs = [];
  teams.forEach((t, ti) => {
    dms.forEach((d, di) => {
      pairs.push({
        team: t.id,
        dm: d.id,
        ti,
        di,
        dmScore: scoreOf(dmScores, t.id, d.id),
        teamScore: scoreOf(teamScores, t.id, d.id),
      });
    });
  });
  return pairs;
}

/** Higher rank = should be scheduled first. DM interest dominates, team interest breaks ties. */
export function rankOf(pair) {
  return pair.dmScore * (MAX_SCORE + 1) + pair.teamScore;
}

/**
 * Decide which meetings should happen.
 *
 * Requested pairs (either side scored > 0) are taken in tiers of descending
 * rank. Within a tier, the pair whose team (then dm) has the fewest meetings
 * so far is taken first, so equal interest is spread fairly instead of by
 * list order. A pair is skipped once either participant already has
 * `slotCount` meetings.
 *
 * With `fillGaps`, pairs nobody asked for are added afterwards, again favouring
 * participants with the fewest meetings, until no more fit.
 *
 * Deterministic: the same input always gives the same selection.
 */
export function selectMeetings({ teams, dms, dmScores, teamScores, slotCount, fillGaps = false }) {
  const load = new Map();
  const loadOf = (id) => load.get(id) || 0;
  const isFull = (p) => loadOf(p.team) >= slotCount || loadOf(p.dm) >= slotCount;
  const chosen = [];

  const pairs = allPairs({ teams, dms, dmScores, teamScores });
  const tiers = new Map();
  for (const p of pairs) {
    const rank = rankOf(p);
    if (!tiers.has(rank)) tiers.set(rank, []);
    tiers.get(rank).push(p);
  }
  const ranks = [...tiers.keys()].filter((r) => r > 0 || fillGaps).sort((a, b) => b - a);

  for (const rank of ranks) {
    const pending = tiers.get(rank).filter((p) => !isFull(p));
    while (pending.length) {
      let best = 0;
      for (let i = 1; i < pending.length; i++) {
        if (compareLoad(pending[i], pending[best]) < 0) best = i;
      }
      const [p] = pending.splice(best, 1);
      if (isFull(p)) continue;
      chosen.push({ team: p.team, dm: p.dm });
      load.set(p.team, loadOf(p.team) + 1);
      load.set(p.dm, loadOf(p.dm) + 1);
    }
  }
  return chosen;

  function compareLoad(a, b) {
    return loadOf(a.team) - loadOf(b.team) || loadOf(a.dm) - loadOf(b.dm) || a.ti - b.ti || a.di - b.di;
  }
}

/**
 * Give every meeting a slot so that no participant has two meetings in the
 * same slot. Bipartite edge colouring with `slotCount` colours: succeeds for
 * any input where nobody has more than `slotCount` meetings. Throws otherwise.
 *
 * Meetings are processed in order and take the earliest slot free for both
 * sides when possible, so higher-priority meetings tend to land earlier.
 */
export function assignSlots(meetings, slotCount) {
  const bySlot = new Map(); // node -> Map(slot -> placed meeting)
  const at = (node) => {
    let m = bySlot.get(node);
    if (!m) bySlot.set(node, (m = new Map()));
    return m;
  };
  const teamNode = (m) => 't:' + m.team;
  const dmNode = (m) => 'd:' + m.dm;
  const otherEnd = (m, node) => (node === teamNode(m) ? dmNode(m) : teamNode(m));
  const freeSlot = (node) => {
    const used = at(node);
    for (let s = 0; s < slotCount; s++) if (!used.has(s)) return s;
    return -1;
  };
  const place = (m, slot) => {
    m.slot = slot;
    at(teamNode(m)).set(slot, m);
    at(dmNode(m)).set(slot, m);
  };
  const unplace = (m) => {
    at(teamNode(m)).delete(m.slot);
    at(dmNode(m)).delete(m.slot);
  };

  const placed = meetings.map((m) => ({ team: m.team, dm: m.dm, slot: -1 }));
  for (const m of placed) {
    const u = teamNode(m);
    const v = dmNode(m);
    const a = freeSlot(u);
    const b = freeSlot(v);
    if (a < 0) throw new Error(`Team ${m.team} has more than ${slotCount} meetings`);
    if (b < 0) throw new Error(`Decision maker ${m.dm} has more than ${slotCount} meetings`);
    if (!at(v).has(a)) {
      place(m, a);
      continue;
    }
    // Slot a is free for the team but taken for the dm. Follow the chain of
    // meetings from the dm that alternate slot a, b, a, b… and swap them. In a
    // bipartite graph this chain can never reach the team (it would have to
    // arrive via slot a, which the team has free), so afterwards a is free for
    // both sides.
    const path = [];
    let node = v;
    let slot = a;
    for (;;) {
      const e = at(node).get(slot);
      if (!e) break;
      path.push(e);
      node = otherEnd(e, node);
      slot = slot === a ? b : a;
    }
    for (const e of path) unplace(e);
    for (const e of path) place(e, e.slot === a ? b : a);
    place(m, a);
  }
  return placed;
}

/** Select and place in one go. */
export function buildSchedule(project, { fillGaps = false } = {}) {
  return assignSlots(selectMeetings({ ...project, fillGaps }), project.slotCount);
}

/**
 * Change what happens at (slot, dm). `teamId === null` frees the cell. If the
 * team is already booked with another dm in that slot, the two meetings swap.
 * Returns a new meetings array.
 */
export function reassign(meetings, slot, dmId, teamId) {
  const current = meetings.find((m) => m.slot === slot && m.dm === dmId) || null;
  const out = meetings.filter((m) => m !== current);
  if (teamId === null) return out;
  const clashIdx = out.findIndex((m) => m.slot === slot && m.team === teamId);
  if (clashIdx >= 0) {
    const clash = out[clashIdx];
    out.splice(clashIdx, 1);
    if (current) out.push({ team: current.team, dm: clash.dm, slot });
  }
  out.push({ team: teamId, dm: dmId, slot });
  return out;
}

/** Lookup structures derived from the meetings list. */
export function indexMeetings(meetings) {
  const byCell = new Map(); // `${slot}|${dm}` -> meeting
  const byTeamSlot = new Map(); // `${slot}|${team}` -> meeting
  const byPair = new Map(); // pairKey -> meeting[]
  for (const m of meetings) {
    byCell.set(`${m.slot}|${m.dm}`, m);
    byTeamSlot.set(`${m.slot}|${m.team}`, m);
    const k = pairKey(m.team, m.dm);
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(m);
  }
  return { byCell, byTeamSlot, byPair };
}

/**
 * Problems a generated schedule never has, but manual editing can introduce:
 * the same pair meeting twice, or someone booked twice in one slot.
 */
export function findIssues(meetings) {
  const issues = [];
  const seenPair = new Map();
  const seenTeamSlot = new Map();
  const seenDmSlot = new Map();
  for (const m of meetings) {
    const k = pairKey(m.team, m.dm);
    if (seenPair.has(k)) issues.push({ type: 'duplicate', team: m.team, dm: m.dm, slots: [seenPair.get(k), m.slot] });
    else seenPair.set(k, m.slot);
    const ts = `${m.slot}|${m.team}`;
    if (seenTeamSlot.has(ts)) issues.push({ type: 'team-clash', team: m.team, slot: m.slot });
    else seenTeamSlot.set(ts, true);
    const ds = `${m.slot}|${m.dm}`;
    if (seenDmSlot.has(ds)) issues.push({ type: 'dm-clash', dm: m.dm, slot: m.slot });
    else seenDmSlot.set(ds, true);
  }
  return issues;
}

/** Headline numbers plus the list of requested pairs that did not get a meeting. */
export function computeStats(project, meetings) {
  const { byPair } = indexMeetings(meetings);
  const pairs = allPairs(project);
  const stats = {
    meetings: meetings.length,
    capacity: project.dms.length * project.slotCount,
    dmRequested: 0,
    dmSatisfied: 0,
    mustMeetRequested: 0,
    mustMeetSatisfied: 0,
    teamRequested: 0,
    teamSatisfied: 0,
    teamOnlyHonoured: 0,
    unrequestedPlaced: 0,
    teamsWithoutMeetings: 0,
    unmet: [],
  };
  for (const p of pairs) {
    const met = byPair.has(pairKey(p.team, p.dm));
    if (p.dmScore > 0) {
      stats.dmRequested++;
      if (met) stats.dmSatisfied++;
    }
    if (p.dmScore === MAX_SCORE) {
      stats.mustMeetRequested++;
      if (met) stats.mustMeetSatisfied++;
    }
    if (p.teamScore > 0) {
      stats.teamRequested++;
      if (met) stats.teamSatisfied++;
    }
    if (met && p.dmScore === 0 && p.teamScore > 0) stats.teamOnlyHonoured++;
    if (met && p.dmScore === 0 && p.teamScore === 0) stats.unrequestedPlaced++;
    if (!met && rankOf(p) > 0) stats.unmet.push(p);
  }
  stats.unmet.sort((a, b) => rankOf(b) - rankOf(a) || a.di - b.di || a.ti - b.ti);
  const teamsMet = new Set(meetings.map((m) => m.team));
  stats.teamsWithoutMeetings = project.teams.filter((t) => !teamsMet.has(t.id)).length;
  return stats;
}
