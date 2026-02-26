const byId = (id) => document.getElementById(id);

async function fetchJson(url, options = undefined) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : {};
  if (!res.ok) {
    const detail = body?.detail || `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body;
}

function nowText() {
  return new Date().toLocaleString('ko-KR', { hour12: false });
}

function showMessage(id, text, ok = true) {
  const el = byId(id);
  el.textContent = text;
  el.style.color = ok ? '#9fb0ca' : '#e05d6f';
}

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
      byId(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function renderRows(bodyId, emptyId, rows) {
  const body = byId(bodyId);
  const empty = byId(emptyId);
  body.innerHTML = rows.join('');
  empty.hidden = rows.length > 0;
}

function renderOverview(data) {
  byId('playersTotal').textContent = data.players_total ?? '-';
  byId('matchesTotal').textContent = data.matches_total ?? '-';
  byId('matchesDone').textContent = data.matches_done ?? '-';
  byId('matchesPending').textContent = data.matches_pending_approval ?? '-';
}

function statusText(status) {
  if (status === 'done') return '확정';
  if (status === 'pending_approval') return '승인대기';
  if (status === 'disputed') return '이의제기';
  return '대기';
}

function statusClass(status) {
  if (!status) return 'status-pending';
  return `status-${status}`;
}

async function loadDashboard() {
  const limit = Number(byId('limitSelect').value);
  const [overview, ranking] = await Promise.all([
    fetchJson('/dashboard/overview'),
    fetchJson(`/ranking?limit=${limit}`),
  ]);

  renderOverview(overview);
  renderRows(
    'rankingBody',
    'rankingEmpty',
    (ranking.items || []).map(
      (r) => `<tr><td>${r.rank}</td><td>${r.name}</td><td>${r.score}</td><td>${r.tier}</td><td>${r.win_count}</td></tr>`
    )
  );
}

async function loadPlayers() {
  const activeOnly = byId('activeOnly').checked;
  const players = await fetchJson(`/players?active_only=${activeOnly}`);

  renderRows(
    'playersBody',
    'playersEmpty',
    (players.items || []).map(
      (p) => `<tr><td>${p.emp_id}</td><td>${p.name}</td><td>${p.score}</td><td>${p.tier}</td><td>${p.role}</td><td>${p.is_active ? '활성' : '비활성'}</td></tr>`
    )
  );
}

function teamNames(playersMap, teamIds) {
  return (teamIds || []).map((id) => playersMap.get(id) || id).join(', ');
}

async function loadDateOptions() {
  const data = await fetchJson('/match-dates?limit=24');
  const dateSelectIds = ['matchDateSelect', 'summaryDateSelect'];

  dateSelectIds.forEach((selectId) => {
    const selector = byId(selectId);
    const prev = selector.value;
    selector.innerHTML = (data.items || []).map((d) => `<option value="${d}">${d}</option>`).join('');
    if (prev && (data.items || []).includes(prev)) selector.value = prev;
  });
}

async function loadMatches() {
  const date = byId('matchDateSelect').value;
  if (!date) {
    renderRows('matchesBody', 'matchesEmpty', []);
    return;
  }

  const [players, matches] = await Promise.all([fetchJson('/players'), fetchJson(`/matches/${date}`)]);
  const playersMap = new Map((players.items || []).map((p) => [p.emp_id, p.name]));

  renderRows(
    'matchesBody',
    'matchesEmpty',
    (matches.items || []).map((m, idx) => {
      const score = m.status === 'done' || m.status === 'pending_approval' ? `${m.score1} : ${m.score2}` : '-';
      return `<tr>
        <td>${idx}</td>
        <td>${m.group || '-'}</td>
        <td>${teamNames(playersMap, m.team1)}</td>
        <td>${teamNames(playersMap, m.team2)}</td>
        <td>${score}</td>
        <td class="${statusClass(m.status)}">${statusText(m.status)}</td>
      </tr>`;
    })
  );
}

async function loadSummary() {
  const date = byId('summaryDateSelect').value;
  if (!date) {
    renderRows('summaryBody', 'summaryEmpty', []);
    return;
  }

  const summary = await fetchJson(`/summary/${date}`);
  renderRows(
    'summaryBody',
    'summaryEmpty',
    (summary.items || []).map(
      (item) => `<tr><td>${item.name || item.emp_id || '-'}</td><td>${item.delta_score ?? '-'}</td><td>${item.result || '-'}</td></tr>`
    )
  );
}

async function addPlayer(event) {
  event.preventDefault();
  const payload = {
    emp_id: byId('playerEmpId').value.trim(),
    name: byId('playerName').value.trim(),
    score: Number(byId('playerScore').value),
    is_active: byId('playerActive').checked,
  };

  if (!payload.emp_id || !payload.name) {
    showMessage('playerFormMessage', '사번과 이름을 입력하세요.', false);
    return;
  }

  await fetchJson('/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  showMessage('playerFormMessage', '선수 등록이 완료되었습니다.');
  byId('playerForm').reset();
  byId('playerScore').value = 1000;
  byId('playerActive').checked = true;
  await Promise.all([loadPlayers(), loadDashboard()]);
}

function matchActionPayload() {
  return {
    date: byId('matchDateSelect').value,
    matchIdx: Number(byId('matchIndex').value),
  };
}

async function submitScore() {
  const { date, matchIdx } = matchActionPayload();
  const inputBy = byId('inputBy').value.trim();
  if (!date || !inputBy) throw new Error('대회 월과 입력자 사번을 확인하세요.');

  await fetchJson(`/matches/${date}/${matchIdx}/submit-score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      score1: Number(byId('score1').value),
      score2: Number(byId('score2').value),
      input_by: inputBy,
    }),
  });

  showMessage('matchActionMessage', '점수 제출이 완료되었습니다.');
}

async function approveScore() {
  const { date, matchIdx } = matchActionPayload();
  const approvedBy = byId('approvedBy').value.trim();
  if (!date || !approvedBy) throw new Error('대회 월과 승인자 사번을 확인하세요.');

  await fetchJson(`/matches/${date}/${matchIdx}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved_by: approvedBy }),
  });

  showMessage('matchActionMessage', '점수 승인이 완료되었습니다.');
}

async function rejectScore() {
  const { date, matchIdx } = matchActionPayload();
  if (!date) throw new Error('대회 월을 선택하세요.');

  await fetchJson(`/matches/${date}/${matchIdx}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: byId('rejectReason').value.trim() }),
  });

  showMessage('matchActionMessage', '이의제기가 등록되었습니다.');
}

async function generateTournament(event) {
  event.preventDefault();

  const date = byId('tournamentDate').value.trim();
  const mode = byId('tournamentMode').value;
  const attendees = byId('attendeesInput')
    .value.split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!date || attendees.length < 4) {
    throw new Error('대회 월과 참가자(최소 4명)를 입력하세요.');
  }

  await fetchJson('/tournaments/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, mode, attendees }),
  });

  showMessage('tournamentMessage', '대진 생성이 완료되었습니다.');
  byId('matchDateSelect').value = date;
}

async function loadPlayerStats(event) {
  event.preventDefault();
  const empId = byId('statsEmpId').value.trim();
  if (!empId) throw new Error('선수 사번을 입력하세요.');

  const stats = await fetchJson(`/players/${empId}/stats`);
  byId('statsScore').textContent = stats.current_score ?? '-';
  byId('statsMatchCount').textContent = stats.match_count ?? '-';
  byId('statsWinCount').textContent = stats.win_count ?? '-';
  byId('statsWinRate').textContent = stats.win_rate ? `${stats.win_rate}%` : '0%';
  showMessage('playerStatsMessage', `${stats.name || empId} 선수 통계를 불러왔습니다.`);
}

async function safeRun(task, messageId = null) {
  try {
    await task();
    byId('lastUpdated').textContent = `마지막 갱신: ${nowText()}`;
  } catch (err) {
    console.error(err);
    if (messageId) showMessage(messageId, err.message || '요청 처리 중 오류가 발생했습니다.', false);
    else alert('데이터를 불러오지 못했습니다. API 서버 상태를 확인하세요.');
  }
}

async function refreshAll() {
  await loadDateOptions();
  await Promise.all([loadDashboard(), loadPlayers(), loadMatches(), loadSummary()]);
}

function bindEvents() {
  byId('refreshBtn').addEventListener('click', () => safeRun(refreshAll));
  byId('limitSelect').addEventListener('change', () => safeRun(loadDashboard));
  byId('activeOnly').addEventListener('change', () => safeRun(loadPlayers));
  byId('matchDateSelect').addEventListener('change', () => safeRun(loadMatches));
  byId('summaryDateSelect').addEventListener('change', () => safeRun(loadSummary));

  byId('playerForm').addEventListener('submit', (e) => safeRun(() => addPlayer(e), 'playerFormMessage'));
  byId('submitScoreBtn').addEventListener('click', () => safeRun(async () => {
    await submitScore();
    await Promise.all([loadDashboard(), loadMatches(), loadSummary()]);
  }, 'matchActionMessage'));
  byId('approveBtn').addEventListener('click', () => safeRun(async () => {
    await approveScore();
    await Promise.all([loadDashboard(), loadMatches(), loadSummary()]);
  }, 'matchActionMessage'));
  byId('rejectBtn').addEventListener('click', () => safeRun(async () => {
    await rejectScore();
    await Promise.all([loadDashboard(), loadMatches(), loadSummary()]);
  }, 'matchActionMessage'));
  byId('reloadMatchesBtn').addEventListener('click', () => safeRun(loadMatches, 'matchActionMessage'));

  byId('tournamentForm').addEventListener('submit', (e) => safeRun(async () => {
    await generateTournament(e);
    await refreshAll();
  }, 'tournamentMessage'));

  byId('playerStatsForm').addEventListener('submit', (e) => safeRun(() => loadPlayerStats(e), 'playerStatsMessage'));
  byId('loadSummaryBtn').addEventListener('click', () => safeRun(loadSummary, null));
}

setupTabs();
bindEvents();
safeRun(refreshAll);
