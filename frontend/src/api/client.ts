// Workers API 클라이언트
// 개발 중에는 vite.config.ts의 proxy 설정으로 /api/* → localhost:8787/* 로 포워딩
// 프로덕션에서는 VITE_API_URL 환경변수로 Workers 도메인 지정

import { API_BASE } from "../config/apiBase";

const BASE = API_BASE;
const TOKEN_KEY = "knoc_token";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
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
  team1_player2: string | null;
  team2_player1: string;
  team2_player2: string | null;
  score1: number;
  score2: number;
  status: "pending" | "done" | "disputed" | "cancelled";
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
  cancelled?: number;
}

export interface RulesConfig {
  score_rules: Record<string, number>;
  tier_rules: Record<string, number>;
}
export interface MonthCloseConfig {
  closed_months: string[];
}
export interface MonthCloseState {
  month: string;
  closed: boolean;
}

export interface SignupRequest {
  emp_id: string;
  name: string;
  join_date: string | null;
  role: string;
  is_active: boolean;
}
export interface AuditLogRow {
  id: number;
  created_at: string;
  actor_emp_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details?: Record<string, unknown> | null;
}

// ── API 함수 ──────────────────────────────────────────────────────────────
export const api = {
  health: () => request<{ status: string }>("/health"),

  auth: {
    me: () => request<Player>("/me"),
    signup: (body: { emp_id: string; name: string; password: string }) =>
      request<{ success: boolean; message: string }>("/signup", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    changePin: (current_pin: string, new_pin: string) =>
      request<{ success: boolean; message: string }>("/change-pin", {
        method: "POST",
        body: JSON.stringify({ current_pin, new_pin }),
      }),
    resetPin: (emp_id: string) =>
      request<{ success: boolean; message: string }>(`/admin/reset-pin/${emp_id}`, {
        method: "POST",
      }),
  },

  players: {
    list: (activeOnly = true) =>
      request<Player[]>(`/players?active_only=${activeOnly}`),
    create: (body: { emp_id: string; name: string; score?: number }) =>
      request<Player>("/players", { method: "POST", body: JSON.stringify(body) }),
    update: (empId: string, body: Partial<Player>) =>
      request<Player>(`/players/${empId}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (empId: string) =>
      request<{ success: boolean }>(`/players/${empId}`, { method: "DELETE" }),
    hardDelete: (empId: string) =>
      request<{ success: boolean }>(`/players/${empId}/hard`, { method: "DELETE" }),
    stats: (empId: string) => request<Player>(`/players/${empId}/stats`),
    matches: (empId: string) => request<Match[]>(`/players/${empId}/matches`),
  },

  ranking: (limit = 20) => request<Player[]>(`/ranking?limit=${limit}`),

  matches: {
    byDate: (date: string) => request<Match[]>(`/matches/${date}`),
    submitScore: (matchId: number, body: { score1: number; score2: number }) =>
      request<Match>(`/matches/_/${matchId}/submit-score`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    approve: (matchId: number) =>
      request<Match>(`/matches/_/${matchId}/approve`, { method: "POST" }),
    reject: (matchId: number, reason: string) =>
      request<Match>(`/matches/_/${matchId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    create: (body: {
      date: string;
      group_name?: string;
      team1_player1: string;
      team1_player2?: string;
      team2_player1: string;
      team2_player2?: string;
      score1?: number;
      score2?: number;
      status?: "pending" | "done" | "disputed" | "cancelled";
      dispute_reason?: string;
    }) =>
      request<Match>("/matches", { method: "POST", body: JSON.stringify(body) }),
    update: (matchId: number, body: Partial<Match>) =>
      request<Match>(`/matches/${matchId}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (matchId: number) =>
      request<{ success: boolean }>(`/matches/${matchId}`, { method: "DELETE" }),
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

  settings: {
    rules: () => request<RulesConfig>("/settings/rules"),
    updateRules: (body: Partial<RulesConfig>) =>
      request<{ success: boolean }>("/settings/rules", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    monthClose: () => request<MonthCloseConfig>("/settings/month-close"),
    monthClosed: (month: string) => request<MonthCloseState>(`/settings/month-close/${month}`),
    closeMonth: (month: string) =>
      request<{ success: boolean; month: string; closed_months: string[] }>("/settings/month-close", {
        method: "POST",
        body: JSON.stringify({ month }),
      }),
    openMonth: (month: string) =>
      request<{ success: boolean; month: string; closed_months: string[] }>(`/settings/month-close/${month}`, {
        method: "DELETE",
      }),
    recalcScore: (dry_run = true) =>
      request<{ dry_run: boolean; players: number; matches: number; top_changes: Array<Record<string, unknown>> }>(
        "/admin/recalculate/score",
        { method: "POST", body: JSON.stringify({ dry_run }) }
      ),
    recalcXp: (dry_run = true) =>
      request<{ dry_run: boolean; players: number; top_xp: Array<Record<string, unknown>> }>(
        "/admin/recalculate/xp",
        { method: "POST", body: JSON.stringify({ dry_run }) }
      ),
    recalcAll: (dry_run = true) =>
      request<{
        dry_run: boolean;
        score: Record<string, unknown>;
        xp: Record<string, unknown>;
      }>("/admin/recalculate/all", { method: "POST", body: JSON.stringify({ dry_run }) }),
  },

  signupRequests: {
    list: () => request<SignupRequest[]>("/admin/signup-requests"),
    approve: (empId: string) =>
      request<{ success: boolean; player: SignupRequest }>(`/admin/signup-requests/${empId}/approve`, {
        method: "POST",
      }),
    reject: (empId: string) =>
      request<{ success: boolean; player: SignupRequest }>(`/admin/signup-requests/${empId}/reject`, {
        method: "POST",
      }),
  },

  audit: {
    list: (limit = 100) => request<AuditLogRow[]>(`/admin/audit-logs?limit=${limit}`),
  },
};
