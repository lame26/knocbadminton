import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Dashboard from "./pages/Dashboard";
import Players from "./pages/Players";
import Matches from "./pages/Matches";
import Tournament from "./pages/Tournament";
import Login from "./pages/Login";
import ChangePin from "./pages/ChangePin";

const NAV_ITEMS = [
  { to: "/", label: "대시보드" },
  { to: "/players", label: "선수 관리" },
  { to: "/matches", label: "경기 운영" },
  { to: "/tournament", label: "대회 편성" },
];

// 로그인 필요한 라우트 보호
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}


// 앱 레이아웃 (헤더 + 네비게이션 + 본문)
function AppLayout() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      {/* 상단 바 */}
      <header className="bg-primary-700 text-white px-4 py-3 flex items-center justify-between shadow">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">KNOC 배드민턴</h1>
          <p className="text-xs text-primary-100">월례대회 운영</p>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-primary-200">
                {isAdmin ? "관리자" : "선수"} · {user.emp_id}
              </p>
            </div>
            <button
              onClick={logout}
              className="text-xs text-primary-200 hover:text-white border border-primary-500 hover:border-primary-300 rounded px-2 py-1 transition-colors"
            >
              로그아웃
            </button>
          </div>
        )}
      </header>

      {/* 탭 내비게이션 */}
      <nav className="bg-white border-b border-slate-200 flex overflow-x-auto">
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              [
                "px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                isActive
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")
            }
          >
            {label}
          </NavLink>
        ))}
        {user && (
          <NavLink
            to="/change-pin"
            className={({ isActive }) =>
              [
                "ml-auto px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                isActive
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-slate-400 hover:text-slate-600",
              ].join(" ")
            }
          >
            🔑
          </NavLink>
        )}
      </nav>

      {/* 페이지 콘텐츠 */}
      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/players" element={<Players />} />
          <Route
            path="/matches"
            element={
              <RequireAuth>
                <Matches />
              </RequireAuth>
            }
          />
          <Route
            path="/tournament"
            element={
              <RequireAuth>
                <Tournament />
              </RequireAuth>
            }
          />
          <Route
            path="/change-pin"
            element={
              <RequireAuth>
                <ChangePin />
              </RequireAuth>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
