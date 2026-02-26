import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Cloudflare Workers 환경변수 타입 ──────────────────────────────────────
interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  /** 허용할 프론트엔드 출처(콤마 구분). 미설정 시 개발용 localhost 허용 */
  FRONTEND_ORIGINS?: string;
}

// ── 헬퍼: Supabase 클라이언트 생성 ───────────────────────────────────────
function getSupabase(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
}

// ── Hono 앱 ───────────────────────────────────────────────────────────────
const app = new Hono<{ Bindings: Env }>();

// CORS 미들웨어
app.use("*", async (c, next) => {
  const origins = c.env.FRONTEND_ORIGINS
    ? c.env.FRONTEND_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5173"];
  return cors({ origin: origins, allowMethods: ["GET", "POST", "PATCH", "DELETE"] })(c, next);
});

// ── 헬스 체크 ─────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

// ── 선수 목록 조회 ────────────────────────────────────────────────────────
app.get("/players", async (c) => {
  const activeOnly = c.req.query("active_only") !== "false";
  const supabase = getSupabase(c.env);

  let query = supabase.from("players").select("*").order("score", { ascending: false });
  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 선수 생성 ─────────────────────────────────────────────────────────────
app.post("/players", async (c) => {
  const body = await c.req.json<{ emp_id: string; name: string; score?: number; is_active?: boolean }>();
  if (!body.emp_id || !body.name) {
    return c.json({ error: "emp_id와 name은 필수입니다" }, 400);
  }
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .insert({ emp_id: body.emp_id, name: body.name, score: body.score ?? 1000, is_active: body.is_active ?? true })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data, 201);
});

// ── 선수 수정 ─────────────────────────────────────────────────────────────
app.patch("/players/:emp_id", async (c) => {
  const empId = c.req.param("emp_id");
  const body = await c.req.json<{ name?: string; score?: number; is_active?: boolean }>();
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .update(body)
    .eq("emp_id", empId)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 선수 삭제 (비활성화) ──────────────────────────────────────────────────
app.delete("/players/:emp_id", async (c) => {
  const empId = c.req.param("emp_id");
  const supabase = getSupabase(c.env);
  const { error } = await supabase.from("players").update({ is_active: false }).eq("emp_id", empId);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

// ── 랭킹 조회 ─────────────────────────────────────────────────────────────
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

// ── 경기 목록 조회 (날짜별) ───────────────────────────────────────────────
app.get("/matches/:date", async (c) => {
  const date = c.req.param("date"); // YYYY-MM-DD
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("date", date)
    .order("id", { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 점수 입력 ─────────────────────────────────────────────────────────────
app.post("/matches/:date/:match_id/submit-score", async (c) => {
  const { match_id } = c.req.param();
  const body = await c.req.json<{ score1: number; score2: number; input_by: string }>();
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("matches")
    .update({
      score1: body.score1,
      score2: body.score2,
      input_by: body.input_by,
      input_timestamp: new Date().toISOString(),
      status: "pending",
    })
    .eq("id", match_id)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 경기 승인 ─────────────────────────────────────────────────────────────
app.post("/matches/:date/:match_id/approve", async (c) => {
  const { match_id } = c.req.param();
  const body = await c.req.json<{ approved_by: string }>();
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("matches")
    .update({
      approved_by: body.approved_by,
      approved_timestamp: new Date().toISOString(),
      status: "done",
    })
    .eq("id", match_id)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ── 경기 이의제기 ─────────────────────────────────────────────────────────
app.post("/matches/:date/:match_id/reject", async (c) => {
  const { match_id } = c.req.param();
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

// ── 선수 통계 조회 ────────────────────────────────────────────────────────
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

// ── 선수 경기 이력 ────────────────────────────────────────────────────────
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

// ── 일별 요약 ─────────────────────────────────────────────────────────────
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

// ── 대진 생성 (그룹 저장) ─────────────────────────────────────────────────
// 주의: 실제 밸런싱 로직은 추후 구현. 현재는 배정된 매치를 DB에 저장만 함.
app.post("/tournaments/generate", async (c) => {
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
