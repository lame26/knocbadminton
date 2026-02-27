import { useEffect, useState } from "react";
import { api, type Player } from "../api/client";

export default function RoleAdmin() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.players
      .list(false)
      .then((rows) => setPlayers(rows))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function setRole(empId: string, role: string) {
    setMessage(null);
    setError(null);
    try {
      await api.players.update(empId, { role });
      setMessage(`${empId} 권한을 ${role}로 변경했습니다.`);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "권한 변경에 실패했습니다.");
    }
  }

  if (loading) return <p className="text-slate-400 mt-8 text-center">불러오는 중...</p>;
  if (error) return <p className="text-red-500 mt-8 text-center">오류: {error}</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">권한 관리</h2>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="px-4 py-2 text-left">이름</th>
              <th className="px-4 py-2 text-left">사번</th>
              <th className="px-4 py-2 text-left">현재 권한</th>
              <th className="px-4 py-2 text-left">변경</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((p) => (
              <tr key={p.emp_id}>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2 text-slate-500">{p.emp_id}</td>
                <td className="px-4 py-2">{p.role}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRole(p.emp_id, "player")}
                      className="px-2 py-1 text-xs border border-slate-300 rounded"
                    >
                      선수
                    </button>
                    <button
                      onClick={() => setRole(p.emp_id, "admin")}
                      className="px-2 py-1 text-xs border border-slate-300 rounded"
                    >
                      관리자
                    </button>
                    <button
                      onClick={() => setRole(p.emp_id, "super_admin")}
                      className="px-2 py-1 text-xs border border-slate-300 rounded"
                    >
                      최고관리자
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
