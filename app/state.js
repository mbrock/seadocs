// The project model and everything that turns it into/out of text.
// All functions return a new project; nothing here mutates its input.
//
// project = {
//   version: 2,
//   teams: [{ id, name }], dms: [{ id, name }],
//   slotCount, slotLabels: [string],       // labels as typed; missing ones are derived
//   dmScores: { [pairKey]: 1..3 },          // zero scores are simply absent
//   teamScores: { [pairKey]: 1..3 },
//   meetings: [{ team, dm, slot }],
//   fillGaps: boolean,
//   nextId: number,
// }
//
// Participants have stable ids so that renaming the lists, reordering them, or
// deleting one entry never shifts everybody else's interest scores around.

import { MAX_SCORE, pairKey } from './scheduler.js';

export const FORMAT_VERSION = 2;
export const STORAGE_KEY = 'meeting-board/project';
export const MAX_SLOTS = 60;

export function emptyProject() {
  return {
    version: FORMAT_VERSION,
    teams: [],
    dms: [],
    slotCount: 10,
    slotLabels: [],
    dmScores: {},
    teamScores: {},
    meetings: [],
    fillGaps: false,
    nextId: 1,
  };
}

/** One name per line, trimmed, blanks and duplicates dropped. */
export function parseNames(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text).split('\n')) {
    const name = raw.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

export function parseLines(text) {
  return String(text)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function slotLabel(project, slot) {
  return project.slotLabels[slot] || `Slot ${slot + 1}`;
}

export function participantName(project, id) {
  const p = project.teams.find((t) => t.id === id) || project.dms.find((d) => d.id === id);
  return p ? p.name : id;
}

/** Replace the participant lists, keeping ids (and so scores) for names that still exist. */
export function withParticipants(project, teamNames, dmNames) {
  const counter = { next: project.nextId };
  const teams = reconcile(project.teams, teamNames, 't', counter);
  const dms = reconcile(project.dms, dmNames, 'd', counter);
  return prune({ ...project, teams, dms, nextId: counter.next });
}

function reconcile(existing, names, prefix, counter) {
  const byName = new Map(existing.map((p) => [p.name, p]));
  return names.map((name) => byName.get(name) || { id: `${prefix}${counter.next++}`, name });
}

export function withSlots(project, slotCount, slotLabels) {
  const n = Math.min(MAX_SLOTS, Math.max(1, Math.floor(Number(slotCount)) || 1));
  return prune({ ...project, slotCount: n, slotLabels: [...slotLabels] });
}

/** Drop scores and meetings that refer to participants or slots that no longer exist. */
function prune(project) {
  const teamIds = new Set(project.teams.map((t) => t.id));
  const dmIds = new Set(project.dms.map((d) => d.id));
  const keep = (scores) =>
    Object.fromEntries(
      Object.entries(scores).filter(([k, v]) => {
        const [t, d] = k.split('|');
        return v > 0 && teamIds.has(t) && dmIds.has(d);
      }),
    );
  const meetings = project.meetings.filter((m) => teamIds.has(m.team) && dmIds.has(m.dm) && m.slot < project.slotCount);
  return { ...project, dmScores: keep(project.dmScores), teamScores: keep(project.teamScores), meetings };
}

/** kind is 'dm' or 'team'. */
export function withScore(project, kind, teamId, dmId, score) {
  const field = kind === 'dm' ? 'dmScores' : 'teamScores';
  const scores = { ...project[field] };
  const k = pairKey(teamId, dmId);
  if (score > 0) scores[k] = score;
  else delete scores[k];
  return { ...project, [field]: scores };
}

export function cycleScore(project, kind, teamId, dmId) {
  const field = kind === 'dm' ? 'dmScores' : 'teamScores';
  const cur = project[field][pairKey(teamId, dmId)] || 0;
  return withScore(project, kind, teamId, dmId, (cur + 1) % (MAX_SCORE + 1));
}

export function withScores(project, dmScores, teamScores) {
  return prune({ ...project, dmScores, teamScores });
}

export function withMeetings(project, meetings) {
  return { ...project, meetings };
}

// ---------- Files ----------

export function serialize(project) {
  return JSON.stringify({ ...project, version: FORMAT_VERSION, savedAt: new Date().toISOString() }, null, 1);
}

/** Accepts v2 files and the v1 files written by the original single-file prototype. */
export function deserialize(text) {
  const d = JSON.parse(text);
  if (!d || typeof d !== 'object' || !Array.isArray(d.teams) || !Array.isArray(d.dms)) {
    throw new Error('Not a Meeting Board project file');
  }
  if (d.version === 1 || d.teams.some((t) => typeof t === 'string')) return fromV1(d);

  const isParticipant = (p) => p && typeof p.id === 'string' && typeof p.name === 'string';
  if (!d.teams.every(isParticipant) || !d.dms.every(isParticipant)) {
    throw new Error('Participants are malformed');
  }
  const base = emptyProject();
  const project = {
    ...base,
    teams: d.teams.map(({ id, name }) => ({ id, name })),
    dms: d.dms.map(({ id, name }) => ({ id, name })),
    slotCount: Number(d.slotCount) || base.slotCount,
    slotLabels: Array.isArray(d.slotLabels) ? d.slotLabels.map(String) : [],
    dmScores: cleanScores(d.dmScores),
    teamScores: cleanScores(d.teamScores),
    meetings: Array.isArray(d.meetings) ? d.meetings.filter(isMeeting) : [],
    fillGaps: Boolean(d.fillGaps),
    nextId: Number(d.nextId) || 1,
  };
  return prune(project);
}

function isMeeting(m) {
  return m && typeof m.team === 'string' && typeof m.dm === 'string' && Number.isInteger(m.slot) && m.slot >= 0;
}

function cleanScores(scores) {
  if (!scores || typeof scores !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(scores)) {
    const n = Number(v);
    if (n >= 1 && n <= MAX_SCORE) out[k] = Math.floor(n);
  }
  return out;
}

function fromV1(d) {
  const teams = d.teams.map((name, i) => ({ id: `t${i + 1}`, name: String(name) }));
  const dms = d.dms.map((name, i) => ({ id: `d${i + 1}`, name: String(name) }));
  const convert = (scores) => {
    const out = {};
    for (const [k, v] of Object.entries(scores || {})) {
      const [ti, di] = k.split('_').map(Number);
      if (teams[ti] && dms[di] && v > 0) out[pairKey(teams[ti].id, dms[di].id)] = Math.min(MAX_SCORE, v);
    }
    return out;
  };
  const meetings = [];
  (Array.isArray(d.schedule) ? d.schedule : []).forEach((row, slot) => {
    (row || []).forEach((ti, di) => {
      if (ti !== null && teams[ti] && dms[di]) meetings.push({ team: teams[ti].id, dm: dms[di].id, slot });
    });
  });
  return prune({
    ...emptyProject(),
    teams,
    dms,
    slotCount: Number(d.slotCount) || 10,
    slotLabels: Array.isArray(d.slotLabels) ? d.slotLabels.map(String) : [],
    dmScores: convert(d.dmScores),
    teamScores: convert(d.teamScores),
    meetings,
    nextId: teams.length + dms.length + 1,
  });
}

// ---------- Browser storage ----------

export function loadLocal(storage = globalThis.localStorage) {
  try {
    const text = storage && storage.getItem(STORAGE_KEY);
    return text ? deserialize(text) : null;
  } catch {
    return null;
  }
}

export function saveLocal(project, storage = globalThis.localStorage) {
  try {
    storage && storage.setItem(STORAGE_KEY, serialize(project));
  } catch {
    // Storage full or unavailable: the in-memory project still works.
  }
}

export function clearLocal(storage = globalThis.localStorage) {
  try {
    storage && storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------- Demo data ----------

/** Small deterministic PRNG so the demo looks the same every time. */
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomScores(project, rand = Math.random) {
  const draw = () => {
    const r = rand();
    if (r > 0.94) return 3;
    if (r > 0.8) return 2;
    if (r > 0.55) return 1;
    return 0;
  };
  const dmScores = {};
  const teamScores = {};
  for (const t of project.teams) {
    for (const d of project.dms) {
      const a = draw();
      const b = draw();
      if (a) dmScores[pairKey(t.id, d.id)] = a;
      if (b) teamScores[pairKey(t.id, d.id)] = b;
    }
  }
  return withScores(project, dmScores, teamScores);
}

export function demoProject(seed = 20260902) {
  const teams = Array.from({ length: 26 }, (_, i) => `Team ${String.fromCharCode(65 + i)}`);
  const dms = Array.from({ length: 26 }, (_, i) => `DM ${i + 1}`);
  let p = withParticipants(emptyProject(), teams, dms);
  p = withSlots(p, 12, []);
  return randomScores(p, seededRandom(seed));
}
