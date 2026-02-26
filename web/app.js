const byId = (id) => document.getElementById(id);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function nowText() {
  const now = new Date();
  return now.toLocaleString('ko-KR', { hour12: false });
}

function renderOverview(data) {
  byId('playersTotal').textContent = data.players_total ?? '-';
  byId('matchesTotal').textContent = data.matches_total ?? '-';
  byId('matchesDone').textContent = data.matches_done ?? '-';
  byId('matchesPending').textContent = data.matches_pending_approval ?? '-';
}

function renderRanking(items) {
  const body = byId('rankingBody');
  const emptyState = byId('emptyState');

  body.innerHTML = '';
  if (!items || items.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  for (const row of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.rank}</td>
      <td>${row.name}</td>
      <td>${row.score}</td>
      <td>${row.tier}</td>
      <td>${row.win_count}</td>
    `;
    body.appendChild(tr);
  }
}

async function loadData() {
  const limit = Number(byId('limitSelect').value);
  const [overview, ranking] = await Promise.all([
    fetchJson('/dashboard/overview'),
    fetchJson(`/ranking?limit=${limit}`),
  ]);

  renderOverview(overview);
  renderRanking(ranking.items || []);
  byId('lastUpdated').textContent = `마지막 갱신: ${nowText()}`;
}

byId('refreshBtn').addEventListener('click', () => {
  loadData().catch((err) => {
    console.error(err);
    alert('데이터를 불러오지 못했습니다. API 서버 상태를 확인하세요.');
  });
});

byId('limitSelect').addEventListener('change', () => {
  loadData().catch((err) => {
    console.error(err);
    alert('데이터를 불러오지 못했습니다. API 서버 상태를 확인하세요.');
  });
});

loadData().catch((err) => {
  console.error(err);
  alert('데이터를 불러오지 못했습니다. API 서버 상태를 확인하세요.');
});
