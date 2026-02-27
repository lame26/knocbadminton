import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { MiddlewareHandler } from "hono";

// ?? Cloudflare Workers ?섍꼍蹂???????????????????????????????????????????
interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY?: string;
  SUPABASE_KEY?: string;
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
type PlayerStats = { match_count: number; win_count: number };
type RulesConfig = {
  score_rules: Record<string, number>;
  tier_rules: Record<string, number>;
};
type AuditAction =
  | "auth.change_password"
  | "admin.reset_password"
  | "signup.approve"
  | "signup.reject"
  | "player.create"
  | "player.update"
  | "player.deactivate"
  | "player.delete_hard"
  | "match.submit_score"
  | "match.approve"
  | "match.reject"
  | "match.create"
  | "match.update"
  | "match.delete"
  | "settings.rules.update"
  | "settings.month.close"
  | "settings.month.open"
  | "recalculate.score"
  | "recalculate.xp"
  | "recalculate.all";

const MONTH_CLOSE_KEY_PREFIX = "month_closed_";

function normalizeMonth(input: string): string | null {
  const trimmed = String(input ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 7);
  return null;
}

function monthCloseKey(month: string): string {
  return `${MONTH_CLOSE_KEY_PREFIX}${month}`;
}

async function isMonthClosed(supabase: SupabaseClient, dateOrMonth: string): Promise<boolean> {
  const month = normalizeMonth(dateOrMonth);
  if (!month) return false;
  const { data, error } = await supabase
    .from("score_rules")
    .select("value")
    .eq("key", monthCloseKey(month))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.value ?? 0) === 1;
}

async function assertMonthEditable(
  supabase: SupabaseClient,
  dateOrMonth: string,
  actionLabel: string
): Promise<string | null> {
  const month = normalizeMonth(dateOrMonth);
  if (!month) return null;
  if (await isMonthClosed(supabase, month)) {
    return `${month} ?붿? 留덇컧?섏뼱 ${actionLabel}?????놁뒿?덈떎.`;
  }
  return null;
}

async function listClosedMonths(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("score_rules")
    .select("key, value")
    .like("key", `${MONTH_CLOSE_KEY_PREFIX}%`);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => Number(row.value ?? 0) === 1)
    .map((row) => String(row.key).slice(MONTH_CLOSE_KEY_PREFIX.length))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
    .sort();
}

async function writeAuditLog(
  supabase: SupabaseClient,
  actorEmpId: string,
  action: AuditAction,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>
): Promise<void> {
  // If audit_logs table is not prepared yet, skip logging without breaking business flow.
  await supabase.from("audit_logs").insert({
    actor_emp_id: actorEmpId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}

async function buildPlayerStatsMap(supabase: SupabaseClient): Promise<Map<string, PlayerStats>> {
  const map = new Map<string, PlayerStats>();
  const { data, error } = await supabase
    .from("matches")
    .select("team1_player1, team1_player2, team2_player1, team2_player2, score1, score2, status")
    .eq("status", "done");
  if (error || !data) return map;

  for (const m of data) {
    const team1 = [m.team1_player1, m.team1_player2].filter(Boolean) as string[];
    const team2 = [m.team2_player1, m.team2_player2].filter(Boolean) as string[];
    const team1Won = Number(m.score1) > Number(m.score2);

    for (const pid of team1) {
      const prev = map.get(pid) ?? { match_count: 0, win_count: 0 };
      map.set(pid, {
        match_count: prev.match_count + 1,
        win_count: prev.win_count + (team1Won ? 1 : 0),
      });
    }
    for (const pid of team2) {
      const prev = map.get(pid) ?? { match_count: 0, win_count: 0 };
      map.set(pid, {
        match_count: prev.match_count + 1,
        win_count: prev.win_count + (team1Won ? 0 : 1),
      });
    }
  }
  return map;
}

async function loadRules(supabase: SupabaseClient): Promise<RulesConfig> {
  const [scoreRes, tierRes] = await Promise.all([
    supabase.from("score_rules").select("key, value"),
    supabase.from("tier_rules").select("tier_name, threshold"),
  ]);
  if (scoreRes.error) throw new Error(scoreRes.error.message);
  if (tierRes.error) throw new Error(tierRes.error.message);

  const score_rules: Record<string, number> = {};
  for (const row of scoreRes.data ?? []) score_rules[row.key] = Number(row.value);

  const tier_rules: Record<string, number> = {};
  for (const row of tierRes.data ?? []) tier_rules[row.tier_name] = Number(row.threshold);
  return { score_rules, tier_rules };
}

function calculateTier(score: number, tierRules: Record<string, number>): string {
  const sorted = Object.entries(tierRules).sort((a, b) => b[1] - a[1]);
  for (const [name, threshold] of sorted) {
    if (score >= threshold) return name;
  }
  return "Bronze";
}

async function recalculateScores(supabase: SupabaseClient, dryRun: boolean) {
  const rules = await loadRules(supabase);
  const scoreRules = rules.score_rules;
  const tierRules = rules.tier_rules;

  const { data: playerRows, error: playerErr } = await supabase
    .from("players")
    .select("emp_id, name, score");
  if (playerErr) throw new Error(playerErr.message);

  const players = new Map<string, {
    name: string;
    old_score: number;
    new_score: number;
    tier: string;
    match_count: number;
    win_count: number;
    streak: number;
  }>();
  for (const p of playerRows ?? []) {
    players.set(p.emp_id, {
      name: p.name,
      old_score: Number(p.score ?? 1000),
      new_score: 1000,
      tier: calculateTier(1000, tierRules),
      match_count: 0,
      win_count: 0,
      streak: 0,
    });
  }

  const { data: matchRows, error: matchErr } = await supabase
    .from("matches")
    .select("id, date, team1_player1, team1_player2, team2_player1, team2_player2, score1, score2, status")
    .eq("status", "done")
    .order("date", { ascending: true })
    .order("id", { ascending: true });
  if (matchErr) throw new Error(matchErr.message);

  const updatesForMatches: Array<{ id: number; change1: number; change2: number }> = [];

  for (const m of matchRows ?? []) {
    const team1 = [m.team1_player1, m.team1_player2].filter(Boolean) as string[];
    const team2 = [m.team2_player1, m.team2_player2].filter(Boolean) as string[];
    const score1 = Number(m.score1 ?? 0);
    const score2 = Number(m.score2 ?? 0);
    const winT1 = score1 > score2;
    const diff = Math.abs(score1 - score2);

    const avg1 =
      team1.reduce((sum, pid) => sum + (players.get(pid)?.new_score ?? 1000), 0) /
      Math.max(team1.length, 1);
    const avg2 =
      team2.reduce((sum, pid) => sum + (players.get(pid)?.new_score ?? 1000), 0) /
      Math.max(team2.length, 1);

    const baseWin = Number(scoreRules.win ?? 20);
    const baseLoss = Number(scoreRules.loss ?? 0);
    const bigDiff = Number(scoreRules.big_diff ?? 10);
    const bigWin = Number(scoreRules.big_win ?? 5);
    const underdog = Number(scoreRules.underdog ?? 15);
    const underdogDiff = Number(scoreRules.underdog_diff ?? 100);

    let bonus = 0;
    if (diff >= bigDiff) bonus += bigWin;
    if (winT1 && avg2 - avg1 >= underdogDiff) bonus += underdog;
    if (!winT1 && avg1 - avg2 >= underdogDiff) bonus += underdog;

    const changeWin = baseWin + bonus;
    const changeLoss = baseLoss;

    for (const pid of team1) {
      const p = players.get(pid);
      if (!p) continue;
      p.match_count += 1;
      if (winT1) {
        p.new_score += changeWin;
        p.win_count += 1;
        p.streak += 1;
      } else {
        p.new_score += changeLoss;
        p.streak = 0;
      }
      p.tier = calculateTier(p.new_score, tierRules);
    }

    for (const pid of team2) {
      const p = players.get(pid);
      if (!p) continue;
      p.match_count += 1;
      if (!winT1) {
        p.new_score += changeWin;
        p.win_count += 1;
        p.streak += 1;
      } else {
        p.new_score += changeLoss;
        p.streak = 0;
      }
      p.tier = calculateTier(p.new_score, tierRules);
    }

    updatesForMatches.push({
      id: Number(m.id),
      change1: winT1 ? changeWin : changeLoss,
      change2: winT1 ? changeLoss : changeWin,
    });
  }

  const changes = Array.from(players.entries()).map(([emp_id, p]) => ({
    emp_id,
    name: p.name,
    old_score: p.old_score,
    new_score: p.new_score,
    diff: p.new_score - p.old_score,
    tier: p.tier,
    match_count: p.match_count,
    win_count: p.win_count,
    streak: p.streak,
  }));

  if (!dryRun) {
    for (const c of changes) {
      const { error } = await supabase
        .from("players")
        .update({
          score: c.new_score,
          tier: c.tier,
          match_count: c.match_count,
          win_count: c.win_count,
          streak: c.streak,
        })
        .eq("emp_id", c.emp_id);
      if (error) throw new Error(error.message);
    }
    for (const mu of updatesForMatches) {
      const { error } = await supabase
        .from("matches")
        .update({ change1: mu.change1, change2: mu.change2 })
        .eq("id", mu.id);
      if (error) throw new Error(error.message);
    }
  }

  return {
    dry_run: dryRun,
    players: changes.length,
    matches: updatesForMatches.length,
    top_changes: [...changes]
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 20),
  };
}

async function recalculateXp(supabase: SupabaseClient, dryRun: boolean) {
  const { data: playerRows, error: playerErr } = await supabase
    .from("players")
    .select("emp_id, xp, last_attendance, attendance_count, consecutive_months");
  if (playerErr) throw new Error(playerErr.message);

  const state = new Map<string, {
    xp: number;
    last_attendance: string | null;
    attendance_count: number;
    consecutive_months: number;
  }>();
  for (const p of playerRows ?? []) {
    state.set(p.emp_id, {
      xp: 0,
      last_attendance: null,
      attendance_count: 0,
      consecutive_months: 0,
    });
  }

  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("date, team1_player1, team1_player2, team2_player1, team2_player2")
    // XP policy: attendance-based, independent from score status.
    // Keep including all match statuses (pending/done/disputed/cancelled).
    .order("date", { ascending: true })
    .order("id", { ascending: true });
  if (matchErr) throw new Error(matchErr.message);

  const byDate = new Map<string, Set<string>>();
  for (const m of matches ?? []) {
    const key = String(m.date ?? "").slice(0, 7);
    if (!key) continue;
    const set = byDate.get(key) ?? new Set<string>();
    [m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2]
      .filter(Boolean)
      .forEach((pid) => set.add(pid as string));
    byDate.set(key, set);
  }

  const sortedMonths = Array.from(byDate.keys()).sort();
  for (const month of sortedMonths) {
    const attendees = byDate.get(month) ?? new Set<string>();
    for (const empId of attendees) {
      const s = state.get(empId);
      if (!s) continue;
      if (s.last_attendance === month) continue;

      let gain = 100;
      if (s.last_attendance) {
        const [ly, lm] = s.last_attendance.split("-").map((x) => Number(x));
        const [cy, cm] = month.split("-").map((x) => Number(x));
        const diff = (cy - ly) * 12 + (cm - lm);
        if (diff === 1) {
          s.consecutive_months += 1;
          gain += 50;
        } else {
          s.consecutive_months = 1;
        }
      } else {
        s.consecutive_months = 1;
      }
      s.last_attendance = month;
      s.attendance_count += 1;
      if (s.attendance_count % 3 === 0) gain += 200;
      s.xp += gain;
    }
  }

  if (!dryRun) {
    for (const [emp_id, s] of state.entries()) {
      const { error } = await supabase
        .from("players")
        .update({
          xp: s.xp,
          last_attendance: s.last_attendance,
          attendance_count: s.attendance_count,
          consecutive_months: s.consecutive_months,
        })
        .eq("emp_id", emp_id);
      if (error) throw new Error(error.message);
    }
  }

  const rows = Array.from(state.entries()).map(([emp_id, s]) => ({ emp_id, xp: s.xp }));
  return {
    dry_run: dryRun,
    players: rows.length,
    top_xp: rows.sort((a, b) => b.xp - a.xp).slice(0, 20),
  };
}

// ?? ?ы띁: Supabase ?대씪?댁뼵???앹꽦 ???????????????????????????????????????
function getSupabase(env: Env): SupabaseClient {
  const supabaseKey = env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_KEY;
  if (!env.SUPABASE_URL || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  }
  if (env.SUPABASE_URL.includes("your-project-id") || supabaseKey.includes("your-service-role-key")) {
    throw new Error("Supabase placeholder values detected. Set real values in workers/.dev.vars");
  }
  return createClient(env.SUPABASE_URL, supabaseKey);
}

// ?? JWT ?좏떥由ы떚 (Web Crypto API ?ъ슜) ????????????????????????????????????
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

// ?? Hono ?????????????????????????????????????????????????????????????????
const app = new Hono<AppEnv>();

// CORS 誘몃뱾?⑥뼱
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

// ?? JWT ?뚯떛 誘몃뱾?⑥뼱 (?꾩뿭 ???좏겙 ?덉쓣 ?뚮쭔 ?뚯떛) ??????????????????????
app.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const payload = await verifyJWT(auth.slice(7), c.env.JWT_SECRET);
    if (payload) c.set("user", payload);
  }
  return next();
});

// ?? 蹂댄샇???쇱슦?몄슜 誘몃뱾?⑥뼱 ?⑺넗由???????????????????????????????????????
function requireAuth(minRole?: "admin" | "super_admin"): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);
    if (minRole === "admin" && !["admin", "super_admin"].includes(user.role)) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }
    if (minRole === "super_admin" && user.role !== "super_admin") {
      return c.json({ error: "최고 관리자 권한이 필요합니다." }, 403);
    }
    return next();
  };
}

// ?? ?ъ뒪 泥댄겕 ?????????????????????????????????????????????????????????????
app.get("/health", async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { error } = await supabase
      .from("players")
      .select("emp_id", { head: true, count: "exact" })
      .limit(1);

    if (error) {
      return c.json(
        { status: "error", version: "0.2.0", supabase: "unreachable", message: error.message },
        500
      );
    }

    return c.json({ status: "ok", version: "0.2.0", supabase: "connected" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return c.json({ status: "error", version: "0.2.0", supabase: "misconfigured", message }, 500);
  }
});

// ?? 濡쒓렇??????????????????????????????????????????????????????????????????
app.post("/login", async (c) => {
  const body = await c.req.json<{ emp_id: string; pin: string }>();
  if (!body.emp_id || !body.pin) {
    return c.json({ error: "?щ쾲怨?鍮꾨?踰덊샇瑜??낅젰?댁＜?몄슂" }, 400);
  }

  const supabase = getSupabase(c.env);
  const { data: player, error } = await supabase
    .from("players")
    .select("emp_id, name, role, pin_hash, is_active")
    .eq("emp_id", body.emp_id)
    .single();

  if (error || !player) {
    return c.json({ error: "?щ쾲 ?먮뒗 鍮꾨?踰덊샇媛 ?щ컮瑜댁? ?딆뒿?덈떎" }, 401);
  }
  if (!player.is_active) {
    return c.json({ error: "\ube44\ud65c\uc131\ud654\ub41c \uacc4\uc815\uc785\ub2c8\ub2e4. \uad00\ub9ac\uc790\uc5d0\uac8c \ubb38\uc758\ud558\uc138\uc694" }, 403);
  }
  if (player.role === "pending") {
    return c.json({ error: "\uac00\uc785 \uc2b9\uc778 \ub300\uae30 \uc911\uc785\ub2c8\ub2e4. \uad00\ub9ac\uc790 \uc2b9\uc778 \ud6c4 \ub85c\uadf8\uc778\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4." }, 403);
  }
  if (player.role === "rejected") {
    return c.json({ error: "\uac00\uc785 \uc694\uccad\uc774 \ubc18\ub824\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uad00\ub9ac\uc790\uc5d0\uac8c \ubb38\uc758\ud574 \uc8fc\uc138\uc694." }, 403);
  }

  const inputHash = await hashPin(body.pin);
  // pin_hash 誘몄꽕????珥덇린 鍮꾨?踰덊샇 = emp_id ?먯떊
  const storedHash = player.pin_hash ?? (await hashPin(body.emp_id));
  if (inputHash !== storedHash) {
    return c.json({ error: "?щ쾲 ?먮뒗 鍮꾨?踰덊샇媛 ?щ컮瑜댁? ?딆뒿?덈떎" }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const jwtPayload: JWTPayload = {
    sub: player.emp_id,
    name: player.name,
    role: player.role ?? "player",
    iat: now,
    exp: now + 60 * 60 * 8, // 8?쒓컙
  };
  const token = await signJWT(jwtPayload, c.env.JWT_SECRET);

  return c.json({
    token,
    user: { emp_id: player.emp_id, name: player.name, role: player.role ?? "player" },
    is_first_login: player.pin_hash === null,
  });
});

// ?? ???뺣낫 議고쉶 (/me) ???????????????????????????????????????????????????
app.post("/signup", async (c) => {
  const body = await c.req.json<{ emp_id: string; name: string; password: string }>();
  const empId = body.emp_id?.trim();
  const name = body.name?.trim();
  const password = body.password?.trim();

  if (!empId || !name || !password) {
    return c.json({ error: "\uc0ac\ubc88, \uc774\ub984, \ube44\ubc00\ubc88\ud638\ub97c \ubaa8\ub450 \uc785\ub825\ud574 \uc8fc\uc138\uc694." }, 400);
  }
  if (password.length < 4) {
    return c.json({ error: "\ube44\ubc00\ubc88\ud638\ub294 4\uc790\ub9ac \uc774\uc0c1\uc774\uc5b4\uc57c \ud569\ub2c8\ub2e4." }, 400);
  }

  const supabase = getSupabase(c.env);
  const { data: exists } = await supabase
    .from("players")
    .select("emp_id")
    .eq("emp_id", empId)
    .maybeSingle();
  if (exists) {
    return c.json({ error: "\uc774\ubbf8 \ub4f1\ub85d\ub41c \uc0ac\ubc88\uc785\ub2c8\ub2e4." }, 409);
  }

  const pinHash = await hashPin(password);
  const joinDate = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("players").insert({
    emp_id: empId,
    name,
    score: 1000,
    xp: 0,
    tier: "\ube0c\ub860\uc988",
    is_active: false,
    role: "pending",
    join_date: joinDate,
    pin_hash: pinHash,
  });
  if (error) return c.json({ error: error.message }, 500);

  return c.json({ success: true, message: "\ud68c\uc6d0\uac00\uc785 \uc694\uccad\uc774 \uc811\uc218\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uad00\ub9ac\uc790 \uc2b9\uc778 \ud6c4 \ub85c\uadf8\uc778\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4." }, 201);
});

app.get("/me", requireAuth(), async (c) => {
  const user = c.get("user");
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .select("emp_id, name, score, xp, tier, win_count, match_count, streak, role, is_active")
    .eq("emp_id", user.sub)
    .single();
  if (error) return c.json({ error: error.message }, 500);
  const statMap = await buildPlayerStatsMap(supabase);
  const computed = statMap.get(user.sub) ?? { match_count: 0, win_count: 0 };
  return c.json({
    ...data,
    match_count: computed.match_count,
    win_count: computed.win_count,
  });
});

// ?? 鍮꾨?踰덊샇 蹂寃??????????????????????????????????????????????????????????
app.post("/change-pin", requireAuth(), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ current_pin: string; new_pin: string }>();
  if (!body.current_pin || !body.new_pin) {
    return c.json({ error: "?꾩옱 鍮꾨?踰덊샇? ??鍮꾨?踰덊샇瑜??낅젰?댁＜?몄슂" }, 400);
  }
  if (body.new_pin.length < 4) {
    return c.json({ error: "새 비밀번호는 4자리 이상이어야 합니다." }, 400);
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
    return c.json({ error: "?꾩옱 鍮꾨?踰덊샇媛 ?щ컮瑜댁? ?딆뒿?덈떎" }, 401);
  }

  const newHash = await hashPin(body.new_pin);
  const { error } = await supabase
    .from("players")
    .update({ pin_hash: newHash })
    .eq("emp_id", user.sub);
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(supabase, user.sub, "auth.change_password", "player", user.sub, {});

  return c.json({ success: true, message: "鍮꾨?踰덊샇媛 蹂寃쎈릺?덉뒿?덈떎" });
});

// ?? 愿由ъ옄: ?좎닔 鍮꾨?踰덊샇 珥덇린???????????????????????????????????????????
app.post("/admin/reset-pin/:emp_id", requireAuth("admin"), async (c) => {
  const targetId = c.req.param("emp_id");
  const actor = c.get("user");
  const supabase = getSupabase(c.env);
  const { error } = await supabase
    .from("players")
    .update({ pin_hash: null })
    .eq("emp_id", targetId);
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(supabase, actor.sub, "admin.reset_password", "player", targetId, {});
  return c.json({ success: true, message: `${targetId} 鍮꾨?踰덊샇媛 珥덇린?붾릺?덉뒿?덈떎 (珥덇린媛? ?щ쾲)` });
});

// ?? ?좎닔 紐⑸줉 議고쉶 (怨듦컻) ?????????????????????????????????????????????????
app.get("/admin/signup-requests", requireAuth("admin"), async (c) => {
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .select("emp_id, name, join_date, role, is_active")
    .eq("role", "pending")
    .order("join_date", { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

app.post("/admin/signup-requests/:emp_id/approve", requireAuth("admin"), async (c) => {
  const empId = c.req.param("emp_id");
  const actor = c.get("user");
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .update({ role: "player", is_active: true })
    .eq("emp_id", empId)
    .eq("role", "pending")
    .select("emp_id, name, role, is_active")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(supabase, actor.sub, "signup.approve", "player", empId, {});
  return c.json({ success: true, player: data });
});

app.post("/admin/signup-requests/:emp_id/reject", requireAuth("admin"), async (c) => {
  const empId = c.req.param("emp_id");
  const actor = c.get("user");
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .update({ role: "rejected", is_active: false })
    .eq("emp_id", empId)
    .eq("role", "pending")
    .select("emp_id, name, role, is_active")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(supabase, actor.sub, "signup.reject", "player", empId, {});
  return c.json({ success: true, player: data });
});

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
  const statMap = await buildPlayerStatsMap(supabase);
  const rows = (data ?? []).map((p) => {
    const s = statMap.get(p.emp_id) ?? { match_count: 0, win_count: 0 };
    return { ...p, match_count: s.match_count, win_count: s.win_count };
  });
  return c.json(rows);
});

// ?? ?좎닔 ?앹꽦 (愿由ъ옄 ?꾩슜) ???????????????????????????????????????????????
app.post("/players", requireAuth("admin"), async (c) => {
  const actor = c.get("user");
  const body = await c.req.json<{ emp_id: string; name: string; score?: number; is_active?: boolean }>();
  if (!body.emp_id || !body.name) {
    return c.json({ error: "emp_id와 name은 필수입니다." }, 400);
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
  await writeAuditLog(supabase, actor.sub, "player.create", "player", data.emp_id, {
    name: data.name,
    score: data.score,
    is_active: data.is_active,
  });
  return c.json(data, 201);
});

// ?? ?좎닔 ?섏젙 (愿由ъ옄 ?꾩슜) ???????????????????????????????????????????????
app.patch("/players/:emp_id", requireAuth("admin"), async (c) => {
  const empId = c.req.param("emp_id");
  const actor = c.get("user");
  const body = await c.req.json<{ name?: string; score?: number; is_active?: boolean; role?: string }>();
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .update(body)
    .eq("emp_id", empId)
    .select("emp_id, name, score, xp, tier, win_count, match_count, streak, is_active, role")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(supabase, actor.sub, "player.update", "player", empId, body as Record<string, unknown>);
  return c.json(data);
});

// ?? ?좎닔 ??젣 (鍮꾪솢?깊솕, 愿由ъ옄 ?꾩슜) ????????????????????????????????????
app.delete("/players/:emp_id", requireAuth("admin"), async (c) => {
  const empId = c.req.param("emp_id");
  const actor = c.get("user");
  const supabase = getSupabase(c.env);
  const { error } = await supabase.from("players").update({ is_active: false }).eq("emp_id", empId);
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(supabase, actor.sub, "player.deactivate", "player", empId, {});
  return c.json({ success: true });
});

// ???? ?醫롫땾 ?袁⑹읈 ????(?온?귐딆쁽 ?袁⑹뒠)
app.delete("/players/:emp_id/hard", requireAuth("admin"), async (c) => {
  const empId = c.req.param("emp_id");
  const user = c.get("user");
  if (empId === user.sub) {
    return c.json({ error: "蹂몄씤 怨꾩젙? ??젣?????놁뒿?덈떎." }, 400);
  }

  const supabase = getSupabase(c.env);
  const { count, error: countErr } = await supabase
    .from("matches")
    .select("id", { head: true, count: "exact" })
    .or(`team1_player1.eq.${empId},team1_player2.eq.${empId},team2_player1.eq.${empId},team2_player2.eq.${empId}`);
  if (countErr) return c.json({ error: countErr.message }, 500);
  if ((count ?? 0) > 0) {
    return c.json({ error: "寃쎄린 ?대젰???덈뒗 ?뚯썝? ?꾩쟾??젣?????놁뒿?덈떎. 鍮꾪솢?깊솕瑜??ъ슜?섏꽭??" }, 409);
  }

  const { error } = await supabase.from("players").delete().eq("emp_id", empId);
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(supabase, user.sub, "player.delete_hard", "player", empId, {});
  return c.json({ success: true });
});

// ?? ??궧 議고쉶 (怨듦컻) ??????????????????????????????????????????????????????
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
  const statMap = await buildPlayerStatsMap(supabase);
  const rows = (data ?? []).map((p) => {
    const s = statMap.get(p.emp_id) ?? { match_count: 0, win_count: 0 };
    return { ...p, match_count: s.match_count, win_count: s.win_count };
  });
  return c.json(rows);
});

// ?? 寃쎄린 紐⑸줉 議고쉶 (?좎쭨蹂? 濡쒓렇???꾩슂) ?????????????????????????????????
app.get("/matches/:date", requireAuth(), async (c) => {
  const date = c.req.param("date");
  const supabase = getSupabase(c.env);
  let query = supabase.from("matches").select("*");
  // ???⑥쐞(YYYY-MM) 議고쉶??吏?먰븯??湲곗〈 ?쇱옄 ?곗씠??YYYY-MM-DD)? 怨듭〈
  if (/^\d{4}-\d{2}$/.test(date)) {
    query = query.like("date", `${date}%`);
  } else {
    query = query.eq("date", date);
  }
  const { data, error } = await query.order("id", { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ?? ?먯닔 ?낅젰 (濡쒓렇???꾩슂, ?먯떊??李몄뿬??寃쎄린) ??????????????????????????
app.post("/matches/:date/:match_id/submit-score", requireAuth(), async (c) => {
  const match_id = c.req.param("match_id");
  const user = c.get("user");
  const body = await c.req.json<{ score1: number; score2: number }>();
  const supabase = getSupabase(c.env);
  const { data: targetMatch, error: matchErr } = await supabase
    .from("matches")
    .select("date, team1_player1, team1_player2, team2_player1, team2_player2")
    .eq("id", match_id)
    .single();
  if (matchErr || !targetMatch) return c.json({ error: "寃쎄린瑜?李얠쓣 ???놁뒿?덈떎." }, 404);
  const lockMessage = await assertMonthEditable(supabase, targetMatch.date, "?먯닔 ?쒖텧");
  if (lockMessage) return c.json({ error: lockMessage }, 409);

  // 관리자가 아니면 자신이 참여한 경기만 입력 가능
  if (!["admin", "super_admin"].includes(user.role)) {
    const participants = [
      targetMatch.team1_player1,
      targetMatch.team1_player2,
      targetMatch.team2_player1,
      targetMatch.team2_player2,
    ].filter(Boolean);
    if (!participants.includes(user.sub)) {
      return c.json({ error: "?먯떊??李몄뿬??寃쎄린留??먯닔瑜??낅젰?????덉뒿?덈떎" }, 403);
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
  await writeAuditLog(supabase, user.sub, "match.submit_score", "match", String(match_id), {
    score1: body.score1,
    score2: body.score2,
  });
  return c.json(data);
});

// ?? 寃쎄린 ?뱀씤 (愿由ъ옄 ?꾩슜) ???????????????????????????????????????????????
app.post("/matches/:date/:match_id/approve", requireAuth("admin"), async (c) => {
  const match_id = c.req.param("match_id");
  const user = c.get("user");
  const supabase = getSupabase(c.env);
  const { data: targetMatch, error: matchErr } = await supabase
    .from("matches")
    .select("date")
    .eq("id", match_id)
    .single();
  if (matchErr || !targetMatch) return c.json({ error: "寃쎄린瑜?李얠쓣 ???놁뒿?덈떎." }, 404);
  const lockMessage = await assertMonthEditable(supabase, targetMatch.date, "寃쎄린 ?뱀씤");
  if (lockMessage) return c.json({ error: lockMessage }, 409);
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
  await writeAuditLog(supabase, user.sub, "match.approve", "match", String(match_id), {});
  return c.json(data);
});

// ?? 寃쎄린 ?댁쓽?쒓린 (濡쒓렇???꾩슂) ???????????????????????????????????????????
app.post("/matches/:date/:match_id/reject", requireAuth(), async (c) => {
  const match_id = c.req.param("match_id");
  const user = c.get("user");
  const body = await c.req.json<{ reason?: string }>();
  const supabase = getSupabase(c.env);
  const { data: targetMatch, error: matchErr } = await supabase
    .from("matches")
    .select("date")
    .eq("id", match_id)
    .single();
  if (matchErr || !targetMatch) return c.json({ error: "寃쎄린瑜?李얠쓣 ???놁뒿?덈떎." }, 404);
  const lockMessage = await assertMonthEditable(supabase, targetMatch.date, "?댁쓽 ?쒓린");
  if (lockMessage) return c.json({ error: lockMessage }, 409);
  const { data, error } = await supabase
    .from("matches")
    .update({ status: "disputed", dispute_reason: body.reason ?? "" })
    .eq("id", match_id)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(supabase, user.sub, "match.reject", "match", String(match_id), {
    reason: body.reason ?? "",
  });
  return c.json(data);
});

// ?? 寃쎄린 ?섎룞 ?앹꽦/?섏젙/??젣 (愿由ъ옄) ?????????????????????????????????????
app.post("/matches", requireAuth("admin"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
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
  }>();
  if (!body.date || !body.team1_player1 || !body.team2_player1) {
    return c.json({ error: "date, team1_player1, team2_player1 are required" }, 400);
  }
  const supabase = getSupabase(c.env);
  const lockMessage = await assertMonthEditable(supabase, body.date, "寃쎄린 ?앹꽦");
  if (lockMessage) return c.json({ error: lockMessage }, 409);
  const row = {
    date: body.date,
    group_name: body.group_name ?? "A",
    team1_player1: body.team1_player1,
    team1_player2: body.team1_player2 ?? null,
    team2_player1: body.team2_player1,
    team2_player2: body.team2_player2 ?? null,
    score1: body.score1 ?? 0,
    score2: body.score2 ?? 0,
    status: body.status ?? "pending",
    dispute_reason: body.dispute_reason ?? null,
  };
  const { data, error } = await supabase.from("matches").insert(row).select().single();
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(supabase, user.sub, "match.create", "match", String(data.id), {
    date: data.date,
    group_name: data.group_name,
    status: data.status,
  });
  return c.json(data, 201);
});

app.patch("/matches/:match_id", requireAuth("admin"), async (c) => {
  const matchId = c.req.param("match_id");
  const user = c.get("user");
  const body = await c.req.json<{
    date?: string;
    group_name?: string;
    team1_player1?: string;
    team1_player2?: string | null;
    team2_player1?: string;
    team2_player2?: string | null;
    score1?: number;
    score2?: number;
    status?: "pending" | "done" | "disputed" | "cancelled";
    dispute_reason?: string | null;
  }>();
  const supabase = getSupabase(c.env);
  const { data: currentMatch, error: currentErr } = await supabase
    .from("matches")
    .select("date")
    .eq("id", matchId)
    .single();
  if (currentErr || !currentMatch) return c.json({ error: "寃쎄린瑜?李얠쓣 ???놁뒿?덈떎." }, 404);
  const currentMonthLock = await assertMonthEditable(supabase, currentMatch.date, "寃쎄린 ?섏젙");
  if (currentMonthLock) return c.json({ error: currentMonthLock }, 409);
  if (body.date) {
    const targetMonthLock = await assertMonthEditable(supabase, body.date, "寃쎄린 ?섏젙");
    if (targetMonthLock) return c.json({ error: targetMonthLock }, 409);
  }
  const { data, error } = await supabase
    .from("matches")
    .update(body)
    .eq("id", matchId)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(supabase, user.sub, "match.update", "match", String(matchId), body as Record<string, unknown>);
  return c.json(data);
});

app.delete("/matches/:match_id", requireAuth("admin"), async (c) => {
  const matchId = c.req.param("match_id");
  const user = c.get("user");
  const supabase = getSupabase(c.env);
  const { data: currentMatch, error: currentErr } = await supabase
    .from("matches")
    .select("date")
    .eq("id", matchId)
    .single();
  if (currentErr || !currentMatch) return c.json({ error: "寃쎄린瑜?李얠쓣 ???놁뒿?덈떎." }, 404);
  const lockMessage = await assertMonthEditable(supabase, currentMatch.date, "寃쎄린 ??젣");
  if (lockMessage) return c.json({ error: lockMessage }, 409);
  const { error } = await supabase.from("matches").delete().eq("id", matchId);
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(supabase, user.sub, "match.delete", "match", String(matchId), {});
  return c.json({ success: true });
});

// ?? ?좎닔 ?듦퀎 議고쉶 (怨듦컻) ?????????????????????????????????????????????????
app.get("/players/:emp_id/stats", async (c) => {
  const empId = c.req.param("emp_id");
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("players")
    .select("emp_id, name, score, xp, tier, win_count, match_count, streak, attendance_count, consecutive_months")
    .eq("emp_id", empId)
    .single();
  if (error) return c.json({ error: error.message }, 500);
  const statMap = await buildPlayerStatsMap(supabase);
  const computed = statMap.get(empId) ?? { match_count: 0, win_count: 0 };
  return c.json({
    ...data,
    match_count: computed.match_count,
    win_count: computed.win_count,
  });
});

// ?? ?좎닔 寃쎄린 ?대젰 (怨듦컻) ?????????????????????????????????????????????????
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

// ?? ?쇰퀎 ?붿빟 (怨듦컻) ??????????????????????????????????????????????????????
app.get("/summary/:date", async (c) => {
  const date = c.req.param("date");
  const supabase = getSupabase(c.env);
  let query = supabase.from("matches").select("status");
  if (/^\d{4}-\d{2}$/.test(date)) {
    query = query.like("date", `${date}%`);
  } else {
    query = query.eq("date", date);
  }
  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);

  const total = data.length;
  const done = data.filter((m) => m.status === "done").length;
  const pending = data.filter((m) => m.status === "pending").length;
  const disputed = data.filter((m) => m.status === "disputed").length;
  const cancelled = data.filter((m) => m.status === "cancelled").length;
  return c.json({ date, total, done, pending, disputed, cancelled });
});

// ?? ?쒖뒪??洹쒖튃 議고쉶/?섏젙 ????????????????????????????????????????????????
app.get("/settings/month-close", requireAuth("admin"), async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const closed_months = await listClosedMonths(supabase);
    return c.json({ closed_months });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return c.json({ error: message }, 500);
  }
});

app.get("/settings/month-close/:month", requireAuth(), async (c) => {
  const month = normalizeMonth(c.req.param("month") ?? "");
  if (!month) return c.json({ error: "month??YYYY-MM ?뺤떇?댁뼱???⑸땲??" }, 400);
  try {
    const supabase = getSupabase(c.env);
    const closed = await isMonthClosed(supabase, month);
    return c.json({ month, closed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return c.json({ error: message }, 500);
  }
});

app.post("/settings/month-close", requireAuth("admin"), async (c) => {
  const actor = c.get("user");
  const body = await c.req.json<{ month?: string }>();
  const month = normalizeMonth(body.month ?? "");
  if (!month) return c.json({ error: "month??YYYY-MM ?뺤떇?댁뼱???⑸땲??" }, 400);
  try {
    const supabase = getSupabase(c.env);
    const { error } = await supabase
      .from("score_rules")
      .upsert({ key: monthCloseKey(month), value: 1 }, { onConflict: "key" });
    if (error) return c.json({ error: error.message }, 500);
    await writeAuditLog(supabase, actor.sub, "settings.month.close", "month", month, {});
    const closed_months = await listClosedMonths(supabase);
    return c.json({ success: true, month, closed_months });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return c.json({ error: message }, 500);
  }
});

app.delete("/settings/month-close/:month", requireAuth("admin"), async (c) => {
  const actor = c.get("user");
  const month = normalizeMonth(c.req.param("month") ?? "");
  if (!month) return c.json({ error: "month??YYYY-MM ?뺤떇?댁뼱???⑸땲??" }, 400);
  try {
    const supabase = getSupabase(c.env);
    const { error } = await supabase.from("score_rules").delete().eq("key", monthCloseKey(month));
    if (error) return c.json({ error: error.message }, 500);
    await writeAuditLog(supabase, actor.sub, "settings.month.open", "month", month, {});
    const closed_months = await listClosedMonths(supabase);
    return c.json({ success: true, month, closed_months });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return c.json({ error: message }, 500);
  }
});

app.get("/settings/rules", async (c) => {
  const supabase = getSupabase(c.env);
  const [scoreRes, tierRes] = await Promise.all([
    supabase.from("score_rules").select("key, value"),
    supabase.from("tier_rules").select("tier_name, threshold"),
  ]);
  if (scoreRes.error) return c.json({ error: scoreRes.error.message }, 500);
  if (tierRes.error) return c.json({ error: tierRes.error.message }, 500);

  const score_rules: Record<string, number> = {};
  for (const row of scoreRes.data ?? []) score_rules[row.key] = Number(row.value);

  const tier_rules: Record<string, number> = {};
  for (const row of tierRes.data ?? []) tier_rules[row.tier_name] = Number(row.threshold);

  return c.json({ score_rules, tier_rules });
});

app.patch("/settings/rules", requireAuth("admin"), async (c) => {
  const actor = c.get("user");
  const body = await c.req.json<{
    score_rules?: Record<string, number>;
    tier_rules?: Record<string, number>;
  }>();
  const supabase = getSupabase(c.env);

  if (body.score_rules) {
    const { error: delErr } = await supabase.from("score_rules").delete().neq("key", "");
    if (delErr) return c.json({ error: delErr.message }, 500);
    const scoreRows = Object.entries(body.score_rules).map(([key, value]) => ({ key, value: Number(value) }));
    if (scoreRows.length > 0) {
      const { error } = await supabase.from("score_rules").insert(scoreRows);
      if (error) return c.json({ error: error.message }, 500);
    }
  }

  if (body.tier_rules) {
    const { error: delErr } = await supabase.from("tier_rules").delete().neq("tier_name", "");
    if (delErr) return c.json({ error: delErr.message }, 500);
    const tierRows = Object.entries(body.tier_rules).map(([tier_name, threshold]) => ({
      tier_name,
      threshold: Number(threshold),
    }));
    if (tierRows.length > 0) {
      const { error } = await supabase.from("tier_rules").insert(tierRows);
      if (error) return c.json({ error: error.message }, 500);
    }
  }

  await writeAuditLog(supabase, actor.sub, "settings.rules.update", "settings", "rules", {
    score_keys: Object.keys(body.score_rules ?? {}),
    tier_keys: Object.keys(body.tier_rules ?? {}),
  });
  return c.json({ success: true });
});

// ?? 愿由ъ옄: ?ш퀎??API (XP/?ъ씤?? ???????????????????????????????????????
app.post("/admin/recalculate/score", requireAuth("admin"), async (c) => {
  try {
    const actor = c.get("user");
    const parsed = await c.req.json<{ dry_run?: boolean }>().catch(() => null);
    const dryRun = parsed?.dry_run !== false;
    const supabase = getSupabase(c.env);
    const result = await recalculateScores(supabase, dryRun);
    await writeAuditLog(supabase, actor.sub, "recalculate.score", "system", "score", {
      dry_run: dryRun,
      players: result.players,
      matches: result.matches,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return c.json({ error: message }, 500);
  }
});

app.post("/admin/recalculate/xp", requireAuth("admin"), async (c) => {
  try {
    const actor = c.get("user");
    const parsed = await c.req.json<{ dry_run?: boolean }>().catch(() => null);
    const dryRun = parsed?.dry_run !== false;
    const supabase = getSupabase(c.env);
    const result = await recalculateXp(supabase, dryRun);
    await writeAuditLog(supabase, actor.sub, "recalculate.xp", "system", "xp", {
      dry_run: dryRun,
      players: result.players,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return c.json({ error: message }, 500);
  }
});

app.post("/admin/recalculate/all", requireAuth("admin"), async (c) => {
  try {
    const actor = c.get("user");
    const parsed = await c.req.json<{ dry_run?: boolean }>().catch(() => null);
    const dryRun = parsed?.dry_run !== false;
    const supabase = getSupabase(c.env);
    const [score, xp] = await Promise.all([
      recalculateScores(supabase, dryRun),
      recalculateXp(supabase, dryRun),
    ]);
    await writeAuditLog(supabase, actor.sub, "recalculate.all", "system", "all", {
      dry_run: dryRun,
      score_players: score.players,
      score_matches: score.matches,
      xp_players: xp.players,
    });
    return c.json({ dry_run: dryRun, score, xp });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return c.json({ error: message }, 500);
  }
});

// ?? ?吏??앹꽦 (愿由ъ옄 ?꾩슜) ???????????????????????????????????????????????
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
    return c.json({ error: "date와 matches가 필요합니다." }, 400);
  }
  const supabase = getSupabase(c.env);
  const lockMessage = await assertMonthEditable(supabase, body.date, "?吏??앹꽦");
  if (lockMessage) return c.json({ error: lockMessage }, 409);
  const rows = body.matches.map((m) => ({ ...m, date: body.date, status: "pending" }));
  const { data, error } = await supabase.from("matches").insert(rows).select();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ inserted: data?.length ?? 0, matches: data }, 201);
});

app.get("/admin/audit-logs", requireAuth("admin"), async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, created_at, actor_emp_id, action, target_type, target_id, details")
    .order("id", { ascending: false })
    .limit(limit);
  // If audit table is not prepared yet, keep API non-breaking.
  if (error) return c.json([]);
  return c.json(data ?? []);
});

export default app;
