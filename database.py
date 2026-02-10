import sqlite3
import os
from contextlib import contextmanager
from typing import Optional, List, Dict, Any
import config


class Database:
    """SQLite 데이터베이스 관리 클래스"""
    
    def __init__(self, db_file: Optional[str] = None):
        self.db_file = db_file or config.DB_FILE
        self.timeout = getattr(config, 'DB_TIMEOUT', 30.0)
        self.check_same_thread = getattr(config, 'DB_CHECK_SAME_THREAD', False)
        self._init_database()
    
    def _get_connection(self) -> sqlite3.Connection:
        """데이터베이스 연결 생성"""
        conn = sqlite3.connect(
            self.db_file,
            timeout=self.timeout,
            check_same_thread=self.check_same_thread
        )
        conn.row_factory = sqlite3.Row  # 딕셔너리 형태로 결과 반환
        conn.execute("PRAGMA foreign_keys = ON")  # 외래키 제약 활성화
        return conn
    
    @contextmanager
    def transaction(self):
        """트랜잭션 컨텍스트 매니저"""
        conn = self._get_connection()
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()
    
    def execute(self, query: str, params: tuple = ()) -> sqlite3.Cursor:
        """단일 쿼리 실행 (자동 커밋)"""
        with self.transaction() as conn:
            cursor = conn.execute(query, params)
            return cursor
    
    def fetch_one(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        """단일 행 조회"""
        with self.transaction() as conn:
            cursor = conn.execute(query, params)
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def fetch_all(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """다중 행 조회"""
        with self.transaction() as conn:
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    
    def _init_database(self):
        """데이터베이스 초기화 (테이블 생성)"""
        if os.path.exists(self.db_file):
            return  # 이미 존재하면 스킵
        
        with self.transaction() as conn:
            # 선수 테이블
            conn.execute("""
                CREATE TABLE IF NOT EXISTS players (
                    emp_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    score INTEGER DEFAULT 1000,
                    xp INTEGER DEFAULT 0,
                    tier TEXT DEFAULT '브론즈',
                    is_active BOOLEAN DEFAULT 1,
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
                )
            """)
            
            # 경기 이력 테이블
            conn.execute("""
                CREATE TABLE IF NOT EXISTS matches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                )
            """)
            
            # 시스템 설정 테이블
            conn.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            
            # 점수 규칙 테이블
            conn.execute("""
                CREATE TABLE IF NOT EXISTS score_rules (
                    key TEXT PRIMARY KEY,
                    value INTEGER NOT NULL
                )
            """)
            
            # 티어 규칙 테이블
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tier_rules (
                    tier_name TEXT PRIMARY KEY,
                    threshold INTEGER NOT NULL
                )
            """)
            
            # 인덱스 생성
            conn.execute("CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_players_score ON players(score DESC)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_players_xp ON players(xp DESC)")
    
    # ========== 선수 관리 ==========
    def add_player(self, emp_id: str, name: str, score: int = 1000, 
                   tier: str = '브론즈', is_active: bool = True, 
                   join_date: Optional[str] = None, role: str = 'player') -> bool:
        """선수 추가"""
        try:
            self.execute("""
                INSERT INTO players (emp_id, name, score, tier, is_active, join_date, role)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (emp_id, name, score, tier, is_active, join_date, role))
            return True
        except sqlite3.IntegrityError:
            return False
    
    def get_player(self, emp_id: str) -> Optional[Dict[str, Any]]:
        """선수 조회"""
        return self.fetch_one("SELECT * FROM players WHERE emp_id = ?", (emp_id,))
    
    def get_all_players(self, active_only: bool = False) -> List[Dict[str, Any]]:
        """전체 선수 조회"""
        query = "SELECT * FROM players"
        if active_only:
            query += " WHERE is_active = 1"
        query += " ORDER BY score DESC"
        return self.fetch_all(query)
    
    def update_player(self, emp_id: str, **kwargs) -> bool:
        """선수 정보 수정"""
        if not kwargs:
            return False
        
        set_clause = ", ".join([f"{k} = ?" for k in kwargs.keys()])
        values = list(kwargs.values()) + [emp_id]
        
        try:
            self.execute(f"UPDATE players SET {set_clause} WHERE emp_id = ?", tuple(values))
            return True
        except Exception:
            return False
    
    def delete_player(self, emp_id: str) -> bool:
        """선수 삭제"""
        try:
            self.execute("DELETE FROM players WHERE emp_id = ?", (emp_id,))
            return True
        except Exception:
            return False
    
    # ========== 경기 관리 ==========
    def add_match(self, date: str, team1: List[str], team2: List[str], 
                  group_name: Optional[str] = None, **kwargs) -> Optional[int]:
        """경기 추가"""
        t1_p1 = team1[0] if len(team1) > 0 else None
        t1_p2 = team1[1] if len(team1) > 1 else None
        t2_p1 = team2[0] if len(team2) > 0 else None
        t2_p2 = team2[1] if len(team2) > 1 else None
        
        cursor = self.execute("""
            INSERT INTO matches (date, group_name, team1_player1, team1_player2, 
                                team2_player1, team2_player2, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
        """, (date, group_name, t1_p1, t1_p2, t2_p1, t2_p2))
        
        return cursor.lastrowid if cursor.lastrowid else None
    
    def get_matches_by_date(self, date: str) -> List[Dict[str, Any]]:
        """날짜별 경기 조회"""
        return self.fetch_all("SELECT * FROM matches WHERE date = ? ORDER BY id", (date,))
    
    def get_all_match_dates(self) -> List[str]:
        """모든 경기 날짜 조회"""
        rows = self.fetch_all("SELECT DISTINCT date FROM matches ORDER BY date DESC")
        return [row['date'] for row in rows]
    
    def update_match(self, match_id: int, **kwargs) -> bool:
        """경기 정보 수정"""
        if not kwargs:
            return False
        
        set_clause = ", ".join([f"{k} = ?" for k in kwargs.keys()])
        values = list(kwargs.values()) + [match_id]
        
        try:
            self.execute(f"UPDATE matches SET {set_clause} WHERE id = ?", tuple(values))
            return True
        except Exception:
            return False
    
    def delete_match(self, match_id: int) -> bool:
        """경기 삭제"""
        try:
            self.execute("DELETE FROM matches WHERE id = ?", (match_id,))
            return True
        except Exception:
            return False
    
    # ========== 설정 관리 ==========
    def set_setting(self, key: str, value: str) -> bool:
        """설정 저장"""
        try:
            self.execute("""
                INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
            """, (key, value))
            return True
        except Exception:
            return False
    
    def get_setting(self, key: str) -> Optional[str]:
        """설정 조회"""
        row = self.fetch_one("SELECT value FROM settings WHERE key = ?", (key,))
        return row['value'] if row else None
    
    def get_all_settings(self) -> Dict[str, str]:
        """전체 설정 조회"""
        rows = self.fetch_all("SELECT key, value FROM settings")
        return {row['key']: row['value'] for row in rows}
    
    # ========== 규칙 관리 ==========
    def set_score_rule(self, key: str, value: int) -> bool:
        """점수 규칙 저장"""
        try:
            self.execute("""
                INSERT OR REPLACE INTO score_rules (key, value) VALUES (?, ?)
            """, (key, value))
            return True
        except Exception:
            return False
    
    def get_score_rules(self) -> Dict[str, int]:
        """점수 규칙 조회"""
        rows = self.fetch_all("SELECT key, value FROM score_rules")
        return {row['key']: row['value'] for row in rows}
    
    def set_tier_rule(self, tier_name: str, threshold: int) -> bool:
        """티어 규칙 저장"""
        try:
            self.execute("""
                INSERT OR REPLACE INTO tier_rules (tier_name, threshold) VALUES (?, ?)
            """, (tier_name, threshold))
            return True
        except Exception:
            return False
    
    def get_tier_rules(self) -> Dict[str, int]:
        """티어 규칙 조회"""
        rows = self.fetch_all("SELECT tier_name, threshold FROM tier_rules")
        return {row['tier_name']: row['threshold'] for row in rows}
