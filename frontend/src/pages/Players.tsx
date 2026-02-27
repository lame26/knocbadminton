import { useEffect, useState } from "react";
import { api, type Player } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

function AddPlayerModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [empId, setEmpId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!empId.trim() || !name.trim()) {
      setError("사번과 이름을 입력해주세요");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.players.create({ emp_id: empId.trim(), name: name.trim() });
      onDone();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
        <h3 className="font-semibold text-slate-900 mb-4">선수 추가</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-600 block mb-1">사번</label>
            <input
              type="text"
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="예: 2143192"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 block mb-1">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="예: 홍길동"
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-300 text-slate-600 text-sm py-2 rounded-lg hover:bg-slate-50"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 bg-primary-600 text-white text-sm py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? "추가 중..." : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPlayerModal({
  player,
  onClose,
  onDone,
}: {
  player: Player;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [role, setRole] = useState(player.role ?? "player");
  const [isActive, setIsActive] = useState(player.is_active);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.players.update(player.emp_id, { name, role, is_active: isActive });
      onDone();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const resetPin = async () => {
    if (!confirm(`${player.name}의 PIN을 초기화(사번으로 재설정)하시겠습니까?`)) return;
    setLoading(true);
    try {
      await api.auth.resetPin(player.emp_id);
      alert("PIN이 초기화되었습니다.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
        <h3 className="font-semibold text-slate-900 mb-1">선수 수정</h3>
        <p className="text-xs text-slate-400 mb-4">{player.emp_id}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-600 block mb-1">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 block mb-1">역할</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="player">선수</option>
              <option value="admin">관리자</option>
              <option value="super_admin">최고 관리자</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-primary-600"
            />
            <span className="text-sm text-slate-700">활동 중</span>
          </label>
          {error && <p className="text-red-500 text-xs">{error}</p>}
        </div>
        <button
          onClick={resetPin}
          disabled={loading}
          className="mt-4 w-full text-xs text-slate-500 border border-slate-200 rounded-lg py-2 hover:bg-slate-50 disabled:opacity-50"
        >
          PIN 초기화 (사번으로 재설정)
        </button>
        <div className="flex gap-2 mt-3">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-300 text-slate-600 text-sm py-2 rounded-lg hover:bg-slate-50"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 bg-primary-600 text-white text-sm py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Players() {
  const { isAdmin } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);

  const load = () => {
    setLoading(true);
    api.players
      .list(false)
      .then(setPlayers)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const active = players.filter((p) => p.is_active);

  if (loading) return <p className="text-slate-400 mt-8 text-center">불러오는 중...</p>;
  if (error) return <p className="text-red-500 mt-8 text-center">오류: {error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-medium text-slate-900">선수 목록 ({active.length}명 활동 중)</h2>
        <div className="flex gap-2">
          <button onClick={load} className="text-xs text-primary-600 hover:underline">
            새로고침
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowAdd(true)}
              className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded hover:bg-primary-700 transition-colors"
            >
              + 선수 추가
            </button>
          )}
        </div>
      </div>

      <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">이름</th>
                <th className="px-4 py-2 text-left">사번</th>
                <th className="px-4 py-2 text-right">점수</th>
                <th className="px-4 py-2 text-left">티어</th>
                <th className="px-4 py-2 text-right">경기수</th>
                <th className="px-4 py-2 text-right">승</th>
                <th className="px-4 py-2 text-left">상태</th>
                {isAdmin && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((p) => (
                <tr key={p.emp_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-slate-500 font-mono text-xs">{p.emp_id}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.score.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {p.tier}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.match_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.win_count}</td>
                  <td className="px-4 py-2">
                    <span
                      className={[
                        "text-xs px-2 py-0.5 rounded-full",
                        p.is_active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400",
                      ].join(" ")}
                    >
                      {p.is_active ? "활동" : "비활동"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => setEditing(p)}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        수정
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showAdd && <AddPlayerModal onClose={() => setShowAdd(false)} onDone={load} />}
      {editing && <EditPlayerModal player={editing} onClose={() => setEditing(null)} onDone={load} />}
    </div>
  );
}
