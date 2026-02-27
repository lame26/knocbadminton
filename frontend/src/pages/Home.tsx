import { useEffect, useState } from "react";
import { api, type RulesConfig } from "../api/client";

export default function Home() {
  const [rules, setRules] = useState<RulesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.settings
      .rules()
      .then(setRules)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-400 mt-8 text-center">불러오는 중...</p>;
  if (error) return <p className="text-red-500 mt-8 text-center">오류: {error}</p>;

  const scoreRules = rules?.score_rules ?? {};
  const tierRules = rules?.tier_rules ?? {};
  const tiers = Object.entries(tierRules).sort((a, b) => b[1] - a[1]);
  const underdogDiff = scoreRules.underdog_diff ?? 100;
  const bigDiff = scoreRules.big_diff ?? 10;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-gradient-to-r from-[#0b2b57] via-[#104181] to-[#1760b8] text-white p-6 md:p-8 shadow-[0_20px_60px_rgba(8,34,74,0.35)]">
        <p className="text-xs md:text-sm text-blue-100 font-semibold tracking-wide">KNOC BADMINTON LEAGUE</p>
        <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">월 단위 운영 기준 안내</h2>
        <p className="mt-3 text-sm md:text-base text-blue-50/90 max-w-3xl">
          본 시스템은 월별 경기 데이터를 기준으로 포인트와 XP를 집계합니다. 아래 규칙은 시스템 설정과 즉시 연동되며, 설정값 변경 시
          홈 화면 안내도 자동으로 갱신됩니다.
        </p>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <article className="section-card p-5">
          <h3 className="font-bold text-slate-900">포인트 규칙</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-slate-500">승리 기본</p>
              <p className="text-xl font-bold text-slate-900">+{scoreRules.win ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-slate-500">패배 기본</p>
              <p className="text-xl font-bold text-slate-900">{scoreRules.loss ?? 0}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 col-span-2">
              <p className="text-emerald-700 font-semibold">언더독 보너스 +{scoreRules.underdog ?? 0}</p>
              <p className="text-xs text-emerald-800/80 mt-1">상대보다 {underdogDiff}점 이상 낮은 팀이 승리할 때 적용</p>
            </div>
            <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3 col-span-2">
              <p className="text-cyan-700 font-semibold">대승 보너스 +{scoreRules.big_win ?? 0}</p>
              <p className="text-xs text-cyan-800/80 mt-1">최종 점수 차가 {bigDiff}점 이상일 때 적용</p>
            </div>
          </div>
        </article>

        <article className="section-card p-5">
          <h3 className="font-bold text-slate-900">티어 기준</h3>
          <div className="mt-4 space-y-2">
            {tiers.map(([tier, threshold]) => (
              <div key={tier} className="rounded-xl border border-slate-200 px-3 py-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">{tier}</span>
                <span className="text-slate-500">{threshold}점 이상</span>
              </div>
            ))}
            {tiers.length === 0 && <p className="text-sm text-slate-400">설정된 티어 규칙이 없습니다.</p>}
          </div>
        </article>
      </section>
    </div>
  );
}
