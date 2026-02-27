import { useEffect, useState } from "react";
import { api, type Player } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

export default function Players() {
  const { isAdmin } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [search, setSearch] = useState("");
  const [newEmpId, setNewEmpId] = useState("");
  const [newName, setNewName] = useState("");
  const [newScore, setNewScore] = useState(1000);
  const [editName, setEditName] = useState("");
  const [editScore, setEditScore] = useState(1000);
  const [editActive, setEditActive] = useState(true);
  const [editRole, setEditRole] = useState("player");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    api.players
      .list(false)
      .then((rows) => {
        const sorted = [...rows].sort((a, b) => b.score - a.score);
        setPlayers(sorted);
        if (!selectedEmpId && sorted.length > 0) setSelectedEmpId(sorted[0].emp_id);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const selectedPlayer = players.find((p) => p.emp_id === selectedEmpId) ?? null;

  useEffect(() => {
    if (!selectedPlayer) return;
    setEditName(selectedPlayer.name);
    setEditScore(selectedPlayer.score);
    setEditActive(selectedPlayer.is_active);
    setEditRole(selectedPlayer.role);
  }, [selectedPlayer]);

  if (loading) return <p className="text-slate-400 mt-8 text-center">불러오는 중...</p>;
  if (error) return <p className="text-red-500 mt-8 text-center">오류: {error}</p>;

  const active = players.filter((p) => p.is_active);
  const filtered = players.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.emp_id.toLowerCase().includes(q);
  });

  async function createPlayer() {
    if (!newEmpId.trim() || !newName.trim()) {
      setMessage("사번과 이름은 필수입니다.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api.players.create({ emp_id: newEmpId.trim(), name: newName.trim(), score: newScore });
      setNewEmpId("");
      setNewName("");
      setNewScore(1000);
      setMessage("선수를 추가했습니다.");
      load();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "선수 추가에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function savePlayer() {
    if (!selectedPlayer) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.players.update(selectedPlayer.emp_id, {
        name: editName.trim(),
        score: editScore,
        is_active: editActive,
        role: editRole,
      });
      setMessage("사용자 정보를 수정했습니다.");
      load();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "사용자 정보 수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivatePlayer() {
    if (!selectedPlayer) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.players.delete(selectedPlayer.emp_id);
      setMessage("사용자를 비활성화했습니다.");
      load();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "비활성화에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function hardDeletePlayer() {
    if (!selectedPlayer) return;
    const ok = confirm(`${selectedPlayer.name} (${selectedPlayer.emp_id}) 계정을 완전삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`);
    if (!ok) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.players.hardDelete(selectedPlayer.emp_id);
      setMessage("회원을 완전삭제했습니다.");
      setSelectedEmpId("");
      load();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "회원 완전삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!selectedPlayer) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.auth.resetPin(selectedPlayer.emp_id);
      setMessage(res.message);
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "비밀번호 초기화에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-medium text-slate-900">선수 목록 ({active.length}명 활성)</h2>
        <button onClick={load} className="text-xs text-primary-600 hover:underline">
          새로고침
        </button>
      </div>

      {isAdmin && (
        <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">신규 사용자 추가</h3>
          <div className="grid sm:grid-cols-4 gap-2">
            <input value={newEmpId} onChange={(e) => setNewEmpId(e.target.value)} placeholder="사번" className="border border-slate-300 rounded px-3 py-2 text-sm" />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="이름" className="border border-slate-300 rounded px-3 py-2 text-sm" />
            <input type="number" value={newScore} onChange={(e) => setNewScore(Number(e.target.value))} className="border border-slate-300 rounded px-3 py-2 text-sm" />
            <button onClick={createPlayer} disabled={saving} className="bg-primary-600 text-white rounded px-3 py-2 text-sm hover:bg-primary-700 disabled:opacity-50">
              추가
            </button>
          </div>
        </section>
      )}

      <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름/사번 검색"
            className="border border-slate-300 rounded px-3 py-2 text-sm"
          />
          {isAdmin && (
            <select value={selectedEmpId} onChange={(e) => setSelectedEmpId(e.target.value)} className="border border-slate-300 rounded px-3 py-2 text-sm">
              {players.map((p) => (
                <option key={p.emp_id} value={p.emp_id}>
                  {p.name} ({p.emp_id})
                </option>
              ))}
            </select>
          )}
        </div>

        {isAdmin && selectedPlayer && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
            <input value={selectedPlayer.emp_id} disabled className="border border-slate-300 bg-slate-50 rounded px-3 py-2 text-sm text-slate-500" />
            <input value={editName} onChange={(e) => setEditName(e.target.value)} className="border border-slate-300 rounded px-3 py-2 text-sm" />
            <input type="number" value={editScore} onChange={(e) => setEditScore(Number(e.target.value))} className="border border-slate-300 rounded px-3 py-2 text-sm" />
            <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="border border-slate-300 rounded px-3 py-2 text-sm">
              <option value="player">선수</option>
              <option value="admin">관리자</option>
              <option value="super_admin">최고관리자</option>
            </select>
            <label className="text-sm text-slate-700 flex items-center gap-2">
              <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
              활성
            </label>
            <button onClick={savePlayer} disabled={saving} className="bg-slate-800 text-white rounded px-3 py-2 text-sm hover:bg-slate-900 disabled:opacity-50">
              정보 저장
            </button>
          </div>
        )}

        {isAdmin && selectedPlayer && (
          <div className="flex gap-2">
            <button onClick={resetPassword} disabled={saving} className="px-3 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50">
              비밀번호 초기화
            </button>
            <button onClick={deactivatePlayer} disabled={saving} className="px-3 py-2 text-sm border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50">
              비활성화
            </button>
            <button onClick={hardDeletePlayer} disabled={saving} className="px-3 py-2 text-sm bg-red-700 text-white rounded hover:bg-red-800 disabled:opacity-50">
              회원 완전삭제
            </button>
          </div>
        )}

        {message && <p className="text-sm text-slate-600">{message}</p>}
      </section>

      <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">이름</th>
                <th className="px-4 py-2 text-left">사번</th>
                <th className="px-4 py-2 text-right">포인트</th>
                <th className="px-4 py-2 text-left">티어</th>
                <th className="px-4 py-2 text-right">경기</th>
                <th className="px-4 py-2 text-right">승</th>
                <th className="px-4 py-2 text-left">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.emp_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-slate-500 font-mono text-xs">{p.emp_id}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.score.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p.tier}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.match_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.win_count}</td>
                  <td className="px-4 py-2">
                    <span className={["text-xs px-2 py-0.5 rounded-full", p.is_active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"].join(" ")}>
                      {p.is_active ? "활성" : "비활성"}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-slate-400 text-xs">
                    검색 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
