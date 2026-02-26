import { useEffect, useState } from "react";
import { api, type Player } from "../api/client";

export default function Players() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.players
      .list(false)
      .then(setPlayers)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) return <p className="text-slate-400 mt-8 text-center">불러오는 중...</p>;
  if (error) return <p className="text-red-500 mt-8 text-center">오류: {error}</p>;

  const active = players.filter((p) => p.is_active);
  const inactive = players.filter((p) => !p.is_active);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-medium text-slate-900">선수 목록 ({active.length}명 활동 중)</h2>
        <button onClick={load} className="text-xs text-primary-600 hover:underline">
          새로고침
        </button>
      </div>

      <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">이름</th>
                <th className="px-4 py-2 text-left">사번</th>
                <th className="px-4 py-2 text-right">점수</th>
                <th className="px-4 py-2 text-left">티어</th>
                <th className="px-4 py-2 text-right">경기수</th>
                <th className="px-4 py-2 text-right">승</th>
                <th className="px-4 py-2 text-left">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((p) => (
                <tr key={p.emp_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-slate-500 font-mono text-xs">{p.emp_id}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.score.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {p.tier}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.match_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.win_count}</td>
                  <td className="px-4 py-2">
                    <span
                      className={[
                        "text-xs px-2 py-0.5 rounded-full",
                        p.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-slate-100 text-slate-400",
                      ].join(" ")}
                    >
                      {p.is_active ? "활동" : "비활동"}
                    </span>
                  </td>
                </tr>
              ))}
              {inactive.length > 0 && active.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-slate-400 text-xs">
                    비활동 선수 {inactive.length}명
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
