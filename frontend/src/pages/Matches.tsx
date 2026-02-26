import { useEffect, useState } from "react";
import { api, type Match } from "../api/client";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "승인 대기", cls: "bg-yellow-50 text-yellow-700" },
  done: { label: "확정", cls: "bg-green-50 text-green-700" },
  disputed: { label: "이의제기", cls: "bg-red-50 text-red-700" },
};

export default function Matches() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (d: string) => {
    setLoading(true);
    setError(null);
    api.matches
      .byDate(d)
      .then(setMatches)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(date), [date]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600">날짜</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          onClick={() => load(date)}
          className="text-xs text-primary-600 hover:underline ml-auto"
        >
          새로고침
        </button>
      </div>

      {loading && <p className="text-slate-400 text-center mt-8">불러오는 중...</p>}
      {error && <p className="text-red-500 text-center mt-8">오류: {error}</p>}

      {!loading && !error && matches.length === 0 && (
        <p className="text-slate-400 text-center mt-8">{date} 경기 데이터가 없습니다.</p>
      )}

      {matches.map((m) => {
        const s = STATUS_LABEL[m.status] ?? { label: m.status, cls: "bg-slate-100 text-slate-500" };
        return (
          <div key={m.id} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs font-medium text-slate-500">{m.group_name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
            </div>
            <div className="grid grid-cols-3 items-center text-center gap-2">
              <div className="text-sm">
                <p className="font-medium">{m.team1_player1}</p>
                {m.team1_player2 && (
                  <p className="text-slate-500 text-xs">{m.team1_player2}</p>
                )}
              </div>
              <div className="text-xl font-bold tabular-nums">
                {m.score1} : {m.score2}
              </div>
              <div className="text-sm">
                <p className="font-medium">{m.team2_player1}</p>
                {m.team2_player2 && (
                  <p className="text-slate-500 text-xs">{m.team2_player2}</p>
                )}
              </div>
            </div>
            {m.dispute_reason && (
              <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                이의제기: {m.dispute_reason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
