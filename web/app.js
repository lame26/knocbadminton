const byId = (id) => document.getElementById(id);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function nowText() {
  return new Date().toLocaleString('ko-KR', { hour12: false });
}

function setupTabs() {
  const btns = document.querySelectorAll('.tab-btn');
  btns.forEach((btn) => {
    btn.addEventListener('click', () => {
      btns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      byId(`tab-${tab}`).classList.add('active');
    });
  });
}

function renderRows(bodyId, emptyId, rowsHtml) {
  const body = byId(bodyId);
  const empty = byId(emptyId);
  body.innerHTML = rowsHtml.join('');
  empty.hidden = rowsHtml.length > 0;
}

function renderOverview(data) {
  byId('playersTotal').textContent = data.players_total ?? '-';
  byId('matchesTotal').textContent = data.matches_total ?? '-';
  byId('matchesDone').textContent = data.matches_done ?? '-';
  byId('matchesPending').textContent = data.matches_pending_approval ?? '-';
}

async function loadDashboard() {
  const limit = Number(byId('limitSelect').value);
  const [overview, ranking] = await Promise.all([
    fetchJson('/dashboard/overview'),
    fetchJson(`/ranking?limit=${limit}`),
  ]);
  renderOverview(overview);
  renderRows(
    'rankingBody','rankingEmpty',
    (ranking.items || []).map((r) => `<tr><td>${r.rank}</td><td>${r.name}</td><td>${r.score}</td><td>${r.tier}</td><td>${r.win_count}</td></tr>`)
  );
}

async function loadPlayers() {
  const activeOnly = byId('activeOnly').checked;
  const players = await fetchJson(`/players?active_only=${activeOnly}`);
  renderRows(
    'playersBody','playersEmpty',
    (players.items || []).map((p) => `<tr><td>${p.emp_id}</td><td>${p.name}</td><td>${p.score}</td><td>${p.tier}</td><td>${p.role}</td><td>${p.is_active ? '활성' : '비활성'}</td></tr>`)
  );
}

function matchStatusText(status) {
  if (status === 'done') return '확정';
  if (status === 'pending_approval') return '승인대기';
  if (status === 'disputed') return '이의제기';
  return '대기';
}

function teamNames(playersMap, team) {
  return (team || []).map((id) => playersMap.get(id) || id).join(', ');
}

async function loadMatches() {
  const [dates, players] = await Promise.all([fetchJson('/match-dates?limit=24'), fetchJson('/players')]);
  const selector = byId('matchDateSelect');
  if (!selector.dataset.init) {
    selector.innerHTML = (dates.items || []).map((d) => `<option value="${d}">${d}</option>`).join('');
    selector.dataset.init = '1';
  }
  const date = selector.value || (dates.items || [])[0];
  if (!date) {
    renderRows('matchesBody','matchesEmpty',[]);
    return;
  }
  const playersMap = new Map((players.items || []).map((p) => [p.emp_id, p.name]));
  const matches = await fetchJson(`/matches/${date}`);
  renderRows(
    'matchesBody','matchesEmpty',
    (matches.items || []).map((m) => {
      const score = m.status === 'done' || m.status === 'pending_approval' ? `${m.score1} : ${m.score2}` : '-';
      return `<tr><td>${m.group || '-'}</td><td>${teamNames(playersMap, m.team1)}</td><td>${teamNames(playersMap, m.team2)}</td><td>${score}</td><td>${matchStatusText(m.status)}</td></tr>`;
    })
  );
}

async function loadAll() {
  await Promise.all([loadDashboard(), loadPlayers(), loadMatches()]);
  byId('lastUpdated').textContent = `마지막 갱신: ${nowText()}`;
}

function bindEvents() {
  byId('refreshBtn').addEventListener('click', () => loadAll().catch(onError));
  byId('limitSelect').addEventListener('change', () => loadDashboard().catch(onError));
  byId('activeOnly').addEventListener('change', () => loadPlayers().catch(onError));
  byId('matchDateSelect').addEventListener('change', () => loadMatches().catch(onError));
}

function onError(err) {
  console.error(err);
  alert('데이터를 불러오지 못했습니다. API 서버 상태를 확인하세요.');
}

setupTabs();
bindEvents();
loadAll().catch(onError);
