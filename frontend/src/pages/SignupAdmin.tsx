import { useEffect, useState } from "react";
import { api, type SignupRequest } from "../api/client";

export default function SignupAdmin() {
  const [rows, setRows] = useState<SignupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await api.signupRequests.list();
      setRows(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "가입 요청 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(empId: string) {
    setSaving(true);
    setMessage(null);
    try {
      await api.signupRequests.approve(empId);
      setMessage(`${empId} 승인 완료`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "승인 처리에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function reject(empId: string) {
    if (!confirm(`${empId} 가입 요청을 거부하시겠습니까?`)) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.signupRequests.reject(empId);
      setMessage(`${empId} 거부 완료`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "거부 처리에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">회원가입 승인 관리</h2>
        <button onClick={load} className="text-xs text-primary-600 hover:underline">
          새로고침
        </button>
      </div>

      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {message && <p className="text-emerald-700 text-sm">{message}</p>}

      {!loading && rows.length === 0 && <p className="text-slate-500 text-sm">대기 중인 가입 요청이 없습니다.</p>}

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.emp_id} className="section-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">{r.name}</p>
              <p className="text-xs text-slate-500">
                사번 {r.emp_id} · 요청일 {r.join_date ?? "-"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => approve(r.emp_id)}
                disabled={saving}
                className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                승인
              </button>
              <button
                onClick={() => reject(r.emp_id)}
                disabled={saving}
                className="px-3 py-1.5 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                거부
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
