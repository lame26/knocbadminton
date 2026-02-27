import { useEffect, useMemo, useState } from "react";
import { api, type Match, type Player } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

function nowMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function isParticipant(match: Match, empId: string): boolean {
  return (
    match.team1_player1 === empId ||
    match.team1_player2 === empId ||
    match.team2_player1 === empId ||
    match.team2_player2 === empId
  );
}

export default function MyMatches() {
  const { user, isAdmin } = useAuth();
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
    setError(null);
    setMessage(null);
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

  const myMatches = useMemo(() => {
    if (!user) return [];
    return matches.filter((m) => isParticipant(m, user.emp_id));
  }, [matches, user]);

  async function submitScore(m: Match) {
    if (monthClosed) return;
    const value = scores[m.id];
    if (!value) return;
    if (value.score1 === value.score2) {
      setMessage("무승부 점수는 입력할 수 없습니다.");
      return;
    }
    setMessage(null);
    setError(null);
    try {
      await api.matches.submitScore(m.id, value);
      setMessage("점수를 제출했습니다.");
      load(month);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "점수 제출에 실패했습니다.");
    }
  }

  async function dispute(m: Match) {
    if (monthClosed) return;
    const reason = prompt("이의 사유를 입력하세요(선택):") ?? "";
    setMessage(null);
    setError(null);
    try {
      await api.matches.reject(m.id, reason);
      setMessage("이의 제기를 처리했습니다.");
      load(month);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "이의 제기에 실패했습니다.");
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
          {month} 월은 마감 상태입니다. 점수 제출/이의제기가 잠겨 있습니다.
        </p>
      )}

      {!loading && !error && myMatches.length === 0 && (
        <p className="text-slate-400 text-center mt-8">내 경기 데이터가 없습니다.</p>
      )}

      {myMatches.map((m) => {
        const editable =
          !monthClosed &&
          m.status === "pending" &&
          (m.input_by === null || m.input_by === user?.emp_id || isAdmin);
        return (
          <article key={m.id} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-xs text-slate-500">
                {m.group_name}조 · #{m.id}
              </p>
              <p className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{m.status}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="border border-slate-200 rounded p-2 text-sm">
                <p className="font-medium">{playerName(m.team1_player1)}</p>
                {m.team1_player2 && <p className="text-slate-500 text-xs">{playerName(m.team1_player2)}</p>}
              </div>
              <div className="border border-slate-200 rounded p-2 text-sm">
                <p className="font-medium">{playerName(m.team2_player1)}</p>
                {m.team2_player2 && <p className="text-slate-500 text-xs">{playerName(m.team2_player2)}</p>}
              </div>
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
                disabled={!editable}
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
                disabled={!editable}
                className="border border-slate-300 rounded px-2 py-1.5 text-sm disabled:bg-slate-100"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => submitScore(m)}
                disabled={!editable}
                className="px-3 py-2 text-sm bg-primary-600 text-white rounded disabled:opacity-50"
              >
                점수 제출
              </button>
              <button
                onClick={() => dispute(m)}
                disabled={monthClosed || (m.status !== "pending" && m.status !== "done")}
                className="px-3 py-2 text-sm border border-red-300 text-red-700 rounded disabled:opacity-50"
              >
                이의 제기
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
