import { useEffect, useMemo, useState } from "react";
import { api, type AuditLogRow, type RulesConfig } from "../api/client";

type TierRow = { id: string; name: string; threshold: number };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleString("ko-KR");
  } catch {
    return value;
  }
}

const SCORE_RULE_LABELS: Record<string, string> = {
  win: "승리 기본 점수",
  loss: "패배 기본 점수",
  underdog: "언더독 보너스",
  underdog_diff: "언더독 조건 점수 차",
  big_win: "대승 보너스",
  big_diff: "대승 조건 점수 차",
};

export default function SystemSettings() {
  const [rules, setRules] = useState<RulesConfig | null>(null);
  const [tierRows, setTierRows] = useState<TierRow[]>([]);
  const [monthToClose, setMonthToClose] = useState<string>(new Date().toISOString().slice(0, 7));
  const [closedMonths, setClosedMonths] = useState<string[]>([]);
  const [monthBusy, setMonthBusy] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);
  const [auditFilter, setAuditFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState<"" | "score" | "xp" | "all">("");
  const [recalcResult, setRecalcResult] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredAudit = useMemo(() => {
    const q = auditFilter.trim().toLowerCase();
    if (!q) return auditRows;
    return auditRows.filter((r) => {
      const t = `${r.actor_emp_id} ${r.action} ${r.target_type} ${r.target_id}`.toLowerCase();
      return t.includes(q);
    });
  }, [auditRows, auditFilter]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [ruleData, monthData, logs] = await Promise.all([
        api.settings.rules(),
        api.settings.monthClose(),
        api.audit.list(200),
      ]);

      const score = { ...ruleData.score_rules };
      if (score.underdog_diff === undefined) score.underdog_diff = 100;
      setRules({ ...ruleData, score_rules: score });
      setTierRows(
        Object.entries(ruleData.tier_rules)
          .sort((a, b) => b[1] - a[1])
          .map(([name, threshold]) => ({ id: uid(), name, threshold }))
      );
      setClosedMonths(monthData.closed_months ?? []);
      setAuditRows(logs ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "설정을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function setScoreRule(key: string, value: number) {
    setRules((prev) => {
      if (!prev) return prev;
      return { ...prev, score_rules: { ...prev.score_rules, [key]: value } };
    });
  }

  function setTierName(id: string, name: string) {
    setTierRows((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
  }

  function setTierThreshold(id: string, threshold: number) {
    setTierRows((prev) => prev.map((r) => (r.id === id ? { ...r, threshold } : r)));
  }

  function addTier() {
    setTierRows((prev) => [...prev, { id: uid(), name: "새 티어", threshold: 0 }]);
  }

  function removeTier(id: string) {
    setTierRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function save() {
    if (!rules) return;
    const tier_rules: Record<string, number> = {};
    for (const row of tierRows) {
      const key = row.name.trim();
      if (!key) continue;
      tier_rules[key] = Number(row.threshold);
    }

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api.settings.updateRules({
        score_rules: rules.score_rules,
        tier_rules,
      });
      setMessage("시스템 설정을 저장했습니다.");
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "설정 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function runRecalc(kind: "score" | "xp" | "all", dryRun: boolean) {
    setRecalcLoading(kind);
    setError(null);
    setMessage(null);
    try {
      if (kind === "score") {
        const res = await api.settings.recalcScore(dryRun);
        setRecalcResult(JSON.stringify(res, null, 2));
      } else if (kind === "xp") {
        const res = await api.settings.recalcXp(dryRun);
        setRecalcResult(JSON.stringify(res, null, 2));
      } else {
        const res = await api.settings.recalcAll(dryRun);
        setRecalcResult(JSON.stringify(res, null, 2));
      }
      setMessage(dryRun ? "미리보기를 완료했습니다." : "재계산 적용을 완료했습니다.");
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "재계산 실행에 실패했습니다.");
    } finally {
      setRecalcLoading("");
    }
  }

  async function closeMonth() {
    const month = monthToClose.trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setError("월 형식은 YYYY-MM 입니다.");
      return;
    }
    setMonthBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.settings.closeMonth(month);
      setClosedMonths(res.closed_months ?? []);
      setMessage(`${month} 월을 마감했습니다.`);
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "월 마감에 실패했습니다.");
    } finally {
      setMonthBusy(false);
    }
  }

  async function openMonth(month: string) {
    setMonthBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.settings.openMonth(month);
      setClosedMonths(res.closed_months ?? []);
      setMessage(`${month} 월 마감을 해제했습니다.`);
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "월 마감 해제에 실패했습니다.");
    } finally {
      setMonthBusy(false);
    }
  }

  if (loading) return <p className="text-slate-400 mt-8 text-center">불러오는 중...</p>;
  if (error && !rules) return <p className="text-red-500 mt-8 text-center">오류: {error}</p>;
  if (!rules) return <p className="text-slate-400 mt-8 text-center">설정 데이터가 없습니다.</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">시스템 설정</h2>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <h3 className="font-medium text-slate-900 mb-3">점수 규칙</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {["win", "loss", "underdog", "underdog_diff", "big_win", "big_diff"].map((k) => (
            <label key={k} className="text-sm text-slate-700">
              <span className="block mb-1">{SCORE_RULE_LABELS[k] ?? k}</span>
              <input
                type="number"
                value={rules.score_rules[k] ?? 0}
                onChange={(e) => setScoreRule(k, Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2 py-1.5"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium text-slate-900">티어 규칙</h3>
          <button onClick={addTier} className="px-2 py-1 text-xs border border-slate-300 rounded">
            티어 추가
          </button>
        </div>
        <div className="space-y-2">
          {tierRows.map((row) => (
            <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
              <input
                value={row.name}
                onChange={(e) => setTierName(row.id, e.target.value)}
                className="col-span-6 border border-slate-300 rounded px-2 py-1.5 text-sm"
                placeholder="티어 이름"
              />
              <input
                type="number"
                value={row.threshold}
                onChange={(e) => setTierThreshold(row.id, Number(e.target.value))}
                className="col-span-4 border border-slate-300 rounded px-2 py-1.5 text-sm"
                placeholder="기준 점수"
              />
              <button
                onClick={() => removeTier(row.id)}
                className="col-span-2 px-2 py-1.5 text-xs border border-red-300 text-red-700 rounded"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </section>

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 text-sm bg-primary-600 text-white rounded disabled:opacity-50"
      >
        {saving ? "저장 중..." : "설정 저장"}
      </button>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
        <h3 className="font-medium text-slate-900">월 마감</h3>
        <p className="text-xs text-slate-500">마감 월은 경기 생성/수정/삭제 및 점수 처리 작업이 차단됩니다.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-slate-700">
            <span className="block mb-1">마감할 월</span>
            <input
              type="month"
              value={monthToClose}
              onChange={(e) => setMonthToClose(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1.5"
            />
          </label>
          <button
            onClick={closeMonth}
            disabled={monthBusy}
            className="px-3 py-2 text-sm bg-slate-800 text-white rounded disabled:opacity-50"
          >
            월 마감
          </button>
        </div>
        <div className="space-y-2">
          {closedMonths.length === 0 && <p className="text-sm text-slate-400">마감된 월이 없습니다.</p>}
          {closedMonths.map((month) => (
            <div key={month} className="flex items-center justify-between border border-slate-200 rounded px-3 py-2">
              <span className="text-sm text-slate-700">{month}</span>
              <button
                onClick={() => openMonth(month)}
                disabled={monthBusy}
                className="px-2 py-1 text-xs border border-amber-300 text-amber-700 rounded disabled:opacity-50"
              >
                마감 해제
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
        <h3 className="font-medium text-slate-900">재계산</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => runRecalc("score", true)} disabled={recalcLoading !== ""} className="px-3 py-2 text-xs border border-slate-300 rounded disabled:opacity-50">포인트 미리보기</button>
          <button onClick={() => runRecalc("score", false)} disabled={recalcLoading !== ""} className="px-3 py-2 text-xs bg-slate-800 text-white rounded disabled:opacity-50">포인트 적용</button>
          <button onClick={() => runRecalc("xp", true)} disabled={recalcLoading !== ""} className="px-3 py-2 text-xs border border-slate-300 rounded disabled:opacity-50">XP 미리보기</button>
          <button onClick={() => runRecalc("xp", false)} disabled={recalcLoading !== ""} className="px-3 py-2 text-xs bg-slate-800 text-white rounded disabled:opacity-50">XP 적용</button>
          <button onClick={() => runRecalc("all", true)} disabled={recalcLoading !== ""} className="px-3 py-2 text-xs border border-slate-300 rounded disabled:opacity-50">전체 미리보기</button>
          <button onClick={() => runRecalc("all", false)} disabled={recalcLoading !== ""} className="px-3 py-2 text-xs bg-red-600 text-white rounded disabled:opacity-50">전체 적용</button>
        </div>
        {recalcLoading !== "" && <p className="text-sm text-slate-500">재계산 실행 중...</p>}
        {recalcResult && (
          <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-3 overflow-auto max-h-72">
            {recalcResult}
          </pre>
        )}
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-slate-900">감사 로그</h3>
          <div className="flex gap-2">
            <input
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              placeholder="행위/대상/사번 검색"
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            />
            <button onClick={loadAll} className="px-3 py-2 text-xs border border-slate-300 rounded">새로고침</button>
          </div>
        </div>

        <div className="max-h-96 overflow-auto border border-slate-200 rounded">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left px-2 py-2">시간</th>
                <th className="text-left px-2 py-2">행위자</th>
                <th className="text-left px-2 py-2">액션</th>
                <th className="text-left px-2 py-2">대상</th>
              </tr>
            </thead>
            <tbody>
              {filteredAudit.map((r) => (
                <tr key={r.id} className="border-t border-slate-200 align-top">
                  <td className="px-2 py-2 whitespace-nowrap">{formatTime(r.created_at)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{r.actor_emp_id}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{r.action}</td>
                  <td className="px-2 py-2">
                    <div>{r.target_type}:{r.target_id}</div>
                    {r.details && Object.keys(r.details).length > 0 && (
                      <pre className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">{JSON.stringify(r.details)}</pre>
                    )}
                  </td>
                </tr>
              ))}
              {filteredAudit.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-8 text-center text-slate-400">로그가 없습니다. (audit_logs 테이블 준비 여부 확인)</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
