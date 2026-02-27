import { useEffect, useState } from "react";
import { api, type Player, type Match } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

interface MatchDraft {
  id: number;
  group_name: string;
  team1_player1: string;
  team1_player2: string;
  team2_player1: string;
  team2_player2: string;
}

let draftSeq = 0;

function PlayerSelect({
  value,
  onChange,
  players,
  placeholder,
  exclude,
}: {
  value: string;
  onChange: (v: string) => void;
  players: Player[];
  placeholder: string;
  exclude: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      <option value="">{placeholder}</option>
      {players
        .filter((p) => p.is_active && (p.emp_id === value || !exclude.includes(p.emp_id)))
        .map((p) => (
          <option key={p.emp_id} value={p.emp_id}>
            {p.name}
          </option>
        ))}
    </select>
  );
}

function MatchDraftCard({
  draft,
  players,
  onChange,
  onRemove,
}: {
  draft: MatchDraft;
  players: Player[];
  onChange: (d: MatchDraft) => void;
  onRemove: () => void;
}) {
  const selected = [draft.team1_player1, draft.team1_player2, draft.team2_player1, draft.team2_player2].filter(Boolean);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <input
          type="text"
          value={draft.group_name}
          onChange={(e) => onChange({ ...draft, group_name: e.target.value })}
          placeholder="그룹명 (예: A조)"
          className="border border-slate-300 rounded px-2 py-1 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-600">
          삭제
        </button>
      </div>

      <div className="grid grid-cols-3 items-center gap-2 text-center">
        <div className="space-y-1">
          <PlayerSelect
            value={draft.team1_player1}
            onChange={(v) => onChange({ ...draft, team1_player1: v })}
            players={players}
            placeholder="팀1 선수1"
            exclude={selected.filter((s) => s !== draft.team1_player1)}
          />
          <PlayerSelect
            value={draft.team1_player2}
            onChange={(v) => onChange({ ...draft, team1_player2: v })}
            players={players}
            placeholder="팀1 선수2 (선택)"
            exclude={selected.filter((s) => s !== draft.team1_player2)}
          />
        </div>
        <span className="text-slate-400 font-bold text-lg">VS</span>
        <div className="space-y-1">
          <PlayerSelect
            value={draft.team2_player1}
            onChange={(v) => onChange({ ...draft, team2_player1: v })}
            players={players}
            placeholder="팀2 선수1"
            exclude={selected.filter((s) => s !== draft.team2_player1)}
          />
          <PlayerSelect
            value={draft.team2_player2}
            onChange={(v) => onChange({ ...draft, team2_player2: v })}
            players={players}
            placeholder="팀2 선수2 (선택)"
            exclude={selected.filter((s) => s !== draft.team2_player2)}
          />
        </div>
      </div>
    </div>
  );
}

export default function Tournament() {
  const { isAdmin } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [players, setPlayers] = useState<Player[]>([]);
  const [drafts, setDrafts] = useState<MatchDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.players.list(true).then(setPlayers).catch(() => {});
  }, []);

  const addDraft = () => {
    setDrafts((prev) => [
      ...prev,
      { id: ++draftSeq, group_name: "", team1_player1: "", team1_player2: "", team2_player1: "", team2_player2: "" },
    ]);
  };

  const updateDraft = (id: number, d: MatchDraft) => {
    setDrafts((prev) => prev.map((x) => (x.id === id ? d : x)));
  };

  const removeDraft = (id: number) => {
    setDrafts((prev) => prev.filter((x) => x.id !== id));
  };

  const generate = async () => {
    const valid = drafts.filter((d) => d.team1_player1 && d.team2_player1);
    if (valid.length === 0) {
      setError("최소 1경기 이상 입력해주세요 (팀1·팀2 각각 선수1 필수)");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.tournaments.generate({
        date,
        matches: valid.map(({ group_name, team1_player1, team1_player2, team2_player1, team2_player2 }) => ({
          group_name,
          team1_player1,
          team1_player2,
          team2_player1,
          team2_player2,
        })),
      });
      setResult(res.matches);
      setDrafts([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center shadow-sm">
        <p className="text-sm text-slate-500">관리자만 대진을 편성할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600">대회 날짜</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {drafts.map((d) => (
        <MatchDraftCard
          key={d.id}
          draft={d}
          players={players}
          onChange={(updated) => updateDraft(d.id, updated)}
          onRemove={() => removeDraft(d.id)}
        />
      ))}

      <button
        onClick={addDraft}
        className="w-full border-2 border-dashed border-slate-300 text-slate-500 text-sm py-3 rounded-lg hover:border-primary-400 hover:text-primary-600 transition-colors"
      >
        + 경기 추가
      </button>

      {drafts.length > 0 && (
        <div className="space-y-2">
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            onClick={generate}
            disabled={loading}
            className="w-full bg-primary-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "생성 중..." : `${date} 대진 생성 (${drafts.filter((d) => d.team1_player1 && d.team2_player1).length}경기)`}
          </button>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-medium text-green-800 mb-3">
            대진 생성 완료 — {result.length}경기
          </p>
          <div className="space-y-2">
            {result.map((m) => (
              <div key={m.id} className="bg-white rounded border border-green-100 px-3 py-2 text-sm">
                <span className="text-xs text-slate-400 mr-2">{m.group_name}</span>
                <span className="font-medium">{m.team1_player1}</span>
                {m.team1_player2 && <span className="text-slate-500">·{m.team1_player2}</span>}
                <span className="mx-2 text-slate-400">vs</span>
                <span className="font-medium">{m.team2_player1}</span>
                {m.team2_player2 && <span className="text-slate-500">·{m.team2_player2}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
