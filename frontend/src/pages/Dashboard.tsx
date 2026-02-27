import { useEffect, useMemo, useState } from "react";
import { api, type DaySummary, type Player } from "../api/client";

function nowMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="section-card p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
    </article>
  );
}

type SortMode = "score" | "xp";

export default function Dashboard() {
  const [month, setMonth] = useState(nowMonth());
  const [ranking, setRanking] = useState<Player[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [tierFilter, setTierFilter] = useState<string>("전체");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.ranking(100), api.summary(month)])
      .then(([r, s]) => {
        setRanking(r);
        setSummary(s);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [month]);

  const tiers = useMemo(() => ["전체", ...Array.from(new Set(ranking.map((p) => p.tier)))], [ranking]);

  const tableRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = [...ranking];
    if (tierFilter !== "전체") rows = rows.filter((p) => p.tier === tierFilter);
    if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q));
    rows.sort((a, b) => {
      if (sortMode === "xp") return b.xp - a.xp || b.score - a.score;
      return b.score - a.score || b.xp - a.xp;
    });
    return rows;
  }, [ranking, sortMode, tierFilter, query]);

  if (loading) return <p className="text-slate-400 mt-8 text-center">불러오는 중...</p>;
  if (error) return <p className="text-red-500 mt-8 text-center">오류: {error}</p>;

  return (
    <div className="space-y-5">
      <section className="section-card p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2.5 justify-between">
          <div>
            <h2 className="font-bold text-slate-900">월간 랭킹 대시보드</h2>
            <p className="text-xs text-slate-500 mt-1">기본 정렬은 포인트 우선이며, XP는 보조 지표로 함께 표시됩니다.</p>
          </div>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="이번 달 경기(전체)" value={summary?.total ?? 0} />
        <KpiCard label="확정" value={summary?.done ?? 0} />
        <KpiCard label="대기" value={summary?.pending ?? 0} />
        <KpiCard label="이의" value={summary?.disputed ?? 0} />
        <KpiCard label="취소" value={summary?.cancelled ?? 0} />
      </section>

      <section className="section-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 검색"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
          />
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs">
            <option value="score">포인트 우선</option>
            <option value="xp">XP 우선</option>
          </select>
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs">
            {tiers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">순위</th>
                <th className="px-4 py-2 text-left">이름</th>
                <th className="px-4 py-2 text-left">티어</th>
                <th className="px-4 py-2 text-right">지표(포인트 / XP)</th>
                <th className="px-4 py-2 text-right">경기수</th>
                <th className="px-4 py-2 text-right">승수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableRows.map((p, i) => (
                <tr key={p.emp_id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-2 text-slate-500 font-semibold">{i + 1}</td>
                  <td className="px-4 py-2 font-semibold">{p.name}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{p.tier}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    <p className="font-bold text-slate-900">{p.score.toLocaleString()}점</p>
                    <p className="text-xs text-slate-500">XP {p.xp.toLocaleString()}</p>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.match_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.win_count}</td>
                </tr>
              ))}
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-slate-400 text-xs">
                    표시할 선수가 없습니다.
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
