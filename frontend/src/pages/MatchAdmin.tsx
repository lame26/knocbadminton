import { useEffect, useMemo, useState } from "react";
import { api, type Match, type Player } from "../api/client";

function nowMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

type MatchForm = {
  date: string;
  group_name: string;
  team1_player1: string;
  team1_player2: string;
  team2_player1: string;
  team2_player2: string;
  score1: number;
  score2: number;
  status: "pending" | "done" | "disputed" | "cancelled";
  dispute_reason: string;
};

function fromMatch(m: Match): MatchForm {
  return {
    date: m.date,
    group_name: m.group_name ?? "A",
    team1_player1: m.team1_player1 ?? "",
    team1_player2: m.team1_player2 ?? "",
    team2_player1: m.team2_player1 ?? "",
    team2_player2: m.team2_player2 ?? "",
    score1: m.score1 ?? 0,
    score2: m.score2 ?? 0,
    status: m.status,
    dispute_reason: m.dispute_reason ?? "",
  };
}

export default function MatchAdmin() {
  const [month, setMonth] = useState(nowMonth());
  const [monthClosed, setMonthClosed] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<MatchForm>({
    date: nowMonth(),
    group_name: "A",
    team1_player1: "",
    team1_player2: "",
    team2_player1: "",
    team2_player2: "",
    score1: 0,
    score2: 0,
    status: "pending",
    dispute_reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameMap = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => map.set(p.emp_id, p.name));
    return map;
  }, [players]);

  const load = (target: string) => {
    setLoading(true);
    setMessage(null);
    setError(null);
    Promise.all([api.matches.byDate(target), api.players.list(true), api.settings.monthClosed(target)])
      .then(([matchRows, playerRows, closeState]) => {
        setMatches(matchRows);
        setPlayers(playerRows);
        setMonthClosed(closeState.closed);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(month), [month]);

  function pickMatch(id: number) {
    setSelectedId(id);
    const found = matches.find((m) => m.id === id);
    if (found) setForm(fromMatch(found));
  }

  async function createMatch() {
    if (!form.date || !form.team1_player1 || !form.team2_player1) {
      setError("월, 팀1 선수1, 팀2 선수1은 필수입니다.");
      return;
    }
    setError(null);
    try {
      await api.matches.create({
        ...form,
        team1_player2: form.team1_player2 || undefined,
        team2_player2: form.team2_player2 || undefined,
        dispute_reason: form.dispute_reason || undefined,
      });
      setMessage("경기를 생성했습니다.");
      load(month);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "경기 생성에 실패했습니다.");
    }
  }

  async function updateMatch() {
    if (!selectedId) return;
    setError(null);
    try {
      await api.matches.update(selectedId, {
        ...form,
        team1_player2: form.team1_player2 || null,
        team2_player2: form.team2_player2 || null,
        dispute_reason: form.dispute_reason || null,
      });
      setMessage("경기를 수정했습니다.");
      load(month);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "경기 수정에 실패했습니다.");
    }
  }

  async function deleteMatch() {
    if (!selectedId) return;
    const ok = confirm(`경기 #${selectedId}를 삭제하시겠습니까?`);
    if (!ok) return;
    setError(null);
    try {
      await api.matches.delete(selectedId);
      setMessage("경기를 삭제했습니다.");
      setSelectedId(null);
      load(month);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "경기 삭제에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600">대상 월</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        />
        <button onClick={() => load(month)} className="text-xs text-primary-600 hover:underline ml-auto">
          새로고침
        </button>
      </div>

      {loading && <p className="text-slate-400 text-center">불러오는 중...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {message && <p className="text-slate-600">{message}</p>}
      {monthClosed && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {month} 월은 마감 상태입니다. 경기 생성/수정/삭제가 잠겨 있습니다.
        </p>
      )}

      <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
        <h3 className="font-medium text-slate-900 mb-2">경기 목록</h3>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {matches.map((m) => (
            <button
              key={m.id}
              onClick={() => pickMatch(m.id)}
              className={[
                "w-full text-left p-2 rounded border text-sm",
                selectedId === m.id ? "border-primary-500 bg-primary-50" : "border-slate-200",
              ].join(" ")}
            >
              #{m.id} [{m.group_name}조] {nameMap.get(m.team1_player1) ?? m.team1_player1}
              {m.team1_player2 ? `, ${nameMap.get(m.team1_player2) ?? m.team1_player2}` : ""} vs{" "}
              {nameMap.get(m.team2_player1) ?? m.team2_player1}
              {m.team2_player2 ? `, ${nameMap.get(m.team2_player2) ?? m.team2_player2}` : ""} ({m.score1}:{m.score2})
            </button>
          ))}
          {matches.length === 0 && <p className="text-sm text-slate-400">경기가 없습니다.</p>}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 space-y-3">
        <h3 className="font-medium text-slate-900">{selectedId ? `경기 #${selectedId} 수정` : "경기 수동 생성"}</h3>

        <div className="grid sm:grid-cols-3 gap-2">
          <input
            type="month"
            value={form.date}
            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm"
          />
          <input
            value={form.group_name}
            onChange={(e) => setForm((p) => ({ ...p, group_name: e.target.value }))}
            placeholder="조 (예: A)"
            className="border border-slate-300 rounded px-2 py-1.5 text-sm"
          />
          <select
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as MatchForm["status"] }))}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="pending">대기</option>
            <option value="done">확정</option>
            <option value="disputed">이의</option>
            <option value="cancelled">취소</option>
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          <select
            value={form.team1_player1}
            onChange={(e) => setForm((p) => ({ ...p, team1_player1: e.target.value }))}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">팀1 선수1 선택</option>
            {players.map((p) => (
              <option key={p.emp_id} value={p.emp_id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={form.team1_player2}
            onChange={(e) => setForm((p) => ({ ...p, team1_player2: e.target.value }))}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">팀1 선수2 (선택)</option>
            {players.map((p) => (
              <option key={p.emp_id} value={p.emp_id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={form.team2_player1}
            onChange={(e) => setForm((p) => ({ ...p, team2_player1: e.target.value }))}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">팀2 선수1 선택</option>
            {players.map((p) => (
              <option key={p.emp_id} value={p.emp_id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={form.team2_player2}
            onChange={(e) => setForm((p) => ({ ...p, team2_player2: e.target.value }))}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">팀2 선수2 (선택)</option>
            {players.map((p) => (
              <option key={p.emp_id} value={p.emp_id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          <input
            type="number"
            min={0}
            value={form.score1}
            onChange={(e) => setForm((p) => ({ ...p, score1: Number(e.target.value) }))}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            placeholder="팀1 점수"
          />
          <input
            type="number"
            min={0}
            value={form.score2}
            onChange={(e) => setForm((p) => ({ ...p, score2: Number(e.target.value) }))}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            placeholder="팀2 점수"
          />
        </div>

        <input
          value={form.dispute_reason}
          onChange={(e) => setForm((p) => ({ ...p, dispute_reason: e.target.value }))}
          placeholder="이의 사유 (선택)"
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        />

        <div className="flex gap-2">
          <button
            onClick={createMatch}
            disabled={monthClosed}
            className="px-3 py-2 text-sm bg-primary-600 text-white rounded disabled:opacity-50"
          >
            새 경기 생성
          </button>
          <button
            onClick={updateMatch}
            disabled={!selectedId || monthClosed}
            className="px-3 py-2 text-sm bg-slate-800 text-white rounded disabled:opacity-50"
          >
            선택 경기 수정
          </button>
          <button
            onClick={deleteMatch}
            disabled={!selectedId || monthClosed}
            className="px-3 py-2 text-sm border border-red-300 text-red-700 rounded disabled:opacity-50"
          >
            선택 경기 삭제
          </button>
        </div>
      </section>
    </div>
  );
}
