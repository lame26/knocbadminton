-- =============================================
-- KNOC 배드민턴 Supabase 테이블 설정
-- Supabase > SQL Editor에서 실행하세요
-- =============================================

-- 선수 테이블
CREATE TABLE IF NOT EXISTS players (
    emp_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    score INTEGER DEFAULT 1000,
    xp INTEGER DEFAULT 0,
    tier TEXT DEFAULT '브론즈',
    is_active BOOLEAN DEFAULT true,
    join_date TEXT,
    match_count INTEGER DEFAULT 0,
    win_count INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    boost_games INTEGER DEFAULT 0,
    last_attendance TEXT,
    attendance_count INTEGER DEFAULT 0,
    consecutive_months INTEGER DEFAULT 0,
    total_played INTEGER DEFAULT 0,
    role TEXT DEFAULT 'player'
);

-- 경기 이력 테이블
CREATE TABLE IF NOT EXISTS matches (
    id BIGSERIAL PRIMARY KEY,
    date TEXT NOT NULL,
    group_name TEXT,
    team1_player1 TEXT,
    team1_player2 TEXT,
    team2_player1 TEXT,
    team2_player2 TEXT,
    score1 INTEGER DEFAULT 0,
    score2 INTEGER DEFAULT 0,
    change1 INTEGER DEFAULT 0,
    change2 INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    input_by TEXT,
    input_timestamp TEXT,
    approved_by TEXT,
    approved_timestamp TEXT,
    dispute_reason TEXT
);

-- 시스템 설정 테이블
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 점수 규칙 테이블
CREATE TABLE IF NOT EXISTS score_rules (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL
);

-- 티어 규칙 테이블
CREATE TABLE IF NOT EXISTS tier_rules (
    tier_name TEXT PRIMARY KEY,
    threshold INTEGER NOT NULL
);

-- =============================================
-- RLS(Row Level Security) 비활성화
-- anon 키로 읽기/쓰기 허용
-- =============================================
ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE score_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE tier_rules DISABLE ROW LEVEL SECURITY;
