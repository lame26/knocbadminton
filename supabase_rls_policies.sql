-- =============================================
-- KNOC 배드민턴 RLS 정책
-- Cloudflare Workers 전환 후 적용하는 보안 정책
--
-- 기존 supabase_setup.sql 실행 후 이 파일을 추가로 실행하세요.
-- Workers는 service_role 키를 사용하므로 RLS를 우회합니다.
-- 프론트엔드가 anon 키를 직접 사용할 경우 이 정책이 적용됩니다.
-- =============================================

-- RLS 활성화
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_rules ENABLE ROW LEVEL SECURITY;

-- ─── players 정책 ────────────────────────────────────────────────────────
-- 누구나 활성 선수 목록 조회 가능 (로그인 불필요)
CREATE POLICY "players_select_active"
  ON players FOR SELECT
  USING (is_active = true);

-- service_role(Workers)만 삽입/수정/삭제 가능
-- (service_role은 RLS를 우회하므로 별도 정책 불필요)

-- ─── matches 정책 ────────────────────────────────────────────────────────
-- 누구나 경기 결과 조회 가능
CREATE POLICY "matches_select_all"
  ON matches FOR SELECT
  USING (true);

-- ─── score_rules, tier_rules 정책 ───────────────────────────────────────
-- 누구나 규칙 조회 가능 (읽기 전용)
CREATE POLICY "score_rules_select"
  ON score_rules FOR SELECT
  USING (true);

CREATE POLICY "tier_rules_select"
  ON tier_rules FOR SELECT
  USING (true);

-- settings는 service_role만 접근 (admin 비밀번호 해시 포함)
-- → 별도 SELECT 정책 없음 = anon으로 조회 불가
