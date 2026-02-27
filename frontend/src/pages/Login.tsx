import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? "/";

  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChangePin, setShowChangePin] = useState(false);

  // 이미 로그인된 경우 리다이렉트
  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!empId.trim() || !pin.trim()) {
      setError("사번과 비밀번호를 모두 입력해주세요");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await login(empId.trim(), pin.trim());
      if (result.is_first_login) {
        // 최초 로그인 시 비밀번호 변경 안내
        setShowChangePin(true);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "로그인 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  // 최초 로그인 후 비밀번호 변경 안내 화면
  if (showChangePin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-3xl mb-2">🔑</div>
            <h2 className="text-lg font-semibold text-slate-900">첫 로그인입니다!</h2>
            <p className="text-sm text-slate-500 mt-1">
              현재 초기 비밀번호(사번)를 사용 중입니다.
              <br />
              보안을 위해 새 비밀번호를 설정하길 권장합니다.
            </p>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => navigate("/change-pin")}
              className="w-full bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              지금 비밀번호 변경하기
            </button>
            <button
              onClick={() => navigate(from, { replace: true })}
              className="w-full text-slate-500 text-sm py-2 hover:text-slate-700"
            >
              나중에 변경
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 w-full max-w-sm">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🏸</div>
          <h1 className="text-xl font-bold text-slate-900">KNOC 배드민턴</h1>
          <p className="text-sm text-slate-500 mt-1">월례대회 운영 시스템</p>
        </div>

        {/* 로그인 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              사번
            </label>
            <input
              type="text"
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              placeholder="사번을 입력하세요"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              비밀번호
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              disabled={loading}
              autoComplete="current-password"
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
            className="w-full bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        {/* 안내 */}
        <p className="text-xs text-slate-400 text-center mt-6">
          초기 비밀번호는 <span className="font-medium text-slate-600">본인 사번</span>입니다
        </p>
      </div>
    </div>
  );
}
