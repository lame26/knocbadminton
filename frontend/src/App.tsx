import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Dashboard from "./pages/Dashboard";
import Players from "./pages/Players";
import Matches from "./pages/Matches";
import Tournament from "./pages/Tournament";
import Login from "./pages/Login";
import ChangePin from "./pages/ChangePin";
import MyMatches from "./pages/MyMatches";
import Mediation from "./pages/Mediation";
import MatchAdmin from "./pages/MatchAdmin";
import RoleAdmin from "./pages/RoleAdmin";
import SystemSettings from "./pages/SystemSettings";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Signup from "./pages/Signup";
import SignupAdmin from "./pages/SignupAdmin";

const BASE_NAV_ITEMS = [
  { to: "/", label: "홈" },
  { to: "/dashboard", label: "대시보드" },
  { to: "/profile", label: "내 프로필" },
  { to: "/players", label: "선수 관리" },
  { to: "/matches", label: "경기 조회" },
  { to: "/my-matches", label: "내 경기 입력" },
];

const ADMIN_NAV_ITEMS = [
  { to: "/signup-admin", label: "가입 승인" },
  { to: "/tournament", label: "대진 생성" },
  { to: "/mediation", label: "경기 중재" },
  { to: "/match-admin", label: "경기 관리" },
  { to: "/role-admin", label: "권한 관리" },
  { to: "/system-settings", label: "시스템 설정" },
];

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function navClass(isActive: boolean) {
  return [
    "px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all",
    isActive ? "bg-primary-700 text-white shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
  ].join(" ");
}

function AppLayout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const navItems = isAdmin ? [...BASE_NAV_ITEMS, ...ADMIN_NAV_ITEMS] : BASE_NAV_ITEMS;

  return (
    <div className="app-shell">
      <div className="max-w-6xl mx-auto px-4 py-5 md:py-7 space-y-4">
        <header className="glass-panel rounded-2xl px-4 py-4 md:px-6 md:py-5">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-slate-900">KNOC 배드민턴 클럽</h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1">경기 편성부터 포인트 집계, 운영 권한까지 한 흐름으로 관리합니다.</p>
            </div>
            {user && (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                  <p className="text-xs text-slate-500">{isAdmin ? "관리자" : "선수"}</p>
                </div>
                <button
                  onClick={() => {
                    logout();
                    navigate("/login", { replace: true });
                  }}
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100"
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </header>

        <nav className="section-card p-2 overflow-x-auto flex items-center gap-1.5">
          {navItems.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => navClass(isActive)}>
              {label}
            </NavLink>
          ))}
          {user && (
            <NavLink to="/change-pin" className={({ isActive }) => `ml-auto ${navClass(isActive)}`}>
              비밀번호 변경
            </NavLink>
          )}
        </nav>

        <main className="pb-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/players" element={<Players />} />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route
              path="/matches"
              element={
                <RequireAuth>
                  <Matches />
                </RequireAuth>
              }
            />
            <Route
              path="/my-matches"
              element={
                <RequireAuth>
                  <MyMatches />
                </RequireAuth>
              }
            />
            <Route
              path="/tournament"
              element={
                <RequireAdmin>
                  <Tournament />
                </RequireAdmin>
              }
            />
            <Route
              path="/mediation"
              element={
                <RequireAdmin>
                  <Mediation />
                </RequireAdmin>
              }
            />
            <Route
              path="/match-admin"
              element={
                <RequireAdmin>
                  <MatchAdmin />
                </RequireAdmin>
              }
            />
            <Route
              path="/role-admin"
              element={
                <RequireAdmin>
                  <RoleAdmin />
                </RequireAdmin>
              }
            />
            <Route
              path="/system-settings"
              element={
                <RequireAdmin>
                  <SystemSettings />
                </RequireAdmin>
              }
            />
            <Route
              path="/signup-admin"
              element={
                <RequireAdmin>
                  <SignupAdmin />
                </RequireAdmin>
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
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
