// Workers API 클라이언트
// 개발 중에는 vite.config.ts의 proxy 설정으로 /api/* → localhost:8787/* 로 포워딩
// 프로덕션에서는 VITE_API_URL 환경변수로 Workers 도메인 지정

const BASE = import.meta.env.VITE_API_URL ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── 타입 ──────────────────────────────────────────────────────────────────
export interface Player {
  emp_id: string;
  name: string;
  score: number;
  xp: number;
  tier: string;
  win_count: number;
  match_count: number;
  streak: number;
  is_active: boolean;
  role: string;
}

export interface Match {
  id: number;
  date: string;
  group_name: string;
  team1_player1: string;
  team1_player2: string;
  team2_player1: string;
  team2_player2: string;
  score1: number;
  score2: number;
  status: "pending" | "done" | "disputed";
  input_by: string | null;
  approved_by: string | null;
  dispute_reason: string | null;
}

export interface DaySummary {
  date: string;
  total: number;
  done: number;
  pending: number;
  disputed: number;
}

// ── API 함수 ──────────────────────────────────────────────────────────────
export const api = {
  health: () => request<{ status: string }>("/health"),

  players: {
    list: (activeOnly = true) =>
      request<Player[]>(`/players?active_only=${activeOnly}`),
    create: (body: { emp_id: string; name: string; score?: number }) =>
      request<Player>("/players", { method: "POST", body: JSON.stringify(body) }),
    update: (empId: string, body: Partial<Player>) =>
      request<Player>(`/players/${empId}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (empId: string) =>
      request<{ success: boolean }>(`/players/${empId}`, { method: "DELETE" }),
    stats: (empId: string) => request<Player>(`/players/${empId}/stats`),
    matches: (empId: string) => request<Match[]>(`/players/${empId}/matches`),
  },

  ranking: (limit = 20) => request<Player[]>(`/ranking?limit=${limit}`),

  matches: {
    byDate: (date: string) => request<Match[]>(`/matches/${date}`),
    submitScore: (date: string, matchId: number, body: { score1: number; score2: number; input_by: string }) =>
      request<Match>(`/matches/${date}/${matchId}/submit-score`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    approve: (date: string, matchId: number, approvedBy: string) =>
      request<Match>(`/matches/${date}/${matchId}/approve`, {
        method: "POST",
        body: JSON.stringify({ approved_by: approvedBy }),
      }),
    reject: (date: string, matchId: number, reason: string) =>
      request<Match>(`/matches/${date}/${matchId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
  },

  summary: (date: string) => request<DaySummary>(`/summary/${date}`),

  tournaments: {
    generate: (body: {
      date: string;
      matches: Array<{
        group_name: string;
        team1_player1: string;
        team1_player2: string;
        team2_player1: string;
        team2_player2: string;
      }>;
    }) =>
      request<{ inserted: number; matches: Match[] }>("/tournaments/generate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
};
