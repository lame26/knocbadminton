"""
선수 통계 재계산 스크립트
DB의 경기 데이터를 기반으로 각 선수의 match_count, win_count를 재계산합니다.
"""
import sqlite3
import sys
import io

# Windows 콘솔 인코딩 설정
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def fix_player_stats(db_file="knoc_badminton.db"):
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("🔧 선수 통계 재계산 시작...")
    
    # 모든 선수 가져오기
    cursor.execute("SELECT emp_id, name FROM players")
    players = cursor.fetchall()
    
    # 모든 완료된 경기 가져오기
    cursor.execute("""
        SELECT team1_player1, team1_player2, team2_player1, team2_player2, 
               score1, score2, status
        FROM matches
        WHERE status = 'done'
    """)
    matches = cursor.fetchall()
    
    # 각 선수별 통계 계산
    stats = {}
    for player in players:
        emp_id = player["emp_id"]
        stats[emp_id] = {"matches": 0, "wins": 0}
    
    for match in matches:
        team1 = [match["team1_player1"], match["team1_player2"]]
        team2 = [match["team2_player1"], match["team2_player2"]]
        team1 = [p for p in team1 if p]  # None 제거
        team2 = [p for p in team2 if p]
        
        win_team1 = match["score1"] > match["score2"]
        
        # Team 1 선수들
        for pid in team1:
            if pid in stats:
                stats[pid]["matches"] += 1
                if win_team1:
                    stats[pid]["wins"] += 1
        
        # Team 2 선수들
        for pid in team2:
            if pid in stats:
                stats[pid]["matches"] += 1
                if not win_team1:
                    stats[pid]["wins"] += 1
    
    # DB 업데이트
    updated_count = 0
    for emp_id, stat in stats.items():
        cursor.execute("""
            UPDATE players 
            SET match_count = ?, win_count = ?
            WHERE emp_id = ?
        """, (stat["matches"], stat["wins"], emp_id))
        
        if stat["matches"] > 0:
            cursor.execute("SELECT name FROM players WHERE emp_id = ?", (emp_id,))
            name = cursor.fetchone()["name"]
            print(f"  ✅ {name} ({emp_id}): {stat['matches']}경기 {stat['wins']}승")
            updated_count += 1
    
    conn.commit()
    conn.close()
    
    print(f"\n✅ 완료! {updated_count}명의 선수 통계를 업데이트했습니다.")

if __name__ == "__main__":
    fix_player_stats()
