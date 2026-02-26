import { useEffect, useState } from "react";
import { api, type Player, type DaySummary } from "../api/client";

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
    </article>
  );
}

export default function Dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [ranking, setRanking] = useState<Player[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.ranking(10), api.summary(today)])
      .then(([r, s]) => {
        setRanking(r);
        setSummary(s);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [today]);

  if (loading) return <p className="text-slate-400 mt-8 text-center">불러오는 중...</p>;
  if (error) return <p className="text-red-500 mt-8 text-center">오류: {error}</p>;

  return (
    <div className="space-y-6">
      {/* KPI */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="오늘 경기 (전체)" value={summary?.total ?? 0} />
        <KpiCard label="확정" value={summary?.done ?? 0} />
        <KpiCard label="승인 대기" value={summary?.pending ?? 0} />
        <KpiCard label="이의제기" value={summary?.disputed ?? 0} />
      </section>

      {/* 랭킹 */}
      <section className="bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-medium text-slate-900">실시간 랭킹 TOP 10</h2>
          <span className="text-xs text-slate-400">{today} 기준</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">순위</th>
                <th className="px-4 py-2 text-left">이름</th>
                <th className="px-4 py-2 text-right">점수</th>
                <th className="px-4 py-2 text-left">티어</th>
                <th className="px-4 py-2 text-right">승</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ranking.map((p, i) => (
                <tr key={p.emp_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.score.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {p.tier}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.win_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
