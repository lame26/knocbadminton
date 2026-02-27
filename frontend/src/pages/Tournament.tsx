import { useEffect, useMemo, useState } from "react";
import { api, type Match, type Player } from "../api/client";

type Mode = "balanced" | "random";

type Pairing = {
  team1: [string, string];
  team2: [string, string];
};

function nowMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function splitGroups(total: number): number[] | null {
  let best: number[] | null = null;
  let minFours = total;
  for (let n6 = Math.floor(total / 6); n6 >= 0; n6 -= 1) {
    const rem = total - n6 * 6;
    for (let n5 = Math.floor(rem / 5); n5 >= 0; n5 -= 1) {
      const rem2 = rem - n5 * 5;
      if (rem2 % 4 === 0) {
        const n4 = rem2 / 4;
        if (n4 <= minFours) {
          minFours = n4;
          best = [...Array(n6).fill(6), ...Array(n5).fill(5), ...Array(n4).fill(4)];
        }
      }
    }
  }
  return best;
}

function shuffle<T>(arr: T[]): T[] {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function getBalancedMatches(members: string[], targetGames: number): Pairing[] {
  if (members.length !== 4) return getRandomMatches(members, targetGames);
  const base: Pairing[] = [
    { team1: [members[0], members[3]], team2: [members[1], members[2]] },
    { team1: [members[0], members[2]], team2: [members[1], members[3]] },
    { team1: [members[0], members[1]], team2: [members[2], members[3]] },
  ];
  const result: Pairing[] = [];
  while ((result.length * 4) / members.length < targetGames) result.push(...base);
  const needed = Math.floor((targetGames * members.length) / 4);
  return result.slice(0, needed);
}

function getRandomMatches(members: string[], targetGames: number): Pairing[] {
  let base: Pairing[] = [];
  if (members.length === 4) {
    base = [
      { team1: [members[0], members[1]], team2: [members[2], members[3]] },
      { team1: [members[0], members[2]], team2: [members[1], members[3]] },
      { team1: [members[0], members[3]], team2: [members[1], members[2]] },
    ];
  } else if (members.length === 5) {
    base = [
      { team1: [members[0], members[1]], team2: [members[2], members[3]] },
      { team1: [members[0], members[2]], team2: [members[3], members[4]] },
      { team1: [members[0], members[3]], team2: [members[1], members[4]] },
      { team1: [members[0], members[4]], team2: [members[1], members[2]] },
      { team1: [members[1], members[3]], team2: [members[2], members[4]] },
    ];
  } else if (members.length === 6) {
    base = [
      { team1: [members[0], members[1]], team2: [members[2], members[3]] },
      { team1: [members[0], members[4]], team2: [members[1], members[5]] },
      { team1: [members[2], members[4]], team2: [members[3], members[5]] },
      { team1: [members[0], members[2]], team2: [members[4], members[5]] },
      { team1: [members[1], members[3]], team2: [members[2], members[5]] },
      { team1: [members[0], members[3]], team2: [members[1], members[4]] },
    ];
  }

  const result: Pairing[] = [];
  while ((result.length * 4) / Math.max(members.length, 1) < targetGames) {
    if (result.length < base.length) {
      result.push(base[result.length]);
    } else {
      const s = shuffle(members);
      result.push({ team1: [s[0], s[1]], team2: [s[2], s[3]] });
    }
  }
  return result;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function Tournament() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [month, setMonth] = useState(nowMonth());
  const [monthClosed, setMonthClosed] = useState(false);
  const [mode, setMode] = useState<Mode>("balanced");
  const [targetGames, setTargetGames] = useState(4);
  const [search, setSearch] = useState("");
  const [monthMatches, setMonthMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const compareByScoreThenName = (a: Player, b: Player) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name, "ko");
  };

  useEffect(() => {
    api.players
      .list(false)
      .then((rows) => setPlayers([...rows].sort(compareByScoreThenName)))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([api.matches.byDate(month), api.settings.monthClosed(month)])
      .then(([rows, closed]) => {
        setMonthMatches(rows);
        setMonthClosed(closed.closed);
      })
      .catch(() => {
        setMonthMatches([]);
        setMonthClosed(false);
      });
  }, [month]);

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => map.set(p.emp_id, p.name));
    return (empId: string) => map.get(empId) ?? empId;
  }, [players]);

  const activePlayers = useMemo(() => players.filter((p) => p.is_active), [players]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activePlayers;
    return activePlayers.filter((p) => p.name.toLowerCase().includes(q) || p.emp_id.toLowerCase().includes(q));
  }, [activePlayers, search]);

  const selectedIds = useMemo(
    () => activePlayers.filter((p) => checked[p.emp_id]).map((p) => p.emp_id),
    [activePlayers, checked]
  );

  const groups = useMemo(() => splitGroups(selectedIds.length), [selectedIds.length]);

  const selectedByScore = useMemo(
    () =>
      [...selectedIds].sort((a, b) => {
        const pa = players.find((p) => p.emp_id === a);
        const pb = players.find((p) => p.emp_id === b);
        if (!pa && !pb) return 0;
        if (!pa) return 1;
        if (!pb) return -1;
        if (pb.score !== pa.score) return pb.score - pa.score;
        return pa.name.localeCompare(pb.name, "ko");
      }),
    [selectedIds, players]
  );

  const groupedMatches = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of [...monthMatches].sort((a, b) => a.id - b.id)) {
      const key = m.group_name || "A";
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [monthMatches]);

  async function handleGenerate() {
    if (!groups) {
      setError("선수 수로는 4/5/6명 그룹 조합을 만들 수 없습니다.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      let offset = 0;
      const matches: Array<{
        group_name: string;
        team1_player1: string;
        team1_player2: string;
        team2_player1: string;
        team2_player2: string;
      }> = [];

      groups.forEach((groupSize, i) => {
        const members = selectedByScore.slice(offset, offset + groupSize);
        offset += groupSize;
        const pairings =
          mode === "balanced" ? getBalancedMatches(members, targetGames) : getRandomMatches(members, targetGames);
        const groupName = String.fromCharCode(65 + i);
        pairings.forEach((p) => {
          matches.push({
            group_name: groupName,
            team1_player1: p.team1[0],
            team1_player2: p.team1[1],
            team2_player1: p.team2[0],
            team2_player2: p.team2[1],
          });
        });
      });

      const res = await api.tournaments.generate({ date: month, matches });
      setSuccess(`${res.inserted}개 경기가 생성되었습니다.`);
      setChecked({});
      const rows = await api.matches.byDate(month);
      setMonthMatches(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "대진 생성 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function printSchedule() {
    if (groupedMatches.length === 0) {
      setError("출력할 대진표가 없습니다.");
      return;
    }
    const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=1200");
    if (!popup) {
      setError("팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.");
      return;
    }

    const groupHtml = groupedMatches
      .map(([groupName, list], idx) => {
        const emoji = ["🔵", "🟢", "🔴", "🟣", "🟠"][idx % 5];
        const games = list
          .map((m, i) => {
            const t1 = `${nameOf(m.team1_player1)}${m.team1_player2 ? `, ${nameOf(m.team1_player2)}` : ""}`;
            const t2 = `${nameOf(m.team2_player1)}${m.team2_player2 ? `, ${nameOf(m.team2_player2)}` : ""}`;
            return `<div class="game"><div class="num">${i + 1}경기</div><div class="vs">${escapeHtml(t1)} VS ${escapeHtml(t2)}</div></div>`;
          })
          .join("");
        return `<section class="group"><h2>${emoji} ${escapeHtml(groupName)}조</h2>${games}</section>`;
      })
      .join("");

    popup.document.write(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${month} 대진표</title>
<style>
  body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; padding: 24px; color: #111827; }
  h1 { margin: 0 0 16px; font-size: 28px; }
  .meta { margin-bottom: 20px; color: #4b5563; }
  .group { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
  .group h2 { margin: 0 0 10px; font-size: 20px; }
  .game { padding: 8px 0; border-top: 1px dashed #e5e7eb; }
  .game:first-of-type { border-top: none; }
  .num { font-weight: 700; margin-bottom: 4px; }
  .vs { font-size: 16px; }
  @media print { body { padding: 8mm; } }
</style>
</head>
<body>
  <h1>KNOC 배드민턴 클럽 대진표</h1>
  <div class="meta">대상 월: ${month} / 출력 시각: ${new Date().toLocaleString("ko-KR")}</div>
  ${groupHtml}
</body>
</html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  if (loading) return <p className="text-slate-400 mt-8 text-center">불러오는 중...</p>;

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm grid sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">대상 월</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">매칭 방식</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="w-full border border-slate-300 rounded px-2 py-2 text-sm">
            <option value="balanced">밸런스</option>
            <option value="random">랜덤</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">목표 게임 수</label>
          <input
            type="number"
            min={1}
            max={12}
            value={targetGames}
            onChange={(e) => setTargetGames(Number(e.target.value))}
            className="w-full border border-slate-300 rounded px-2 py-2 text-sm"
          />
        </div>
        <div className="text-xs text-slate-500 flex items-end">
          {monthMatches.length > 0 ? `${month} 기존 경기 ${monthMatches.length}개` : "선수를 선택해 대진표를 생성하세요."}
        </div>
      </section>

      {monthClosed && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          {month} 월은 마감 상태입니다. 대진 생성이 잠겨 있습니다.
        </p>
      )}

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <div className="flex gap-2 mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름/사번 검색"
            className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={() =>
              setChecked((prev) => {
                const next = { ...prev };
                filtered.forEach((p) => {
                  next[p.emp_id] = true;
                });
                return next;
              })
            }
            className="px-3 py-2 text-xs border border-slate-300 rounded hover:bg-slate-50"
          >
            전체 선택
          </button>
          <button
            onClick={() =>
              setChecked((prev) => {
                const next = { ...prev };
                filtered.forEach((p) => {
                  next[p.emp_id] = false;
                });
                return next;
              })
            }
            className="px-3 py-2 text-xs border border-slate-300 rounded hover:bg-slate-50"
          >
            전체 해제
          </button>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
          {filtered.map((p) => (
            <label key={p.emp_id} className="flex items-center gap-2 px-2 py-1.5 border border-slate-200 rounded text-sm">
              <input
                type="checkbox"
                checked={Boolean(checked[p.emp_id])}
                onChange={(e) => setChecked((prev) => ({ ...prev, [p.emp_id]: e.target.checked }))}
              />
              <span className="font-medium">{p.name}</span>
              <span className="text-slate-400 text-xs ml-auto">
                {p.emp_id} · {p.score}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 rounded-lg border border-slate-200 p-4">
        <p className="text-sm text-slate-700 mb-1">선택 인원: {selectedIds.length}명</p>
        <p className="text-xs text-slate-500">
          {groups ? `예상 그룹: ${groups.map((g) => `${g}명`).join(", ")}` : "구성 불가 (최소 4명 필요)"}
        </p>
      </section>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>}
      {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">{success}</p>}

      <div className="grid sm:grid-cols-2 gap-2">
        <button
          onClick={handleGenerate}
          disabled={submitting || !groups || selectedIds.length < 4 || monthClosed}
          className="w-full bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? "생성 중..." : "대진 생성 및 저장"}
        </button>
        <button
          onClick={printSchedule}
          disabled={groupedMatches.length === 0}
          className="w-full bg-slate-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-slate-900 disabled:opacity-50"
        >
          대진표 출력
        </button>
      </div>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-slate-900">{month} 대진표 미리보기</h3>
          <span className="text-xs text-slate-500">총 {monthMatches.length}경기</span>
        </div>
        {groupedMatches.length === 0 && <p className="text-sm text-slate-400">저장된 대진이 없습니다.</p>}
        <div className="space-y-3">
          {groupedMatches.map(([groupName, list], idx) => (
            <article key={groupName} className="border border-slate-200 rounded-lg p-3">
              <h4 className="font-semibold text-slate-900 mb-2">{["🔵", "🟢", "🔴", "🟣", "🟠"][idx % 5]} {groupName}조</h4>
              <div className="space-y-1 text-sm text-slate-700">
                {list.map((m, i) => (
                  <p key={m.id}>
                    {i + 1}경기: {nameOf(m.team1_player1)}{m.team1_player2 ? `, ${nameOf(m.team1_player2)}` : ""} VS {nameOf(m.team2_player1)}{m.team2_player2 ? `, ${nameOf(m.team2_player2)}` : ""}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
