import { useEffect, useState } from "react";
import { api, type Match } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "승인 대기", cls: "bg-yellow-50 text-yellow-700" },
  done: { label: "확정", cls: "bg-green-50 text-green-700" },
  disputed: { label: "이의제기", cls: "bg-red-50 text-red-700" },
};

function ScoreInputForm({ match, onDone }: { match: Match; onDone: () => void }) {
  const [s1, setS1] = useState("");
  const [s2, setS2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const score1 = parseInt(s1);
    const score2 = parseInt(s2);
    if (isNaN(score1) || isNaN(score2) || s1 === "" || s2 === "") {
      setError("점수를 올바르게 입력해주세요");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.matches.submitScore(match.id, { score1, score2 });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <p className="text-xs text-slate-500 mb-2">점수 입력</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          value={s1}
          onChange={(e) => setS1(e.target.value)}
          placeholder="팀1"
          className="w-16 border border-slate-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
          disabled={loading}
        />
        <span className="text-slate-400 font-bold">:</span>
        <input
          type="number"
          min="0"
          value={s2}
          onChange={(e) => setS2(e.target.value)}
          placeholder="팀2"
          className="w-16 border border-slate-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
          disabled={loading}
        />
        <button
          onClick={submit}
          disabled={loading}
          className="ml-2 bg-primary-600 text-white text-xs px-3 py-1.5 rounded hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "저장 중..." : "입력"}
        </button>
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

function RejectForm({ match, onDone }: { match: Match; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.matches.reject(match.id, reason);
      onDone();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (!show) {
    return (
      <button onClick={() => setShow(true)} className="text-xs text-red-600 hover:underline">
        이의제기
      </button>
    );
  }

  return (
    <div className="mt-2 w-full">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="이의제기 사유 (선택)"
        className="w-full border border-red-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
      />
      <div className="flex gap-2 mt-1">
        <button
          onClick={submit}
          disabled={loading}
          className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50"
        >
          제출
        </button>
        <button onClick={() => setShow(false)} className="text-xs text-slate-400 hover:text-slate-600">
          취소
        </button>
      </div>
    </div>
  );
}

export default function Matches() {
  const { user, isAdmin } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (d: string) => {
    setLoading(true);
    setError(null);
    api.matches
      .byDate(d)
      .then(setMatches)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(date), [date]);

  const approve = async (matchId: number) => {
    try {
      await api.matches.approve(matchId);
      load(date);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600">날짜</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button onClick={() => load(date)} className="text-xs text-primary-600 hover:underline ml-auto">
          새로고침
        </button>
      </div>

      {loading && <p className="text-slate-400 text-center mt-8">불러오는 중...</p>}
      {error && <p className="text-red-500 text-center mt-8">오류: {error}</p>}
      {!loading && !error && matches.length === 0 && (
        <p className="text-slate-400 text-center mt-8">{date} 경기 데이터가 없습니다.</p>
      )}

      {matches.map((m) => {
        const s = STATUS_LABEL[m.status] ?? { label: m.status, cls: "bg-slate-100 text-slate-500" };
        const participants = [m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2].filter(Boolean);
        const isParticipant = user ? participants.includes(user.emp_id) : false;
        const canInputScore = (isParticipant || isAdmin) && m.status === "pending" && !m.input_by;
        const canApprove = isAdmin && m.status === "pending" && !!m.input_by;
        const canReject = (isParticipant || isAdmin) && m.status === "pending" && !!m.input_by;

        return (
          <div key={m.id} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs font-medium text-slate-500">{m.group_name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
            </div>

            <div className="grid grid-cols-3 items-center text-center gap-2">
              <div className="text-sm">
                <p className="font-medium">{m.team1_player1}</p>
                {m.team1_player2 && <p className="text-slate-500 text-xs">{m.team1_player2}</p>}
              </div>
              <div className="text-xl font-bold tabular-nums">
                {m.score1} : {m.score2}
              </div>
              <div className="text-sm">
                <p className="font-medium">{m.team2_player1}</p>
                {m.team2_player2 && <p className="text-slate-500 text-xs">{m.team2_player2}</p>}
              </div>
            </div>

            {m.dispute_reason && (
              <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                이의제기: {m.dispute_reason}
              </p>
            )}

            {canInputScore && <ScoreInputForm match={m} onDone={() => load(date)} />}

            {(canApprove || canReject) && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                {m.input_by && (
                  <p className="text-xs text-slate-400 mb-2">입력자: {m.input_by}</p>
                )}
                <div className="flex items-start gap-3">
                  {canReject && <RejectForm match={m} onDone={() => load(date)} />}
                  {canApprove && (
                    <button
                      onClick={() => approve(m.id)}
                      className="ml-auto text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition-colors"
                    >
                      승인
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
