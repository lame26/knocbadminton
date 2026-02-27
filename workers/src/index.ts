import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { MiddlewareHandler } from "hono";

// ── Cloudflare Workers 환경변수 타입 ──────────────────────────────────────
interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  JWT_SECRET: string;
  FRONTEND_ORIGINS?: string;
}

interface JWTPayload {
  sub: string;   // emp_id
  name: string;
  role: string;
  iat: number;
  exp: number;
}

type Variables = { user: JWTPayload };
type AppEnv = { Bindings: Env; Variables: Variables };

// ── 헬퍼: Supabase 클라이언트 생성 ───────────────────────────────────────
function getSupabase(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
}

// ── JWT 유틸리티 (Web Crypto API 사용) ────────────────────────────────────
function b64url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  return Uint8Array.from(atob(padded + "=".repeat(pad)), (c) => c.charCodeAt(0));
}

async function signJWT(payload: JWTPayload, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = b64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sigB64),
      new TextEncoder().encode(data)
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(payloadB64))
    ) as JWTPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Hono 앱 ───────────────────────────────────────────────────────────────
const app = new Hono<AppEnv>();

// CORS 미들웨어
app.use("*", async (c, next) => {
  const origins = c.env.FRONTEND_ORIGINS
    ? c.env.FRONTEND_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5173"];
  return cors({
    origin: origins,
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
  })(c, next);
});

// ── JWT 파싱 미들웨어 (전역 — 토큰 있을 때만 파싱) ──────────────────────
app.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const payload = await verifyJWT(auth.slice(7), c.env.JWT_SECRET);
    if (payload) c.set("user", payload);
  }
  return next();
});

// ── 보호된 라우트용 미들웨어 팩토리 ──────────────────────────────────────
function requireAuth(minRole?: "admin" | "super_admin"): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "로그인이 필요합니다" }, 401);
    if (minRole === "admin" && !["admin", "super_admin"].includes(user.role)) {
      return c.json({ error: "관리자 권한이 필요합니다" }, 403);
    }
    if (minRole === "super_admin" && user.role !== "super_admin") {
      return c.json({ error: "최고 관리자 권한이 필요합니다" }, 403);
    }
    return next();
  };
}

// ── 헬스 체크 ─────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", version: "0.2.0" }));

// ── 로그인 ────────────────────────────────────────────────────────────────
app.post("/login", async (c) => {
  const body = await c.req.json<{ emp_id: string; pin: string }>();
  if (!body.emp_id || !body.pin) {
    return c.json({ error: "사번과 비밀번호를 입력해주세요" }, 400);
  }

  const supabase = getSupabase(c.env);
  const { data: player, error } = await supabase
    .from("players")
    .select("emp_id, name, role, pin_hash, is_active")
    .eq("emp_id", body.emp_id)
    .single();

  if (error || !player) {
    return c.json({ error: "사번 또는 비밀번호가 올바르지 않습니다" }, 401);
  }
  if (!player.is_active) {
    return c.json({ error: "비활성화된 계정입니다. 관리자에게 문의하세요" }, 403);
  }

  const inputHash = await hashPin(body.pin);
  // pin_hash 미설정 시 초기 비밀번호 = emp_id 자신
  const storedHash = player.pin_hash ?? (await hashPin(body.emp_id));
  if (inputHash !== storedHash) {
    return c.json({ error: "사번 또는 비밀번호가 올바르지 않습니다" }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const jwtPayload: JWTPayload = {
    sub: player.emp_id,
    name: player.name,
    role: player.role ?? "player",
    iat: now,
    exp: now + 60 * 60 * 8, // 8시간
  };
  const token = await signJWT(jwtPayload, c.env.JWT_SECRET);

  return c.json({
    token,
    user: { emp_id: player.emp_id, name: player.name, role: player.role ?? "player" },
    is_first_login: player.pin_hash === null,
  });
});

// ── 내 정보 조회 (/me) ───────────────────────────────────────────────────
app.get("/me", requireAuth(), async (c) => {
  const user = c.get("user");
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .select("emp_id, name, score, xp, tier, win_count, match_count, streak, role, is_active")
    .eq("emp_id", user.sub)
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 비밀번호 변경 ─────────────────────────────────────────────────────────
app.post("/change-pin", requireAuth(), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ current_pin: string; new_pin: string }>();
  if (!body.current_pin || !body.new_pin) {
    return c.json({ error: "현재 비밀번호와 새 비밀번호를 입력해주세요" }, 400);
  }
  if (body.new_pin.length < 4) {
    return c.json({ error: "새 비밀번호는 4자리 이상이어야 합니다" }, 400);
  }

  const supabase = getSupabase(c.env);
  const { data: player } = await supabase
    .from("players")
    .select("pin_hash")
    .eq("emp_id", user.sub)
    .single();

  const currentHash = player?.pin_hash ?? (await hashPin(user.sub));
  const inputHash = await hashPin(body.current_pin);
  if (inputHash !== currentHash) {
    return c.json({ error: "현재 비밀번호가 올바르지 않습니다" }, 401);
  }

  const newHash = await hashPin(body.new_pin);
  const { error } = await supabase
    .from("players")
    .update({ pin_hash: newHash })
    .eq("emp_id", user.sub);
  if (error) return c.json({ error: error.message }, 500);

  return c.json({ success: true, message: "비밀번호가 변경되었습니다" });
});

// ── 관리자: 선수 비밀번호 초기화 ─────────────────────────────────────────
app.post("/admin/reset-pin/:emp_id", requireAuth("admin"), async (c) => {
  const targetId = c.req.param("emp_id");
  const supabase = getSupabase(c.env);
  const { error } = await supabase
    .from("players")
    .update({ pin_hash: null })
    .eq("emp_id", targetId);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true, message: `${targetId} 비밀번호가 초기화되었습니다 (초기값: 사번)` });
});

// ── 선수 목록 조회 (공개) ─────────────────────────────────────────────────
app.get("/players", async (c) => {
  const activeOnly = c.req.query("active_only") !== "false";
  const supabase = getSupabase(c.env);

  let query = supabase
    .from("players")
    .select("emp_id, name, score, xp, tier, win_count, match_count, streak, is_active, role")
    .order("score", { ascending: false });
  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 선수 생성 (관리자 전용) ───────────────────────────────────────────────
app.post("/players", requireAuth("admin"), async (c) => {
  const body = await c.req.json<{ emp_id: string; name: string; score?: number; is_active?: boolean }>();
  if (!body.emp_id || !body.name) {
    return c.json({ error: "emp_id와 name은 필수입니다" }, 400);
  }
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .insert({
      emp_id: body.emp_id,
      name: body.name,
      score: body.score ?? 1000,
      is_active: body.is_active ?? true,
    })
    .select("emp_id, name, score, xp, tier, win_count, match_count, streak, is_active, role")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data, 201);
});

// ── 선수 수정 (관리자 전용) ───────────────────────────────────────────────
app.patch("/players/:emp_id", requireAuth("admin"), async (c) => {
  const empId = c.req.param("emp_id");
  const body = await c.req.json<{ name?: string; score?: number; is_active?: boolean; role?: string }>();
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .update(body)
    .eq("emp_id", empId)
    .select("emp_id, name, score, xp, tier, win_count, match_count, streak, is_active, role")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 선수 삭제 (비활성화, 관리자 전용) ────────────────────────────────────
app.delete("/players/:emp_id", requireAuth("admin"), async (c) => {
  const empId = c.req.param("emp_id");
  const supabase = getSupabase(c.env);
  const { error } = await supabase.from("players").update({ is_active: false }).eq("emp_id", empId);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

// ── 랭킹 조회 (공개) ──────────────────────────────────────────────────────
app.get("/ranking", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .select("emp_id, name, score, xp, tier, win_count, match_count, streak")
    .eq("is_active", true)
    .order("score", { ascending: false })
    .limit(limit);
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 경기 목록 조회 (날짜별, 로그인 필요) ─────────────────────────────────
app.get("/matches/:date", requireAuth(), async (c) => {
  const date = c.req.param("date");
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("date", date)
    .order("id", { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 점수 입력 (로그인 필요, 자신이 참여한 경기) ──────────────────────────
app.post("/matches/:date/:match_id/submit-score", requireAuth(), async (c) => {
  const match_id = c.req.param("match_id");
  const user = c.get("user");
  const body = await c.req.json<{ score1: number; score2: number }>();
  const supabase = getSupabase(c.env);

  // 관리자가 아니면 자신이 참여한 경기만 입력 가능
  if (!["admin", "super_admin"].includes(user.role)) {
    const { data: match } = await supabase
      .from("matches")
      .select("team1_player1, team1_player2, team2_player1, team2_player2")
      .eq("id", match_id)
      .single();
    const participants = [
      match?.team1_player1,
      match?.team1_player2,
      match?.team2_player1,
      match?.team2_player2,
    ].filter(Boolean);
    if (!participants.includes(user.sub)) {
      return c.json({ error: "자신이 참여한 경기만 점수를 입력할 수 있습니다" }, 403);
    }
  }

  const { data, error } = await supabase
    .from("matches")
    .update({
      score1: body.score1,
      score2: body.score2,
      input_by: user.sub,
      input_timestamp: new Date().toISOString(),
      status: "pending",
    })
    .eq("id", match_id)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 경기 승인 (관리자 전용) ───────────────────────────────────────────────
app.post("/matches/:date/:match_id/approve", requireAuth("admin"), async (c) => {
  const match_id = c.req.param("match_id");
  const user = c.get("user");
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("matches")
    .update({
      approved_by: user.sub,
      approved_timestamp: new Date().toISOString(),
      status: "done",
    })
    .eq("id", match_id)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 경기 이의제기 (로그인 필요) ───────────────────────────────────────────
app.post("/matches/:date/:match_id/reject", requireAuth(), async (c) => {
  const match_id = c.req.param("match_id");
  const body = await c.req.json<{ reason?: string }>();
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("matches")
    .update({ status: "disputed", dispute_reason: body.reason ?? "" })
    .eq("id", match_id)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 선수 통계 조회 (공개) ─────────────────────────────────────────────────
app.get("/players/:emp_id/stats", async (c) => {
  const empId = c.req.param("emp_id");
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .select("emp_id, name, score, xp, tier, win_count, match_count, streak, attendance_count, consecutive_months")
    .eq("emp_id", empId)
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 선수 경기 이력 (공개) ─────────────────────────────────────────────────
app.get("/players/:emp_id/matches", async (c) => {
  const empId = c.req.param("emp_id");
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .or(
      `team1_player1.eq.${empId},team1_player2.eq.${empId},team2_player1.eq.${empId},team2_player2.eq.${empId}`
    )
    .order("date", { ascending: false })
    .limit(50);
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 일별 요약 (공개) ──────────────────────────────────────────────────────
app.get("/summary/:date", async (c) => {
  const date = c.req.param("date");
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase.from("matches").select("status").eq("date", date);
  if (error) return c.json({ error: error.message }, 500);

  const total = data.length;
  const done = data.filter((m) => m.status === "done").length;
  const pending = data.filter((m) => m.status === "pending").length;
  const disputed = data.filter((m) => m.status === "disputed").length;
  return c.json({ date, total, done, pending, disputed });
});

// ── 대진 생성 (관리자 전용) ───────────────────────────────────────────────
app.post("/tournaments/generate", requireAuth("admin"), async (c) => {
  const body = await c.req.json<{
    date: string;
    matches: Array<{
      group_name: string;
      team1_player1: string;
      team1_player2: string;
      team2_player1: string;
      team2_player2: string;
    }>;
  }>();
  if (!body.date || !body.matches?.length) {
    return c.json({ error: "date와 matches가 필요합니다" }, 400);
  }
  const supabase = getSupabase(c.env);
  const rows = body.matches.map((m) => ({ ...m, date: body.date, status: "pending" }));
  const { data, error } = await supabase.from("matches").insert(rows).select();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ inserted: data?.length ?? 0, matches: data }, 201);
});

export default app;
