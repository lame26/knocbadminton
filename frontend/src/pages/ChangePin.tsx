import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

type ChangePasswordState = {
  forceChange?: boolean;
  currentPassword?: string;
  redirectTo?: string;
};

export default function ChangePin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as ChangePasswordState | null) ?? null;
  const forceChange = Boolean(state?.forceChange);
  const hideCurrentField = forceChange && Boolean(state?.currentPassword);

  const [currentPassword, setCurrentPassword] = useState(state?.currentPassword ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!hideCurrentField && !currentPassword) {
      setError("현재 비밀번호를 입력해 주세요.");
      return;
    }
    if (!newPassword || !confirmPassword) {
      setError("새 비밀번호와 확인 값을 입력해 주세요.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호와 확인 값이 일치하지 않습니다.");
      return;
    }
    if (newPassword.length < 4) {
      setError("비밀번호는 4자리 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.auth.changePin(currentPassword, newPassword);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "비밀번호 변경에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    const target = state?.redirectTo ?? "/";
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 w-full max-w-sm text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">비밀번호 변경 완료</h2>
          <p className="text-sm text-slate-500 mb-6">새 비밀번호가 적용되었습니다.</p>
          <button
            onClick={() => navigate(target, { replace: true })}
            className="w-full bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700"
          >
            계속하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          {!forceChange && (
            <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
              ←
            </button>
          )}
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{forceChange ? "초기 비밀번호 변경" : "비밀번호 변경"}</h2>
            {user && <p className="text-xs text-slate-500">{user.name}</p>}
          </div>
        </div>

        {forceChange && (
          <div className="mb-4 text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
            최초 로그인 상태입니다. 보안을 위해 비밀번호를 먼저 변경해 주세요.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!hideCurrentField && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">현재 비밀번호</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">새 비밀번호</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>
      </div>
    </div>
  );
}
