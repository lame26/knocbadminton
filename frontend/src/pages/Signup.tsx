import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function Signup() {
  const navigate = useNavigate();
  const [empId, setEmpId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!empId.trim() || !name.trim() || !password || !confirmPassword) {
      setError("사번, 이름, 비밀번호를 모두 입력해 주세요.");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호 확인 값이 일치하지 않습니다.");
      return;
    }
    if (password.length < 4) {
      setError("비밀번호는 4자리 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.auth.signup({
        emp_id: empId.trim(),
        name: name.trim(),
        password,
      });
      setMessage(res.message);
      setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "회원가입 요청에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-900">회원가입</h1>
          <p className="text-sm text-slate-500 mt-1">가입 요청 후 관리자 승인 시 로그인 가능합니다.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">사번</label>
            <input
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">이름</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm"
              autoComplete="new-password"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-emerald-700">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? "요청 중..." : "회원가입 요청"}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-500 text-center">
          이미 계정이 있나요?{" "}
          <Link to="/login" className="text-primary-700 hover:underline">
            로그인으로 이동
          </Link>
        </p>
      </div>
    </div>
  );
}
