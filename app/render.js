// HTML rendering. Every function takes data and returns a string; main.js puts
// it in the page. All user-supplied text goes through esc().

import { SCORE_LABELS, scoreOf, indexMeetings, pairKey } from './scheduler.js';
import { slotLabel, participantName } from './state.js';

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function headerStamp(project) {
  if (!project.teams.length && !project.dms.length) return 'empty project';
  const parts = [`${project.teams.length} teams`, `${project.dms.length} decision makers`, `${project.slotCount} slots`];
  if (project.meetings.length) parts.push(`${project.meetings.length} meetings`);
  return parts.join(' · ');
}

export const MATRIX_HINTS = {
  dm: 'Rows = decision makers, columns = teams. Click a cell to record how keen <em>that decision maker</em> is to meet <em>that team</em>.',
  team: 'Rows = decision makers, columns = teams. Click a cell to record how keen <em>that team</em> is to meet <em>that decision maker</em>. Used to break ties, and to request meetings the decision maker did not ask for.',
};

export function renderMatrix(project, mode) {
  if (!project.teams.length || !project.dms.length) return '<p class="hint">Add participants in Setup first.</p>';
  const scores = mode === 'dm' ? project.dmScores : project.teamScores;
  let html = '<table class="matrix"><thead><tr><th class="corner">DM \\ Team</th>';
  for (const t of project.teams) html += `<th title="${esc(t.name)}">${esc(t.name)}</th>`;
  html += '</tr></thead><tbody>';
  for (const d of project.dms) {
    html += `<tr><td class="dmname">${esc(d.name)}</td>`;
    for (const t of project.teams) {
      const s = scoreOf(scores, t.id, d.id);
      html += `<td class="score-cell s${s}" data-team="${esc(t.id)}" data-dm="${esc(d.id)}" title="${esc(d.name)} × ${esc(t.name)}: ${SCORE_LABELS[s]}">${s || ''}</td>`;
    }
    html += '</tr>';
  }
  return html + '</tbody></table>';
}

export function renderStats(stats) {
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const stat = (num, lbl) => `<div class="stat"><span class="num">${num}</span><span class="lbl">${lbl}</span></div>`;
  return `<div class="stat-row">
    ${stat(stats.meetings, 'meetings placed')}
    ${stat(`${stats.dmSatisfied}/${stats.dmRequested}`, `DM interest met (${pct(stats.dmSatisfied, stats.dmRequested)}%)`)}
    ${stat(`${stats.mustMeetSatisfied}/${stats.mustMeetRequested}`, 'DM must-meets scheduled')}
    ${stat(`${stats.teamSatisfied}/${stats.teamRequested}`, `team interest met (${pct(stats.teamSatisfied, stats.teamRequested)}%)`)}
    ${stat(stats.teamOnlyHonoured, 'team-only requests honoured')}
    ${stat(stats.teamsWithoutMeetings, 'teams with no meetings')}
    ${stat(`${pct(stats.meetings, stats.capacity)}%`, 'board capacity used')}
  </div>`;
}

export function renderUnmet(project, stats) {
  if (!stats.unmet.length) return '<p class="hint">Every requested meeting was scheduled.</p>';
  const items = stats.unmet
    .map((p) => {
      const who = p.dmScore > 0 ? `${esc(participantName(project, p.dm))} → ${esc(participantName(project, p.team))}` : `${esc(participantName(project, p.team))} → ${esc(participantName(project, p.dm))}`;
      const why = p.dmScore > 0 ? `DM: ${SCORE_LABELS[p.dmScore]}${p.teamScore ? `, team: ${SCORE_LABELS[p.teamScore]}` : ''}` : `team only: ${SCORE_LABELS[p.teamScore]}`;
      return `<li>${who} <small>(${why})</small></li>`;
    })
    .join('');
  return `<details class="unmet"><summary>${stats.unmet.length} requested meeting${stats.unmet.length === 1 ? '' : 's'} did not fit — show</summary><ul>${items}</ul></details>`;
}

export function renderIssues(project, issues) {
  if (!issues.length) return '';
  const items = issues
    .map((i) => {
      if (i.type === 'duplicate') return `<li>${esc(participantName(project, i.team))} and ${esc(participantName(project, i.dm))} meet twice (${i.slots.map((s) => esc(slotLabel(project, s))).join(' and ')}).</li>`;
      if (i.type === 'team-clash') return `<li>${esc(participantName(project, i.team))} is booked twice in ${esc(slotLabel(project, i.slot))}.</li>`;
      return `<li>${esc(participantName(project, i.dm))} is booked twice in ${esc(slotLabel(project, i.slot))}.</li>`;
    })
    .join('');
  return `<div class="issues"><strong>Check these:</strong><ul>${items}</ul></div>`;
}

export function renderBoard(project) {
  if (!project.meetings.length) return '<p class="hint">Nothing generated yet.</p>';
  const { byCell, byTeamSlot, byPair } = indexMeetings(project.meetings);
  let html = '<table class="board"><thead><tr><th>Slot</th>';
  for (const d of project.dms) html += `<th>${esc(d.name)}</th>`;
  html += '</tr></thead><tbody>';
  for (let slot = 0; slot < project.slotCount; slot++) {
    html += `<tr><td class="slotlabel">${esc(slotLabel(project, slot))}</td>`;
    for (const d of project.dms) {
      const m = byCell.get(`${slot}|${d.id}`);
      html += `<td>${cellSelect(project, slot, d, m ? m.team : null, byTeamSlot, byPair)}</td>`;
    }
    html += '</tr>';
  }
  return html + '</tbody></table>';
}

function cellSelect(project, slot, dm, currentTeam, byTeamSlot, byPair) {
  let opts = '<option value="">— free —</option>';
  for (const t of project.teams) {
    let label = t.name;
    const busy = byTeamSlot.get(`${slot}|${t.id}`);
    if (busy && t.id !== currentTeam) label += ` ⇄ swap (now with ${participantName(project, busy.dm)})`;
    else if (t.id !== currentTeam && byPair.has(pairKey(t.id, dm.id))) label += ' (already meeting)';
    opts += `<option value="${esc(t.id)}"${t.id === currentTeam ? ' selected' : ''}>${esc(label)}</option>`;
  }
  const classes = ['cellselect'];
  if (currentTeam !== null) {
    classes.push('filled', `dm-s${scoreOf(project.dmScores, currentTeam, dm.id)}`);
    if ((byPair.get(pairKey(currentTeam, dm.id)) || []).length > 1) classes.push('problem');
  }
  return `<select class="${classes.join(' ')}" data-slot="${slot}" data-dm="${esc(dm.id)}">${opts}</select>`;
}

export function renderPersonOptions(project, selected) {
  const group = (label, list, prefix) =>
    `<optgroup label="${label}">${list
      .map((p) => `<option value="${prefix}${esc(p.id)}"${prefix + p.id === selected ? ' selected' : ''}>${esc(p.name)}</option>`)
      .join('')}</optgroup>`;
  return group('Teams', project.teams, 't:') + group('Decision makers', project.dms, 'd:');
}

/** selection is 't:<id>' or 'd:<id>'. */
export function renderPersonSchedule(project, selection) {
  if (!selection) return '<p class="hint">Add participants first.</p>';
  if (!project.meetings.length) return '<p class="hint">Generate a schedule first.</p>';
  const isTeam = selection.startsWith('t:');
  const id = selection.slice(2);
  const { byCell, byTeamSlot } = indexMeetings(project.meetings);
  let html = `<h3>${esc(participantName(project, id))}</h3><ul class="person-sched">`;
  for (let slot = 0; slot < project.slotCount; slot++) {
    const m = isTeam ? byTeamSlot.get(`${slot}|${id}`) : byCell.get(`${slot}|${id}`);
    const other = m ? esc(participantName(project, isTeam ? m.dm : m.team)) : '<span class="free">free</span>';
    html += `<li><span class="slot">${esc(slotLabel(project, slot))}</span><span>${other}</span></li>`;
  }
  return html + '</ul>';
}

// ---------- CSV ----------

function csv(rows) {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function boardCsv(project) {
  const { byCell } = indexMeetings(project.meetings);
  const rows = [['Slot', ...project.dms.map((d) => d.name)]];
  for (let slot = 0; slot < project.slotCount; slot++) {
    rows.push([
      slotLabel(project, slot),
      ...project.dms.map((d) => {
        const m = byCell.get(`${slot}|${d.id}`);
        return m ? participantName(project, m.team) : '';
      }),
    ]);
  }
  return csv(rows);
}

export function personalCsv(project) {
  const { byCell, byTeamSlot } = indexMeetings(project.meetings);
  const rows = [['Who', 'Role', 'Slot', 'Meets']];
  for (const t of project.teams) {
    for (let slot = 0; slot < project.slotCount; slot++) {
      const m = byTeamSlot.get(`${slot}|${t.id}`);
      rows.push([t.name, 'Team', slotLabel(project, slot), m ? participantName(project, m.dm) : '']);
    }
  }
  for (const d of project.dms) {
    for (let slot = 0; slot < project.slotCount; slot++) {
      const m = byCell.get(`${slot}|${d.id}`);
      rows.push([d.name, 'Decision maker', slotLabel(project, slot), m ? participantName(project, m.team) : '']);
    }
  }
  return csv(rows);
}
