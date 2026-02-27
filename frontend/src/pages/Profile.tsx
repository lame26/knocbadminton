import { useEffect, useMemo, useState } from "react";
import { api, type Match, type Player, type RulesConfig } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

function nowMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthKey(date: string): string {
  return String(date ?? "").slice(0, 7);
}

function teamOf(m: Match, empId: string): 1 | 2 | 0 {
  if ([m.team1_player1, m.team1_player2].includes(empId)) return 1;
  if ([m.team2_player1, m.team2_player2].includes(empId)) return 2;
  return 0;
}

type PairStat = { empId: string; games: number; wins: number };
type OppStat = { empId: string; games: number; wins: number; losses: number };

type MonthForm = { month: string; games: number; wins: number };

export default function Profile() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Player | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rules, setRules] = useState<RulesConfig | null>(null);
  const [month, setMonth] = useState(nowMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playerName = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => map.set(p.emp_id, p.name));
    return (empId?: string | null) => (empId ? map.get(empId) ?? empId : "-");
  }, [players]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      api.players.stats(user.emp_id),
      api.players.matches(user.emp_id),
      api.players.list(false),
      api.settings.rules(),
    ])
      .then(([s, m, p, r]) => {
        setStats(s);
        setMatches(m);
        setPlayers(p);
        setRules(r);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  const myDoneMatches = useMemo(() => {
    if (!user) return [] as Match[];
    return matches.filter((m) => m.status === "done" && teamOf(m, user.emp_id) !== 0);
  }, [matches, user]);

  const myMonthMatches = useMemo(() => {
    if (!user) return [] as Match[];
    return matches.filter((m) => monthKey(m.date) === month && teamOf(m, user.emp_id) !== 0);
  }, [matches, user, month]);

  const doneMonthMatches = useMemo(() => myMonthMatches.filter((m) => m.status === "done"), [myMonthMatches]);

  const monthWins = useMemo(() => {
    if (!user) return 0;
    return doneMonthMatches.filter((m) => {
      const t = teamOf(m, user.emp_id);
      return t === 1 ? Number(m.score1) > Number(m.score2) : Number(m.score2) > Number(m.score1);
    }).length;
  }, [doneMonthMatches, user]);

  const monthWinRate = doneMonthMatches.length > 0 ? Math.round((monthWins / doneMonthMatches.length) * 100) : 0;

  const recentForm = useMemo(() => {
    if (!user) return [] as Array<"W" | "L" | "C">;
    return matches
      .filter((m) => teamOf(m, user.emp_id) !== 0)
      .sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)))
      .slice(0, 10)
      .map((m) => {
        if (m.status !== "done") return "C";
        const t = teamOf(m, user.emp_id);
        const win = t === 1 ? Number(m.score1) > Number(m.score2) : Number(m.score2) > Number(m.score1);
        return win ? "W" : "L";
      });
  }, [matches, user]);

  const nextTier = useMemo(() => {
    if (!stats || !rules) return null as [string, number] | null;
    const rows = Object.entries(rules.tier_rules).sort((a, b) => a[1] - b[1]);
    return rows.find(([, threshold]) => threshold > stats.score) ?? null;
  }, [stats, rules]);

  const partnerStats = useMemo(() => {
    if (!user) return [] as PairStat[];
    const map = new Map<string, PairStat>();

    for (const m of myDoneMatches) {
      const myTeam = teamOf(m, user.emp_id);
      const mate =
        myTeam === 1
          ? [m.team1_player1, m.team1_player2].find((x) => x && x !== user.emp_id) ?? null
          : [m.team2_player1, m.team2_player2].find((x) => x && x !== user.emp_id) ?? null;
      if (!mate) continue;

      const prev = map.get(mate) ?? { empId: mate, games: 0, wins: 0 };
      const win = myTeam === 1 ? Number(m.score1) > Number(m.score2) : Number(m.score2) > Number(m.score1);
      prev.games += 1;
      if (win) prev.wins += 1;
      map.set(mate, prev);
    }

    return [...map.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
  }, [myDoneMatches, user]);

  const bestPartner = partnerStats.length > 0 ? [...partnerStats].sort((a, b) => b.wins - a.wins || b.games - a.games)[0] : null;
  const bestPartnerRate =
    partnerStats.filter((p) => p.games >= 3).sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)[0] ?? null;

  const opponentStats = useMemo(() => {
    if (!user) return [] as OppStat[];
    const map = new Map<string, OppStat>();

    for (const m of myDoneMatches) {
      const myTeam = teamOf(m, user.emp_id);
      const opp = myTeam === 1 ? [m.team2_player1, m.team2_player2] : [m.team1_player1, m.team1_player2];
      const win = myTeam === 1 ? Number(m.score1) > Number(m.score2) : Number(m.score2) > Number(m.score1);
      for (const oid of opp) {
        if (!oid) continue;
        const prev = map.get(oid) ?? { empId: oid, games: 0, wins: 0, losses: 0 };
        prev.games += 1;
        if (win) prev.wins += 1;
        else prev.losses += 1;
        map.set(oid, prev);
      }
    }

    return [...map.values()].sort((a, b) => b.games - a.games);
  }, [myDoneMatches, user]);

  const topRival = opponentStats[0] ?? null;
  const hardRival =
    opponentStats.filter((o) => o.games >= 3).sort((a, b) => a.wins / a.games - b.wins / b.games || b.games - a.games)[0] ?? null;

  const topPartners = partnerStats.slice(0, 5);
  const topOpponents = opponentStats.slice(0, 5);
  const hardOpponents = opponentStats
    .filter((o) => o.games >= 3)
    .sort((a, b) => a.wins / a.games - b.wins / b.games || b.games - a.games)
    .slice(0, 5);

  const myAllMatches = useMemo(() => {
    if (!user) return [] as Match[];
    return matches.filter((m) => teamOf(m, user.emp_id) !== 0);
  }, [matches, user]);

  const statusSummary = useMemo(() => {
    const done = myAllMatches.filter((m) => m.status === "done").length;
    const cancelled = myAllMatches.filter((m) => m.status === "cancelled").length;
    const pending = myAllMatches.filter((m) => m.status === "pending").length;
    const disputed = myAllMatches.filter((m) => m.status === "disputed").length;
    return { done, cancelled, pending, disputed };
  }, [myAllMatches]);

  const scoreMetrics = useMemo(() => {
    if (!user || myDoneMatches.length === 0) {
      return {
        avgFor: 0,
        avgAgainst: 0,
        avgDiff: 0,
        closeGames: 0,
        closeWins: 0,
        blowoutWins: 0,
      };
    }
    let forTotal = 0;
    let againstTotal = 0;
    let closeGames = 0;
    let closeWins = 0;
    let blowoutWins = 0;

    for (const m of myDoneMatches) {
      const t = teamOf(m, user.emp_id);
      const myScore = t === 1 ? Number(m.score1) : Number(m.score2);
      const oppScore = t === 1 ? Number(m.score2) : Number(m.score1);
      const diff = Math.abs(myScore - oppScore);
      const win = myScore > oppScore;
      forTotal += myScore;
      againstTotal += oppScore;
      if (diff <= 2) {
        closeGames += 1;
        if (win) closeWins += 1;
      }
      if (win && diff >= 10) blowoutWins += 1;
    }

    const n = myDoneMatches.length;
    return {
      avgFor: Math.round((forTotal / n) * 10) / 10,
      avgAgainst: Math.round((againstTotal / n) * 10) / 10,
      avgDiff: Math.round(((forTotal - againstTotal) / n) * 10) / 10,
      closeGames,
      closeWins,
      blowoutWins,
    };
  }, [myDoneMatches, user]);

  const monthTrend = useMemo(() => {
    if (!user) return [] as MonthForm[];
    const map = new Map<string, MonthForm>();
    for (const m of myDoneMatches) {
      const mk = monthKey(m.date);
      const prev = map.get(mk) ?? { month: mk, games: 0, wins: 0 };
      const t = teamOf(m, user.emp_id);
      const win = t === 1 ? Number(m.score1) > Number(m.score2) : Number(m.score2) > Number(m.score1);
      prev.games += 1;
      if (win) prev.wins += 1;
      map.set(mk, prev);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  }, [myDoneMatches, user]);

  const maxGamesInTrend = Math.max(1, ...monthTrend.map((m) => m.games));

  if (loading) return <p className="text-slate-400 mt-8 text-center">불러오는 중...</p>;
  if (error) return <p className="text-red-500 mt-8 text-center">오류: {error}</p>;
  if (!stats) return <p className="text-slate-400 mt-8 text-center">프로필 데이터가 없습니다.</p>;

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{stats.name}</h2>
            <p className="text-sm text-slate-500 mt-1">사번 {stats.emp_id} · 티어 {stats.tier}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">현재 포인트</p>
            <p className="text-2xl font-bold text-slate-900">{stats.score}</p>
            <p className="text-xs text-slate-500 mt-1">XP {stats.xp}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <div className="bg-slate-50 rounded p-3"><p className="text-xs text-slate-500">총 경기</p><p className="text-lg font-semibold">{stats.match_count}</p></div>
          <div className="bg-slate-50 rounded p-3"><p className="text-xs text-slate-500">총 승리</p><p className="text-lg font-semibold">{stats.win_count}</p></div>
          <div className="bg-slate-50 rounded p-3"><p className="text-xs text-slate-500">전체 승률</p><p className="text-lg font-semibold">{stats.match_count > 0 ? Math.round((stats.win_count / stats.match_count) * 100) : 0}%</p></div>
          <div className="bg-slate-50 rounded p-3"><p className="text-xs text-slate-500">출석 횟수</p><p className="text-lg font-semibold">{(stats as Player & { attendance_count?: number }).attendance_count ?? 0}</p></div>
          <div className="bg-slate-50 rounded p-3"><p className="text-xs text-slate-500">연속 출석</p><p className="text-lg font-semibold">{(stats as Player & { consecutive_months?: number }).consecutive_months ?? 0}</p></div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <div>다음 티어: {nextTier ? `${nextTier[0]} (${nextTier[1]}점)` : "최고 티어"}</div>
          {nextTier && <div>필요 포인트: <span className="font-semibold">{Math.max(0, nextTier[1] - stats.score)}</span></div>}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <h3 className="font-medium text-slate-900 mb-3">고급 성과 지표</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">평균 득점</p>
            <p className="text-lg font-semibold">{scoreMetrics.avgFor}</p>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">평균 실점</p>
            <p className="text-lg font-semibold">{scoreMetrics.avgAgainst}</p>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">평균 점수차</p>
            <p className="text-lg font-semibold">{scoreMetrics.avgDiff}</p>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">접전 승률</p>
            <p className="text-lg font-semibold">
              {scoreMetrics.closeGames > 0 ? Math.round((scoreMetrics.closeWins / scoreMetrics.closeGames) * 100) : 0}%
            </p>
            <p className="text-[11px] text-slate-500 mt-1">점수차 2점 이내</p>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">대승 횟수</p>
            <p className="text-lg font-semibold">{scoreMetrics.blowoutWins}</p>
            <p className="text-[11px] text-slate-500 mt-1">10점차 이상 승리</p>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">상태 분포</p>
            <p className="text-sm font-semibold">확정 {statusSummary.done} · 취소 {statusSummary.cancelled}</p>
            <p className="text-[11px] text-slate-500 mt-1">대기 {statusSummary.pending} · 이의 {statusSummary.disputed}</p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <h3 className="font-medium text-slate-900 mb-3">파트너 & 라이벌 분석</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs text-emerald-700">베스트 파트너(최다 승)</p>
            <p className="font-semibold text-emerald-900 mt-1">{bestPartner ? playerName(bestPartner.empId) : "-"}</p>
            <p className="text-xs text-emerald-800 mt-1">{bestPartner ? `${bestPartner.wins}승 / ${bestPartner.games}경기` : "기록 없음"}</p>
          </div>
          <div className="rounded border border-cyan-200 bg-cyan-50 p-3">
            <p className="text-xs text-cyan-700">케미 파트너(승률, 3+)</p>
            <p className="font-semibold text-cyan-900 mt-1">{bestPartnerRate ? playerName(bestPartnerRate.empId) : "-"}</p>
            <p className="text-xs text-cyan-800 mt-1">{bestPartnerRate ? `${Math.round((bestPartnerRate.wins / bestPartnerRate.games) * 100)}% (${bestPartnerRate.games}경기)` : "기록 부족"}</p>
          </div>
          <div className="rounded border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">최다 대결 라이벌</p>
            <p className="font-semibold text-amber-900 mt-1">{topRival ? playerName(topRival.empId) : "-"}</p>
            <p className="text-xs text-amber-800 mt-1">{topRival ? `${topRival.games}경기` : "기록 없음"}</p>
          </div>
          <div className="rounded border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs text-rose-700">까다로운 상대(승률, 3+)</p>
            <p className="font-semibold text-rose-900 mt-1">{hardRival ? playerName(hardRival.empId) : "-"}</p>
            <p className="text-xs text-rose-800 mt-1">{hardRival ? `${Math.round((hardRival.wins / hardRival.games) * 100)}% (${hardRival.games}경기)` : "기록 부족"}</p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-4">
        <h3 className="font-medium text-slate-900">Top 5 전적표</h3>
        <div className="grid lg:grid-cols-3 gap-3">
          <div className="border border-slate-200 rounded overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 text-sm font-semibold">파트너 Top5 (경기수)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-slate-200 bg-white">
                  <th className="text-left px-2 py-1.5">선수</th>
                  <th className="text-right px-2 py-1.5">경기</th>
                  <th className="text-right px-2 py-1.5">승리</th>
                  <th className="text-right px-2 py-1.5">승률</th>
                </tr>
              </thead>
              <tbody>
                {topPartners.map((p) => (
                  <tr key={p.empId} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{playerName(p.empId)}</td>
                    <td className="px-2 py-1.5 text-right">{p.games}</td>
                    <td className="px-2 py-1.5 text-right">{p.wins}</td>
                    <td className="px-2 py-1.5 text-right">{Math.round((p.wins / p.games) * 100)}%</td>
                  </tr>
                ))}
                {topPartners.length === 0 && (
                  <tr><td colSpan={4} className="px-2 py-4 text-center text-slate-400">데이터 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border border-slate-200 rounded overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 text-sm font-semibold">상대 Top5 (대결수)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-slate-200 bg-white">
                  <th className="text-left px-2 py-1.5">선수</th>
                  <th className="text-right px-2 py-1.5">대결</th>
                  <th className="text-right px-2 py-1.5">승</th>
                  <th className="text-right px-2 py-1.5">패</th>
                </tr>
              </thead>
              <tbody>
                {topOpponents.map((o) => (
                  <tr key={o.empId} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{playerName(o.empId)}</td>
                    <td className="px-2 py-1.5 text-right">{o.games}</td>
                    <td className="px-2 py-1.5 text-right">{o.wins}</td>
                    <td className="px-2 py-1.5 text-right">{o.losses}</td>
                  </tr>
                ))}
                {topOpponents.length === 0 && (
                  <tr><td colSpan={4} className="px-2 py-4 text-center text-slate-400">데이터 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border border-slate-200 rounded overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 text-sm font-semibold">까다로운 상대 Top5 (3경기+)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-slate-200 bg-white">
                  <th className="text-left px-2 py-1.5">선수</th>
                  <th className="text-right px-2 py-1.5">대결</th>
                  <th className="text-right px-2 py-1.5">승률</th>
                </tr>
              </thead>
              <tbody>
                {hardOpponents.map((o) => (
                  <tr key={o.empId} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{playerName(o.empId)}</td>
                    <td className="px-2 py-1.5 text-right">{o.games}</td>
                    <td className="px-2 py-1.5 text-right">{Math.round((o.wins / o.games) * 100)}%</td>
                  </tr>
                ))}
                {hardOpponents.length === 0 && (
                  <tr><td colSpan={3} className="px-2 py-4 text-center text-slate-400">데이터 부족</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-slate-900">월별 내 경기 분석</h3>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 rounded p-3 border border-emerald-100"><p className="text-xs text-emerald-700">월 승리</p><p className="text-xl font-bold text-emerald-800">{monthWins}</p></div>
          <div className="bg-blue-50 rounded p-3 border border-blue-100"><p className="text-xs text-blue-700">월 확정 경기</p><p className="text-xl font-bold text-blue-800">{doneMonthMatches.length}</p></div>
          <div className="bg-violet-50 rounded p-3 border border-violet-100"><p className="text-xs text-violet-700">월 승률</p><p className="text-xl font-bold text-violet-800">{monthWinRate}%</p></div>
        </div>

        <div>
          <p className="text-sm text-slate-600 mb-2">최근 폼 (최신 10경기)</p>
          <div className="flex gap-1.5">
            {recentForm.length === 0 && <span className="text-sm text-slate-400">기록 없음</span>}
            {recentForm.map((f, idx) => (
              <span key={`${f}-${idx}`} className={[
                "inline-flex h-7 w-7 items-center justify-center rounded text-xs font-bold",
                f === "W" ? "bg-emerald-600 text-white" : f === "L" ? "bg-rose-600 text-white" : "bg-slate-300 text-slate-700",
              ].join(" ")}>{f}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
        <h3 className="font-medium text-slate-900">최근 6개월 퍼포먼스</h3>
        {monthTrend.length === 0 && <p className="text-sm text-slate-400">데이터가 없습니다.</p>}
        <div className="space-y-2">
          {monthTrend.map((m) => {
            const w = Math.max(8, Math.round((m.games / maxGamesInTrend) * 100));
            const wr = m.games > 0 ? Math.round((m.wins / m.games) * 100) : 0;
            return (
              <div key={m.month} className="grid grid-cols-[64px_1fr_auto] items-center gap-2">
                <span className="text-xs text-slate-500">{m.month}</span>
                <div className="h-6 bg-slate-100 rounded overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-sky-500 to-cyan-400" style={{ width: `${w}%` }} />
                </div>
                <span className="text-xs text-slate-600 whitespace-nowrap">{m.wins}/{m.games} · {wr}%</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <h3 className="font-medium text-slate-900 mb-3">최근 경기</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {matches.slice(0, 30).map((m) => (
            <div key={m.id} className="border border-slate-200 rounded p-2 text-sm">
              <p className="text-xs text-slate-500 mb-1">{m.date} · {m.group_name}조 · #{m.id} · {m.status}</p>
              <p>
                {playerName(m.team1_player1)}{m.team1_player2 ? `, ${playerName(m.team1_player2)}` : ""} {m.score1}:{m.score2}{" "}
                {playerName(m.team2_player1)}{m.team2_player2 ? `, ${playerName(m.team2_player2)}` : ""}
              </p>
            </div>
          ))}
          {matches.length === 0 && <p className="text-sm text-slate-400">최근 경기가 없습니다.</p>}
        </div>
      </section>
    </div>
  );
}
