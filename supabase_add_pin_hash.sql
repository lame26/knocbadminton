-- ============================================================
-- 마이그레이션: players 테이블에 pin_hash 컬럼 추가
-- Supabase SQL 에디터에서 한 번만 실행하세요.
-- ============================================================

-- pin_hash 컬럼 추가 (없으면 추가)
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS pin_hash TEXT DEFAULT NULL;

-- 확인
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'players' AND column_name = 'pin_hash';
