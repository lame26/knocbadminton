import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api/client";

export default function ChangePin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPin || !newPin || !confirmPin) {
      setError("모든 항목을 입력해주세요");
      return;
    }
    if (newPin !== confirmPin) {
      setError("새 비밀번호가 일치하지 않습니다");
      return;
    }
    if (newPin.length < 4) {
      setError("비밀번호는 4자리 이상이어야 합니다");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.auth.changePin(currentPin, newPin);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "변경 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 w-full max-w-sm text-center">
          <div className="text-4xl mb-3">✅</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">비밀번호 변경 완료</h2>
          <p className="text-sm text-slate-500 mb-6">새 비밀번호로 설정되었습니다</p>
          <button
            onClick={() => navigate("/")}
            className="w-full bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            ←
          </button>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">비밀번호 변경</h2>
            {user && <p className="text-xs text-slate-500">{user.name} ({user.emp_id})</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              현재 비밀번호
            </label>
            <input
              type="password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder="현재 비밀번호"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              새 비밀번호 (4자리 이상)
            </label>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="새 비밀번호"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              새 비밀번호 확인
            </label>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="새 비밀번호 다시 입력"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>
      </div>
    </div>
  );
}
