"""
선수 점수 전체 재계산 스크립트
모든 경기 데이터를 기반으로 선수 점수를 처음부터 다시 계산합니다.
"""
import sqlite3
import sys
import io
from datetime import datetime

# Windows 콘솔 인코딩 설정
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')


class ScoreRecalculator:
    def __init__(self, db_file="knoc_badminton.db"):
        self.conn = sqlite3.connect(db_file)
        self.conn.row_factory = sqlite3.Row
        self.cursor = self.conn.cursor()
        
        # 점수 규칙 로드
        self.score_rules = self._load_score_rules()
        self.tier_rules = self._load_tier_rules()
    
    def _load_score_rules(self):
        """점수 규칙 로드"""
        self.cursor.execute("SELECT key, value FROM score_rules")
        return {row["key"]: row["value"] for row in self.cursor.fetchall()}
    
    def _load_tier_rules(self):
        """티어 규칙 로드"""
        self.cursor.execute("SELECT tier_name, threshold FROM tier_rules ORDER BY threshold DESC")
        return [(row["tier_name"], row["threshold"]) for row in self.cursor.fetchall()]
    
    def _calculate_tier(self, score):
        """점수에 따른 티어 계산"""
        for tier_name, threshold in self.tier_rules:
            if score >= threshold:
                return tier_name
        return "브론즈"
    
    def recalculate_all_scores(self, ignore_boost=True, dry_run=True):
        """
        전체 점수 재계산
        
        Args:
            ignore_boost: 부스트 배수 무시 (기본값: True)
            dry_run: 시뮬레이션만 실행 (실제 DB 변경 안 함)
        
        Returns:
            dict: 선수별 점수 변화 정보
        """
        print("=" * 60)
        print("🔄 선수 점수 전체 재계산")
        print("=" * 60)
        print(f"부스트 배수: {'무시' if ignore_boost else '적용'}")
        print(f"실행 모드: {'시뮬레이션 (DB 변경 안 함)' if dry_run else '실제 적용 (DB 변경)'}")
        print("=" * 60)
        print()
        
        # 1. 모든 선수 정보 가져오기
        self.cursor.execute("SELECT emp_id, name, score FROM players")
        players = {row["emp_id"]: {
            "name": row["name"],
            "old_score": row["score"],
            "new_score": 1000,  # 초기 점수
            "tier": "브론즈",
            "match_count": 0,
            "win_count": 0,
            "streak": 0
        } for row in self.cursor.fetchall()}
        
        # 2. 모든 완료된 경기를 날짜 + ID 순서로 가져오기
        self.cursor.execute("""
            SELECT id, date, team1_player1, team1_player2, team2_player1, team2_player2,
                   score1, score2, status
            FROM matches
            WHERE status = 'done'
            ORDER BY date ASC, id ASC
        """)
        matches = self.cursor.fetchall()
        
        print(f"📊 총 {len(matches)}개의 완료된 경기를 재계산합니다...\n")
        
        # 3. 각 경기마다 점수 재계산
        for idx, match in enumerate(matches, 1):
            team1 = [p for p in [match["team1_player1"], match["team1_player2"]] if p]
            team2 = [p for p in [match["team2_player1"], match["team2_player2"]] if p]
            
            score1 = match["score1"]
            score2 = match["score2"]
            win_t1 = score1 > score2
            diff = abs(score1 - score2)
            
            # 평균 점수 계산 (언더독 보너스용)
            avg_s1 = sum(players[p]["new_score"] for p in team1 if p in players) / max(len(team1), 1)
            avg_s2 = sum(players[p]["new_score"] for p in team2 if p in players) / max(len(team2), 1)
            
            # 보너스 계산
            base_win = self.score_rules.get("win", 20)
            base_loss = self.score_rules.get("loss", 0)
            bonus = 0
            
            # 대승 보너스
            if diff >= self.score_rules.get("big_diff", 10):
                bonus += self.score_rules.get("big_win", 5)
            
            # 언더독 보너스
            if win_t1 and (avg_s2 - avg_s1 >= 100):
                bonus += self.score_rules.get("underdog", 15)
            elif not win_t1 and (avg_s1 - avg_s2 >= 100):
                bonus += self.score_rules.get("underdog", 15)
            
            change_win = base_win + bonus
            change_loss = base_loss
            
            # Team 1 선수들 점수 업데이트
            for pid in team1:
                if pid in players:
                    p = players[pid]
                    p["match_count"] += 1
                    
                    if win_t1:
                        # 부스트 적용 (ignore_boost=False인 경우만)
                        multiplier = 1.0
                        if not ignore_boost:
                            # 간단한 부스트 로직: 처음 4경기만 1.25배
                            if p["match_count"] <= 4:
                                multiplier = 1.25
                        
                        gain = int(change_win * multiplier)
                        p["new_score"] += gain
                        p["win_count"] += 1
                        p["streak"] += 1
                    else:
                        p["new_score"] += change_loss
                        p["streak"] = 0
                    
                    p["tier"] = self._calculate_tier(p["new_score"])
            
            # Team 2 선수들 점수 업데이트
            for pid in team2:
                if pid in players:
                    p = players[pid]
                    p["match_count"] += 1
                    
                    if not win_t1:
                        # 부스트 적용
                        multiplier = 1.0
                        if not ignore_boost:
                            if p["match_count"] <= 4:
                                multiplier = 1.25
                        
                        gain = int(change_win * multiplier)
                        p["new_score"] += gain
                        p["win_count"] += 1
                        p["streak"] += 1
                    else:
                        p["new_score"] += change_loss
                        p["streak"] = 0
                    
                    p["tier"] = self._calculate_tier(p["new_score"])
        
        # 4. 결과 출력
        print("\n" + "=" * 60)
        print("📈 재계산 결과")
        print("=" * 60)
        
        changes = []
        for emp_id, data in players.items():
            if data["match_count"] > 0:  # 경기한 선수만 표시
                diff = data["new_score"] - data["old_score"]
                changes.append({
                    "emp_id": emp_id,
                    "name": data["name"],
                    "old_score": data["old_score"],
                    "new_score": data["new_score"],
                    "diff": diff,
                    "tier": data["tier"],
                    "matches": data["match_count"],
                    "wins": data["win_count"]
                })
        
        # 점수 변화가 큰 순서로 정렬
        changes.sort(key=lambda x: abs(x["diff"]), reverse=True)
        
        for c in changes:
            diff_str = f"+{c['diff']}" if c['diff'] > 0 else str(c['diff'])
            color = "🔺" if c['diff'] > 0 else "🔻" if c['diff'] < 0 else "➖"
            print(f"{color} {c['name']:8s} | {c['old_score']:5d}pt → {c['new_score']:5d}pt ({diff_str:>6s}) | {c['tier']:6s} | {c['matches']}경기 {c['wins']}승")
        
        # 5. DB 업데이트 (dry_run=False인 경우만)
        if not dry_run:
            print("\n" + "=" * 60)
            print("💾 데이터베이스 업데이트 중...")
            print("=" * 60)
            
            for emp_id, data in players.items():
                self.cursor.execute("""
                    UPDATE players
                    SET score = ?, tier = ?, match_count = ?, win_count = ?, streak = ?
                    WHERE emp_id = ?
                """, (
                    data["new_score"],
                    data["tier"],
                    data["match_count"],
                    data["win_count"],
                    data["streak"],
                    emp_id
                ))
            
            self.conn.commit()
            print("✅ 데이터베이스 업데이트 완료!")
        else:
            print("\n" + "=" * 60)
            print("ℹ️  시뮬레이션 모드: 실제 DB는 변경되지 않았습니다.")
            print("   실제 적용하려면 dry_run=False로 실행하세요.")
            print("=" * 60)
        
        return changes
    
    def close(self):
        """DB 연결 종료"""
        self.conn.close()


def main():
    """메인 실행 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description="선수 점수 전체 재계산")
    parser.add_argument("--apply", action="store_true", help="실제로 DB에 적용 (기본: 시뮬레이션만)")
    parser.add_argument("--with-boost", action="store_true", help="부스트 배수 적용 (기본: 무시)")
    
    args = parser.parse_args()
    
    recalc = ScoreRecalculator()
    
    try:
        recalc.recalculate_all_scores(
            ignore_boost=not args.with_boost,
            dry_run=not args.apply
        )
    finally:
        recalc.close()


if __name__ == "__main__":
    main()
