import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Players from "./pages/Players";
import Matches from "./pages/Matches";
import Tournament from "./pages/Tournament";

const NAV_ITEMS = [
  { to: "/", label: "대시보드" },
  { to: "/players", label: "선수 관리" },
  { to: "/matches", label: "경기 운영" },
  { to: "/tournament", label: "대회 편성" },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        {/* 상단 바 */}
        <header className="bg-primary-700 text-white px-4 py-3 flex items-center justify-between shadow">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">KNOC 배드민턴</h1>
            <p className="text-xs text-primary-100">월례대회 운영</p>
          </div>
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
        </nav>

        {/* 페이지 콘텐츠 */}
        <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/players" element={<Players />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/tournament" element={<Tournament />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
