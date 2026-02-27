import { useEffect, useMemo, useState } from "react";
import { api, type Match, type Player } from "../api/client";

function nowMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function Mediation() {
  const [month, setMonth] = useState(nowMonth());
  const [monthClosed, setMonthClosed] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<Record<number, { score1: number; score2: number }>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerName = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => map.set(p.emp_id, p.name));
    return (empId?: string | null) => (empId ? map.get(empId) ?? empId : "-");
  }, [players]);

  const load = (target: string) => {
    setLoading(true);
    setMessage(null);
    setError(null);
    Promise.all([api.matches.byDate(target), api.players.list(false), api.settings.monthClosed(target)])
      .then(([rows, playerRows, closeState]) => {
        setMatches(rows);
        setPlayers(playerRows);
        setMonthClosed(closeState.closed);
        const next: Record<number, { score1: number; score2: number }> = {};
        rows.forEach((m) => {
          next[m.id] = { score1: m.score1 ?? 0, score2: m.score2 ?? 0 };
        });
        setScores(next);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(month), [month]);

  const pendingOrDisputed = useMemo(
    () => matches.filter((m) => m.status === "pending" || m.status === "disputed"),
    [matches]
  );

  async function approve(m: Match) {
    if (monthClosed) return;
    try {
      await api.matches.approve(m.id);
      setMessage(`경기 #${m.id} 승인 완료`);
      load(month);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "승인에 실패했습니다.");
    }
  }

  async function reject(m: Match) {
    if (monthClosed) return;
    const reason = prompt("반려 사유를 입력하세요(선택):") ?? "";
    try {
      await api.matches.reject(m.id, reason);
      setMessage(`경기 #${m.id} 이의 상태로 변경`);
      load(month);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "반려에 실패했습니다.");
    }
  }

  async function forceConfirm(m: Match) {
    if (monthClosed) return;
    const value = scores[m.id];
    if (!value || value.score1 === value.score2) {
      setError("유효한 점수를 입력하세요.");
      return;
    }
    try {
      await api.matches.submitScore(m.id, value);
      await api.matches.approve(m.id);
      setMessage(`경기 #${m.id} 강제 확정 완료`);
      load(month);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "강제 확정에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600">대상 월</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        />
        <button onClick={() => load(month)} className="text-xs text-primary-600 hover:underline ml-auto">
          새로고침
        </button>
      </div>

      {loading && <p className="text-slate-400 text-center mt-8">불러오는 중...</p>}
      {error && <p className="text-red-500 text-center mt-8">오류: {error}</p>}
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {monthClosed && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {month} 월은 마감 상태입니다. 승인/반려/강제확정이 잠겨 있습니다.
        </p>
      )}

      {!loading && !error && pendingOrDisputed.length === 0 && (
        <p className="text-slate-400 text-center mt-8">중재 대상 경기가 없습니다.</p>
      )}

      {pendingOrDisputed.map((m) => (
        <article key={m.id} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              {m.group_name}조 · #{m.id}
            </p>
            <p className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{m.status}</p>
          </div>

          <div className="text-sm text-slate-700">
            <p>
              {playerName(m.team1_player1)}
              {m.team1_player2 ? `, ${playerName(m.team1_player2)}` : ""} vs {playerName(m.team2_player1)}
              {m.team2_player2 ? `, ${playerName(m.team2_player2)}` : ""}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              현재 점수: {m.score1}:{m.score2}
            </p>
            {m.dispute_reason && <p className="text-xs text-red-600 mt-1">사유: {m.dispute_reason}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              value={scores[m.id]?.score1 ?? 0}
              onChange={(e) =>
                setScores((prev) => ({
                  ...prev,
                  [m.id]: { score1: Number(e.target.value), score2: prev[m.id]?.score2 ?? 0 },
                }))
              }
              disabled={monthClosed}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm disabled:bg-slate-100"
            />
            <input
              type="number"
              min={0}
              value={scores[m.id]?.score2 ?? 0}
              onChange={(e) =>
                setScores((prev) => ({
                  ...prev,
                  [m.id]: { score1: prev[m.id]?.score1 ?? 0, score2: Number(e.target.value) },
                }))
              }
              disabled={monthClosed}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm disabled:bg-slate-100"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => approve(m)}
              disabled={monthClosed}
              className="px-3 py-2 text-sm bg-green-600 text-white rounded disabled:opacity-50"
            >
              승인
            </button>
            <button
              onClick={() => reject(m)}
              disabled={monthClosed}
              className="px-3 py-2 text-sm border border-amber-300 text-amber-700 rounded disabled:opacity-50"
            >
              반려/이의
            </button>
            <button
              onClick={() => forceConfirm(m)}
              disabled={monthClosed}
              className="px-3 py-2 text-sm bg-slate-800 text-white rounded disabled:opacity-50"
            >
              점수 수정 후 강제 확정
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
