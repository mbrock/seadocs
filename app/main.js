// Wires the page to the model. All state lives in `project`; every change goes
// through commit(), which saves to localStorage and re-renders the visible panel.

import * as S from './state.js';
import { buildSchedule, computeStats, findIssues, reassign } from './scheduler.js';
import * as R from './render.js';

let project = S.loadLocal() || S.emptyProject();
let activeTab = 'setup';
let matrixMode = 'dm';
let personSelection = null;

const $ = (id) => document.getElementById(id);

function commit(next) {
  project = next;
  S.saveLocal(project);
  render();
}

// ---------- Rendering ----------

function render() {
  $('headerStamp').textContent = R.headerStamp(project);
  if (activeTab === 'prefs') renderPrefs();
  if (activeTab === 'schedule') renderSchedule();
  if (activeTab === 'person') renderPerson();
}

function syncSetupInputs() {
  $('teamsInput').value = project.teams.map((t) => t.name).join('\n');
  $('dmsInput').value = project.dms.map((d) => d.name).join('\n');
  $('slotCount').value = project.slotCount;
  $('slotLabels').value = project.slotLabels.join('\n');
  $('fillGaps').checked = project.fillGaps;
}

function renderPrefs() {
  document.querySelectorAll('#matrixTabs .tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === matrixMode));
  $('matrixModeHint').innerHTML = R.MATRIX_HINTS[matrixMode];
  $('matrixWrap').innerHTML = R.renderMatrix(project, matrixMode);
}

function renderSchedule() {
  const hasBoard = project.meetings.length > 0;
  const stats = computeStats(project, project.meetings);
  $('statsWrap').innerHTML = hasBoard ? R.renderStats(stats) : '';
  $('unmetWrap').innerHTML = hasBoard ? R.renderUnmet(project, stats) : '';
  $('issuesWrap').innerHTML = R.renderIssues(project, findIssues(project.meetings));
  $('boardWrap').innerHTML = R.renderBoard(project);
}

function renderPerson() {
  const valid = personSelection && (project.teams.some((t) => 't:' + t.id === personSelection) || project.dms.some((d) => 'd:' + d.id === personSelection));
  if (!valid) personSelection = project.teams[0] ? 't:' + project.teams[0].id : project.dms[0] ? 'd:' + project.dms[0].id : null;
  $('personSelect').innerHTML = R.renderPersonOptions(project, personSelection);
  $('personWrap').innerHTML = R.renderPersonSchedule(project, personSelection);
}

function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#tabs .tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
  render();
}

function stamp(id, text) {
  $(id).textContent = text;
}

// ---------- Setup ----------

function applySetup() {
  let next = S.withParticipants(project, S.parseNames($('teamsInput').value), S.parseNames($('dmsInput').value));
  next = S.withSlots(next, $('slotCount').value, S.parseLines($('slotLabels').value));
  commit(next);
  syncSetupInputs();
  stamp('setupStamp', `Saved: ${next.teams.length} teams, ${next.dms.length} decision makers, ${next.slotCount} slots.`);
}

function loadDemo() {
  commit(S.demoProject());
  syncSetupInputs();
  stamp('setupStamp', 'Demo data loaded — see Interest and Schedule.');
}

// ---------- Files ----------

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function saveProject() {
  if (!project.teams.length && !project.dms.length) {
    stamp('saveStamp', 'Nothing to save yet.');
    return;
  }
  download(`meeting-board-${new Date().toISOString().slice(0, 10)}.json`, S.serialize(project), 'application/json');
  stamp('saveStamp', 'saved ' + new Date().toLocaleTimeString());
}

function openProject(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      commit(S.deserialize(reader.result));
      syncSetupInputs();
      personSelection = null;
      stamp('saveStamp', 'opened ' + file.name);
    } catch (err) {
      stamp('saveStamp', `Could not read ${file.name}: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function resetProject() {
  if (!confirm('Start over? This clears participants, interest and the schedule from this browser.')) return;
  S.clearLocal();
  commit(S.emptyProject());
  syncSetupInputs();
  personSelection = null;
  stamp('saveStamp', 'cleared');
  stamp('setupStamp', '');
  showTab('setup');
}

// ---------- Events ----------

$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (btn) showTab(btn.dataset.tab);
});

$('matrixTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  matrixMode = btn.dataset.mode;
  renderPrefs();
});

$('matrixWrap').addEventListener('click', (e) => {
  const cell = e.target.closest('.score-cell');
  if (cell) commit(S.cycleScore(project, matrixMode, cell.dataset.team, cell.dataset.dm));
});

$('boardWrap').addEventListener('change', (e) => {
  const sel = e.target.closest('select.cellselect');
  if (!sel) return;
  const team = sel.value === '' ? null : sel.value;
  commit(S.withMeetings(project, reassign(project.meetings, Number(sel.dataset.slot), sel.dataset.dm, team)));
});

$('personSelect').addEventListener('change', (e) => {
  personSelection = e.target.value;
  renderPerson();
});

$('applySetupBtn').addEventListener('click', applySetup);
$('loadDemoBtn').addEventListener('click', loadDemo);
$('randomizeBtn').addEventListener('click', () => {
  if (!project.teams.length || !project.dms.length) return;
  commit(S.randomScores(project));
});
$('clearScoresBtn').addEventListener('click', () => {
  if (confirm('Clear both interest grids?')) commit(S.withScores(project, {}, {}));
});
$('fillGaps').addEventListener('change', (e) => commit({ ...project, fillGaps: e.target.checked }));
$('generateBtn').addEventListener('click', () => {
  if (!project.teams.length || !project.dms.length) {
    $('boardWrap').innerHTML = '<p class="hint">Add participants in Setup first.</p>';
    return;
  }
  commit(S.withMeetings(project, buildSchedule(project, { fillGaps: project.fillGaps })));
});
$('exportBoardBtn').addEventListener('click', () => {
  if (project.meetings.length) download('meeting-board.csv', R.boardCsv(project), 'text/csv');
});
$('exportPersonalBtn').addEventListener('click', () => {
  if (project.meetings.length) download('meeting-board-personal.csv', R.personalCsv(project), 'text/csv');
});
$('printBtn').addEventListener('click', () => window.print());
$('saveProjectBtn').addEventListener('click', saveProject);
$('openProjectBtn').addEventListener('click', () => $('loadFile').click());
$('loadFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) openProject(file);
  e.target.value = '';
});
$('resetBtn').addEventListener('click', resetProject);

// ---------- Start ----------

syncSetupInputs();
render();
