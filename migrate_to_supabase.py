"""
기존 SQLite DB → Supabase 마이그레이션 스크립트
사용법: python migrate_to_supabase.py
"""
import sqlite3
import os
import sys

SUPABASE_URL = "https://subnwhpceqjwhzmhkefa.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5dnJydWJwaGJrY2xzZHRhZ29lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA2MTU1NSwiZXhwIjoyMDg3NjM3NTU1fQ.wp73mnBwkwegaxJvQZFuzSgjpt6wuwZU3FkkBaKKWoQ"

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "knoc_badminton.db")

def main():
    from supabase import create_client
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    if not os.path.exists(DB_FILE):
        print(f"오류: DB 파일을 찾을 수 없습니다: {DB_FILE}")
        sys.exit(1)

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # 1. 선수 데이터
    print("선수 데이터 마이그레이션...")
    cur.execute("SELECT * FROM players")
    players = [dict(row) for row in cur.fetchall()]
    for p in players:
        p['is_active'] = bool(p['is_active'])
        client.table('players').upsert(p).execute()
    print(f"  완료: {len(players)}명")

    # 2. 경기 데이터
    print("경기 데이터 마이그레이션...")
    cur.execute("SELECT * FROM matches")
    matches = [dict(row) for row in cur.fetchall()]
    for m in matches:
        client.table('matches').upsert(m).execute()
    print(f"  완료: {len(matches)}경기")

    # 3. 설정
    print("설정 마이그레이션...")
    cur.execute("SELECT * FROM settings")
    for row in cur.fetchall():
        client.table('settings').upsert(dict(row)).execute()

    # 4. 점수 규칙
    cur.execute("SELECT * FROM score_rules")
    for row in cur.fetchall():
        client.table('score_rules').upsert(dict(row)).execute()

    # 5. 티어 규칙
    cur.execute("SELECT * FROM tier_rules")
    for row in cur.fetchall():
        client.table('tier_rules').upsert(dict(row)).execute()
    print("  완료")

    conn.close()
    print("\n마이그레이션 완료!")
    if matches:
        max_id = max(m['id'] for m in matches)
        print(f"\n[중요] Supabase SQL Editor에서 아래 쿼리를 실행하세요:")
        print(f"  SELECT setval('matches_id_seq', {max_id});")

if __name__ == "__main__":
    main()
