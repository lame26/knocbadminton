import json
import os
import sys
import shutil
from datetime import datetime
from database import Database
import config

# Windows 콘솔 인코딩 설정
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass


def migrate_json_to_sqlite():
    """JSON 데이터를 SQLite로 마이그레이션"""
    
    print("=" * 60)
    print("🔄 KNOC 배드민턴 데이터베이스 마이그레이션")
    print("=" * 60)
    
    # 1. JSON 파일 확인
    if not os.path.exists(config.DATA_FILE):
        print(f"❌ JSON 파일을 찾을 수 없습니다: {config.DATA_FILE}")
        return False
    
    # 2. 백업 생성
    backup_file = config.DATA_FILE + ".backup"
    if os.path.exists(backup_file):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = f"{config.DATA_FILE}.backup_{timestamp}"
    
    print(f"\n📦 백업 생성 중: {backup_file}")
    shutil.copy2(config.DATA_FILE, backup_file)
    print("✅ 백업 완료")
    
    # 3. JSON 데이터 로드
    print(f"\n📖 JSON 파일 읽기: {config.DATA_FILE}")
    try:
        with open(config.DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ JSON 파일 읽기 실패: {e}")
        return False
    
    print("✅ JSON 파일 로드 완료")
    
    # 4. 데이터베이스 초기화
    print(f"\n🗄️ SQLite 데이터베이스 생성: {config.DB_FILE}")
    
    # 기존 DB 파일이 있으면 백업
    if os.path.exists(config.DB_FILE):
        db_backup = f"{config.DB_FILE}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        shutil.copy2(config.DB_FILE, db_backup)
        os.remove(config.DB_FILE)
        print(f"⚠️ 기존 DB 백업: {db_backup}")
    
    db = Database()
    print("✅ 데이터베이스 초기화 완료")
    
    # 5. 선수 데이터 마이그레이션
    players_data = data.get("players", {})
    print(f"\n👥 선수 데이터 마이그레이션 ({len(players_data)}명)")
    
    player_count = 0
    for emp_id, player_dict in players_data.items():
        try:
            # 영문 티어 → 한글 변환
            tier_map = {
                "Challenger": "챌린저", "Diamond": "다이아몬드", "Platinum": "플래티넘",
                "Gold": "골드", "Silver": "실버", "Bronze": "브론즈",
            }
            tier = player_dict.get("tier", "브론즈")
            if tier in tier_map:
                tier = tier_map[tier]
            
            db.add_player(
                emp_id=emp_id,
                name=player_dict.get("name", ""),
                score=player_dict.get("score", 1000),
                tier=tier,
                is_active=player_dict.get("is_active", True),
                join_date=player_dict.get("join_date"),
                role=player_dict.get("role", "player")
            )
            
            # 추가 필드 업데이트
            db.update_player(
                emp_id,
                xp=player_dict.get("xp", 0),
                match_count=player_dict.get("match_count", 0),
                win_count=player_dict.get("win_count", 0),
                streak=player_dict.get("streak", 0),
                boost_games=player_dict.get("boost_games", 0),
                last_attendance=player_dict.get("last_attendance"),
                attendance_count=player_dict.get("attendance_count", 0),
                consecutive_months=player_dict.get("consecutive_months", 0),
                total_played=player_dict.get("total_played", 0)
            )
            
            player_count += 1
            print(f"  ✓ {player_dict.get('name')} ({emp_id})")
        except Exception as e:
            print(f"  ✗ {emp_id} 마이그레이션 실패: {e}")
    
    print(f"✅ 선수 데이터 마이그레이션 완료: {player_count}/{len(players_data)}명")
    
    # 6. 경기 이력 마이그레이션
    history_data = data.get("history", {})
    total_matches = sum(len(matches) for matches in history_data.values())
    print(f"\n🏸 경기 이력 마이그레이션 ({total_matches}경기)")
    
    match_count = 0
    for date, matches in history_data.items():
        for match in matches:
            try:
                match_id = db.add_match(
                    date=date,
                    team1=match.get("team1", []),
                    team2=match.get("team2", []),
                    group_name=match.get("group")
                )
                
                # 경기 상세 정보 업데이트
                db.update_match(
                    match_id,
                    score1=match.get("score1", 0),
                    score2=match.get("score2", 0),
                    change1=match.get("change1", 0),
                    change2=match.get("change2", 0),
                    status=match.get("status", "pending"),
                    input_by=match.get("input_by"),
                    input_timestamp=match.get("input_timestamp"),
                    approved_by=match.get("approved_by"),
                    approved_timestamp=match.get("approved_timestamp"),
                    dispute_reason=match.get("dispute_reason")
                )
                
                match_count += 1
            except Exception as e:
                print(f"  ✗ {date} 경기 마이그레이션 실패: {e}")
    
    print(f"✅ 경기 이력 마이그레이션 완료: {match_count}/{total_matches}경기")
    
    # 7. 규칙 마이그레이션
    print(f"\n⚙️ 규칙 설정 마이그레이션")
    
    rules = data.get("rules", {})
    
    # 점수 규칙
    score_rules = rules.get("score", config.SCORE_RULES)
    for key, value in score_rules.items():
        db.set_score_rule(key, value)
    print(f"  ✓ 점수 규칙: {len(score_rules)}개")
    
    # 티어 규칙
    tier_rules = rules.get("tier", config.TIER_RULES)
    for tier_name, threshold in tier_rules.items():
        db.set_tier_rule(tier_name, threshold)
    print(f"  ✓ 티어 규칙: {len(tier_rules)}개")
    
    # 8. 시스템 설정 마이그레이션
    settings = data.get("settings", {})
    if settings:
        print(f"\n🔐 시스템 설정 마이그레이션")
        for key, value in settings.items():
            db.set_setting(key, json.dumps(value))
        print(f"  ✓ 설정: {len(settings)}개")
    
    # 9. 검증
    print(f"\n🔍 데이터 검증")
    db_players = db.get_all_players()
    db_dates = db.get_all_match_dates()
    
    print(f"  ✓ 선수 수: {len(db_players)} (원본: {len(players_data)})")
    print(f"  ✓ 경기 날짜: {len(db_dates)} (원본: {len(history_data)})")
    
    if len(db_players) == len(players_data):
        print("✅ 선수 데이터 검증 통과")
    else:
        print("⚠️ 선수 데이터 불일치")
    
    if len(db_dates) == len(history_data):
        print("✅ 경기 날짜 검증 통과")
    else:
        print("⚠️ 경기 날짜 불일치")
    
    # 10. 완료
    print("\n" + "=" * 60)
    print("✅ 마이그레이션 완료!")
    print("=" * 60)
    print(f"\n📊 마이그레이션 결과:")
    print(f"  - 선수: {player_count}명")
    print(f"  - 경기: {match_count}경기")
    print(f"  - 백업: {backup_file}")
    print(f"  - 데이터베이스: {config.DB_FILE}")
    print(f"\n⚠️ 원본 JSON 파일은 백업으로 보관되었습니다.")
    print(f"   문제 발생 시 백업 파일을 data.json으로 복원하세요.")
    
    return True


if __name__ == "__main__":
    try:
        success = migrate_json_to_sqlite()
        if success:
            print("\n✅ 마이그레이션이 성공적으로 완료되었습니다!")
            print("   이제 'streamlit run app.py'로 앱을 실행하세요.")
        else:
            print("\n❌ 마이그레이션 실패")
    except Exception as e:
        print(f"\n❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
