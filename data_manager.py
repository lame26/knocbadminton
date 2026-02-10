import json
import os
import shutil
import hashlib
from datetime import datetime
from database import Database
import config


class Player:
    """선수 데이터 클래스 (DB 호환성 유지)"""
    def __init__(self, emp_id, **kwargs):
        self.emp_id = emp_id
        self.name = kwargs.get("name", "")
        self.score = kwargs.get("score", 1000)
        self.xp = kwargs.get("xp", 0)
        self.tier = kwargs.get("tier", "브론즈")
        self.is_active = kwargs.get("is_active", True)
        self.join_date = kwargs.get("join_date", datetime.now().strftime("%Y-%m-%d"))
        self.match_count = kwargs.get("match_count", 0)
        self.win_count = kwargs.get("win_count", 0)
        self.streak = kwargs.get("streak", 0)
        self.boost_games = kwargs.get("boost_games", 0)
        self.last_attendance = kwargs.get("last_attendance")
        self.attendance_count = kwargs.get("attendance_count", 0)
        self.consecutive_months = kwargs.get("consecutive_months", 0)
        self.total_played = kwargs.get("total_played", 0)
        self.role = kwargs.get("role", "player")
    
    @classmethod
    def from_db_row(cls, row):
        """DB 행에서 Player 객체 생성"""
        emp_id = row["emp_id"]
        # emp_id를 제외한 나머지 필드만 kwargs로 전달
        kwargs = {k: v for k, v in row.items() if k != "emp_id"}
        return cls(emp_id, **kwargs)


class DataManager:
    """데이터베이스 기반 데이터 관리자"""
    
    def __init__(self, db_file=None):
        self.db = Database(db_file)
        self.backup_dir = config.BACKUP_DIR
        
        if not os.path.exists(self.backup_dir):
            os.makedirs(self.backup_dir)
        
        # 규칙 초기화 (DB에서 로드, 없으면 기본값 사용)
        self.score_rules = self.db.get_score_rules() or self._init_score_rules()
        self.tier_rules = self.db.get_tier_rules() or self._init_tier_rules()
        
        # 슈퍼관리자 설정 초기화
        self.settings = self._load_settings()
        
        # 호환성을 위한 캐시 (필요시 사용)
        self._players_cache = None
        self._history_cache = None
    
    def _init_score_rules(self):
        """점수 규칙 초기화"""
        for key, value in config.SCORE_RULES.items():
            self.db.set_score_rule(key, value)
        return config.SCORE_RULES.copy()
    
    def _init_tier_rules(self):
        """티어 규칙 초기화"""
        for tier_name, threshold in config.TIER_RULES.items():
            self.db.set_tier_rule(tier_name, threshold)
        return config.TIER_RULES.copy()
    
    def _load_settings(self):
        """시스템 설정 로드"""
        settings_json = self.db.get_setting("super_admin")
        if settings_json:
            return {"super_admin": json.loads(settings_json)}
        else:
            # 기본 슈퍼관리자 설정
            default_sa = config.DEFAULT_SUPER_ADMIN.copy()
            self.db.set_setting("super_admin", json.dumps(default_sa))
            return {"super_admin": default_sa}
    
    @property
    def players(self):
        """선수 딕셔너리 (호환성 유지)"""
        if self._players_cache is None:
            rows = self.db.get_all_players()
            self._players_cache = {row["emp_id"]: Player.from_db_row(row) for row in rows}
        return self._players_cache
    
    @property
    def history(self):
        """경기 이력 딕셔너리 (호환성 유지)"""
        if self._history_cache is None:
            dates = self.db.get_all_match_dates()
            self._history_cache = {}
            for date in dates:
                matches = self.db.get_matches_by_date(date)
                self._history_cache[date] = []
                for m in matches:
                    # DB 형식 → JSON 형식 변환
                    team1 = [p for p in [m["team1_player1"], m["team1_player2"]] if p]
                    team2 = [p for p in [m["team2_player1"], m["team2_player2"]] if p]
                    self._history_cache[date].append({
                        "id": m["id"],
                        "team1": team1,
                        "team2": team2,
                        "score1": m["score1"],
                        "score2": m["score2"],
                        "change1": m["change1"],
                        "change2": m["change2"],
                        "group": m["group_name"],
                        "status": m["status"],
                        "input_by": m["input_by"],
                        "input_timestamp": m["input_timestamp"],
                        "approved_by": m["approved_by"],
                        "approved_timestamp": m["approved_timestamp"],
                        "dispute_reason": m["dispute_reason"],
                    })
        return self._history_cache
    
    def _invalidate_cache(self):
        """캐시 무효화"""
        self._players_cache = None
        self._history_cache = None
    
    # ========== 인증 시스템 ==========
    def authenticate(self, username, password):
        """로그인 처리"""
        # 1. 슈퍼관리자 체크
        sa = self.settings.get("super_admin", {})
        if username == sa.get("username", "admin"):
            pw_hash = hashlib.sha256(password.encode()).hexdigest()
            if pw_hash == sa.get("password_hash"):
                return True, "super_admin", None
        
        # 2. 선수 로그인
        player_row = self.db.get_player(password)  # password = emp_id
        if player_row and player_row["name"] == username:
            role = "admin" if player_row.get("role") == "admin" else "player"
            return True, role, password
        
        return False, None, None
    
    def set_player_role(self, eid, role):
        """관리자 권한 부여/회수"""
        success = self.db.update_player(eid, role=role)
        if success:
            self._invalidate_cache()
        return success
    
    def change_super_admin_password(self, new_password):
        """슈퍼관리자 비밀번호 변경"""
        pw_hash = hashlib.sha256(new_password.encode()).hexdigest()
        self.settings["super_admin"]["password_hash"] = pw_hash
        self.db.set_setting("super_admin", json.dumps(self.settings["super_admin"]))
    
    # ========== 데이터 I/O (호환성 유지) ==========
    def create_backup(self):
        """DB 백업 생성"""
        if not os.path.exists(self.db.db_file):
            return
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(self.backup_dir, f"knoc_badminton_backup_{timestamp}.db")
        try:
            shutil.copy2(self.db.db_file, backup_path)
            # 오래된 백업 삭제 (최대 30개)
            backups = self.get_backup_list()
            if len(backups) > 30:
                for old_file in backups[30:]:
                    os.remove(os.path.join(self.backup_dir, old_file))
        except Exception as e:
            print(f"백업 실패: {e}")
    
    def get_backup_list(self):
        """백업 파일 목록"""
        if not os.path.exists(self.backup_dir):
            return []
        files = [f for f in os.listdir(self.backup_dir) 
                 if f.startswith("knoc_badminton_backup_") and f.endswith(".db")]
        files.sort(reverse=True)
        return files
    
    def restore_backup(self, filename):
        """백업 복구"""
        src = os.path.join(self.backup_dir, filename)
        if os.path.exists(src):
            shutil.copy2(src, self.db.db_file)
            self._invalidate_cache()
            # 규칙 재로드
            self.score_rules = self.db.get_score_rules()
            self.tier_rules = self.db.get_tier_rules()
            self.settings = self._load_settings()
            return True
        return False
    
    def load_data(self):
        """호환성 유지 (더 이상 필요 없음)"""
        pass
    
    def save_data(self):
        """호환성 유지 (자동 저장되므로 불필요)"""
        pass
    
    # ========== 규칙 / 티어 ==========
    def update_rules(self, new_score_rules, new_tier_rules):
        """규칙 업데이트"""
        # 점수 규칙 업데이트
        for key, value in new_score_rules.items():
            self.db.set_score_rule(key, value)
        self.score_rules = new_score_rules
        
        # 티어 규칙 업데이트
        for tier_name, threshold in new_tier_rules.items():
            self.db.set_tier_rule(tier_name, threshold)
        self.tier_rules = new_tier_rules
        
        # 모든 선수 티어 재계산
        players = self.db.get_all_players()
        for p in players:
            new_tier = self.calculate_tier(p["score"])
            self.db.update_player(p["emp_id"], tier=new_tier)
        
        self._invalidate_cache()
    
    def calculate_tier(self, score):
        """티어 계산"""
        sorted_tiers = sorted(self.tier_rules.items(), key=lambda x: x[1], reverse=True)
        for tier_name, threshold in sorted_tiers:
            if score >= threshold:
                return tier_name
        return "브론즈"
    
    # ========== 선수 관리 ==========
    def add_player(self, eid, name, score=1000, is_active=True):
        """선수 추가"""
        tier = self.calculate_tier(score)
        join_date = datetime.now().strftime("%Y-%m-%d")
        success = self.db.add_player(eid, name, score, tier, is_active, join_date)
        if success:
            self._invalidate_cache()
            return True, f"{name} 선수 등록 완료!"
        return False, "이미 존재하는 사번입니다."
    
    def update_player_info(self, emp_id, new_name=None, new_score=None, is_active=None):
        """선수 정보 수정"""
        updates = {}
        if new_name:
            updates["name"] = new_name
        if new_score is not None:
            updates["score"] = new_score
            updates["tier"] = self.calculate_tier(new_score)
        if is_active is not None:
            updates["is_active"] = is_active
        
        if updates:
            success = self.db.update_player(emp_id, **updates)
            if success:
                self._invalidate_cache()
            return success
        return False
    
    def delete_player(self, eid):
        """선수 삭제"""
        success = self.db.delete_player(eid)
        if success:
            self._invalidate_cache()
        return success
    
    def change_emp_id(self, old_id, new_id):
        """사번 변경 (복잡한 작업 - 추후 구현)"""
        # TODO: 경기 이력의 모든 참조도 업데이트 필요
        return False
    
    # ========== 경기 결과 처리 ==========
    def update_match_result(self, date, match_idx, score1, score2, input_by=None):
        """경기 결과 업데이트 (확정)"""
        matches = self.history.get(date, [])
        if match_idx >= len(matches):
            return False
        
        match = matches[match_idx]
        match_id = match.get("id")
        
        if not match_id:
            return False
        
        # 기존 결과가 있으면 롤백
        if match.get("status") == "done":
            self._rollback_match_effect(match)
        
        # 점수 계산
        t1, t2 = match["team1"], match["team2"]
        win_t1 = score1 > score2
        diff = abs(score1 - score2)
        
        # 평균 점수 계산
        players_dict = self.players
        avg_s1 = sum(players_dict[p].score for p in t1 if p in players_dict) / max(len(t1), 1)
        avg_s2 = sum(players_dict[p].score for p in t2 if p in players_dict) / max(len(t2), 1)
        
        # 보너스 계산
        base_win = self.score_rules["win"]
        base_loss = self.score_rules["loss"]
        bonus = 0
        
        if diff >= self.score_rules.get("big_diff", 10):
            bonus += self.score_rules.get("big_win", 5)
        if win_t1 and (avg_s2 - avg_s1 >= 100):
            bonus += self.score_rules.get("underdog", 15)
        elif not win_t1 and (avg_s1 - avg_s2 >= 100):
            bonus += self.score_rules.get("underdog", 15)
        
        change_win = base_win + bonus
        change_loss = base_loss
        
        # 선수 점수 업데이트
        for pid in t1:
            if pid in players_dict:
                self._apply_score(pid, win_t1, change_win, change_loss)
        for pid in t2:
            if pid in players_dict:
                self._apply_score(pid, not win_t1, change_win, change_loss)
        
        # 경기 상태 업데이트
        self.db.update_match(
            match_id,
            score1=score1,
            score2=score2,
            change1=change_win if win_t1 else change_loss,
            change2=change_loss if win_t1 else change_win,
            status="done",
            input_by=input_by,
            input_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M") if input_by else None
        )
        
        self._invalidate_cache()
        return True
    
    def submit_score_for_approval(self, date, match_idx, score1, score2, input_by):
        """점수 입력 → 승인 대기"""
        matches = self.history.get(date, [])
        if match_idx >= len(matches):
            return False
        
        match = matches[match_idx]
        match_id = match.get("id")
        
        if not match_id or match.get("status") == "done":
            return False
        
        self.db.update_match(
            match_id,
            score1=score1,
            score2=score2,
            status="pending_approval",
            input_by=input_by,
            input_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M")
        )
        
        self._invalidate_cache()
        return True
    
    def approve_match(self, date, match_idx, approved_by):
        """상대팀 승인 → 확정"""
        matches = self.history.get(date, [])
        if match_idx >= len(matches):
            return False
        
        match = matches[match_idx]
        if match.get("status") != "pending_approval":
            return False
        
        s1, s2 = match["score1"], match["score2"]
        match_id = match["id"]
        
        # 임시로 pending 상태로 변경
        self.db.update_match(
            match_id,
            status="pending",
            score1=0,
            score2=0,
            approved_by=approved_by,
            approved_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M")
        )
        
        self._invalidate_cache()
        
        # 실제 점수 반영
        return self.update_match_result(date, match_idx, s1, s2, input_by=match.get("input_by"))
    
    def reject_match(self, date, match_idx, reason=""):
        """이의제기"""
        matches = self.history.get(date, [])
        if match_idx >= len(matches):
            return False
        
        match = matches[match_idx]
        if match.get("status") != "pending_approval":
            return False
        
        match_id = match["id"]
        self.db.update_match(
            match_id,
            status="disputed",
            dispute_reason=reason,
            score1=0,
            score2=0
        )
        
        self._invalidate_cache()
        return True
    
    def admin_force_confirm(self, date, match_idx, score1, score2, admin_id):
        """관리자 강제 확정"""
        matches = self.history.get(date, [])
        if match_idx >= len(matches):
            return False
        
        match = matches[match_idx]
        match_id = match["id"]
        
        # 기존 결과 롤백
        if match.get("status") == "done":
            self._rollback_match_effect(match)
        
        # pending 상태로 리셋
        self.db.update_match(
            match_id,
            status="pending",
            score1=0,
            score2=0,
            approved_by=admin_id,
            approved_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M")
        )
        
        self._invalidate_cache()
        
        # 새 점수 반영
        return self.update_match_result(date, match_idx, score1, score2, input_by=admin_id)
    
    def _apply_score(self, pid, is_win, win_pt, loss_pt):
        """선수 점수 적용"""
        player_row = self.db.get_player(pid)
        if not player_row:
            return
        
        p = Player.from_db_row(player_row)
        p.match_count += 1
        
        if is_win:
            mult = self.get_boost_multiplier(pid)
            gain = int(win_pt * mult)
            p.score += gain
            p.win_count += 1
            p.streak += 1
            if mult > 1.0:
                p.boost_games += 1
        else:
            p.score += loss_pt
            p.streak = 0
        
        p.tier = self.calculate_tier(p.score)
        
        # DB 업데이트
        self.db.update_player(
            pid,
            score=p.score,
            tier=p.tier,
            match_count=p.match_count,
            win_count=p.win_count,
            streak=p.streak,
            boost_games=p.boost_games
        )
    
    def _rollback_match_effect(self, match):
        """경기 효과 롤백"""
        t1, t2 = match["team1"], match["team2"]
        win_t1 = match["score1"] > match["score2"]
        c1 = match.get("change1", 0)
        c2 = match.get("change2", 0)
        
        for pid in t1:
            self._revert_score(pid, win_t1, c1)
        for pid in t2:
            self._revert_score(pid, not win_t1, c2)
        
        # 경기 상태 리셋
        match_id = match["id"]
        self.db.update_match(
            match_id,
            status="pending",
            score1=0,
            score2=0,
            change1=0,
            change2=0
        )
    
    def _revert_score(self, pid, is_win, change):
        """점수 롤백"""
        player_row = self.db.get_player(pid)
        if not player_row:
            return
        
        p = Player.from_db_row(player_row)
        p.match_count -= 1
        
        if is_win:
            mult = self.get_boost_multiplier(pid)
            effective_change = int(change * mult) if mult > 1.0 else change
            p.score -= effective_change
            p.win_count -= 1
            if p.streak > 0:
                p.streak -= 1
            if mult > 1.0:
                p.boost_games -= 1
        else:
            p.score -= change
        
        # DB 업데이트
        self.db.update_player(
            pid,
            score=p.score,
            match_count=p.match_count,
            win_count=p.win_count,
            streak=p.streak,
            boost_games=p.boost_games
        )
    
    def delete_match_from_history(self, date, idx, keep_match=False):
        """경기 삭제"""
        matches = self.history.get(date, [])
        if idx >= len(matches):
            return
        
        match = matches[idx]
        if match["status"] == "done":
            self._rollback_match_effect(match)
        
        if not keep_match:
            match_id = match["id"]
            self.db.delete_match(match_id)
            self._invalidate_cache()
    
    # ========== 부스트 / 유틸 ==========
    def get_first_play_date(self, eid):
        """첫 경기 날짜"""
        dates = sorted(self.history.keys())
        for d in dates:
            for m in self.history[d]:
                if eid in m["team1"] or eid in m["team2"]:
                    return d
        return None
    
    def get_boost_multiplier(self, eid):
        """부스트 배수 계산"""
        player_row = self.db.get_player(eid)
        if not player_row:
            return 1.0
        
        p = Player.from_db_row(player_row)
        first_play = self.get_first_play_date(eid)
        
        if first_play:
            try:
                s_date = datetime.strptime(first_play, "%Y-%m-%d")
                s_year, s_month = s_date.year, s_date.month
            except:
                try:
                    s_date = datetime.strptime(first_play, "%Y-%m")
                    s_year, s_month = s_date.year, s_date.month
                except:
                    s_year, s_month = datetime.now().year, 1
        else:
            now = datetime.now()
            s_year, s_month = now.year, now.month
        
        if s_year == datetime.now().year:
            catch_up = (s_month - 1) * 4
            limit = (13 - s_month) * 4
            cap = min(catch_up, limit)
            if p.boost_games < cap:
                return 1.25
        return 1.0
    
    # ========== 출석 / XP ==========
    def check_attendance(self, eid, date_str):
        """출석 체크"""
        player_row = self.db.get_player(eid)
        if not player_row:
            return
        
        p = Player.from_db_row(player_row)
        current_month = date_str[:7]
        
        if p.last_attendance == current_month:
            return
        
        gain = 100
        if p.last_attendance:
            try:
                ly, lm = map(int, p.last_attendance.split("-"))
                cy, cm = map(int, current_month.split("-"))
                diff = (cy - ly) * 12 + (cm - lm)
                if diff == 1:
                    p.consecutive_months += 1
                    gain += 50
                else:
                    p.consecutive_months = 1
            except:
                p.consecutive_months = 1
        else:
            p.consecutive_months = 1
        
        p.last_attendance = current_month
        p.attendance_count += 1
        
        if p.attendance_count % 3 == 0:
            gain += 200
        
        p.xp += gain
        
        # DB 업데이트
        self.db.update_player(
            eid,
            xp=p.xp,
            last_attendance=p.last_attendance,
            attendance_count=p.attendance_count,
            consecutive_months=p.consecutive_months
        )
    
    def add_attendance_xp(self, date, attendees):
        """출석 XP 지급"""
        for eid in attendees:
            self.check_attendance(eid, date)
        self._invalidate_cache()
        return True, "XP 지급 완료"
    
    def recalculate_all_xp(self):
        """전체 XP 재계산"""
        try:
            # 모든 선수 XP 초기화
            players = self.db.get_all_players()
            for p in players:
                self.db.update_player(
                    p["emp_id"],
                    xp=0,
                    last_attendance=None,
                    attendance_count=0,
                    consecutive_months=0
                )
            
            # 날짜순으로 출석 재계산
            dates = sorted(self.history.keys())
            for d in dates:
                attendees = set()
                for m in self.history[d]:
                    attendees.update(m["team1"])
                    attendees.update(m["team2"])
                for eid in attendees:
                    self.check_attendance(eid, d)
            
            self._invalidate_cache()
            return True, "모든 선수의 XP가 재계산되었습니다."
        except Exception as e:
            return False, str(e)
    
    # ========== 통계 ==========
    def get_rank_changes(self):
        """랭킹 변동 계산"""
        players_dict = self.players
        current_rank = {}
        sorted_curr = sorted(players_dict.items(), key=lambda x: x[1].score, reverse=True)
        for i, (eid, _) in enumerate(sorted_curr):
            current_rank[eid] = i + 1
        
        prev_scores = {eid: p.score for eid, p in players_dict.items()}
        
        # 가장 최근 날짜의 경기 역산
        if self.history:
            latest_date = sorted(self.history.keys())[-1]
            for m in self.history[latest_date]:
                if m["status"] == "done":
                    c1 = m.get("change1", 0)
                    c2 = m.get("change2", 0)
                    for pid in m["team1"]:
                        if pid in prev_scores:
                            prev_scores[pid] -= c1
                    for pid in m["team2"]:
                        if pid in prev_scores:
                            prev_scores[pid] -= c2
        
        sorted_prev = sorted(prev_scores.items(), key=lambda x: x[1], reverse=True)
        prev_rank = {eid: i + 1 for i, (eid, _) in enumerate(sorted_prev)}
        
        changes = {}
        for eid in players_dict:
            if eid in current_rank and eid in prev_rank:
                changes[eid] = {"rank_ch": prev_rank[eid] - current_rank[eid]}
        return changes
    
    def get_player_stats(self, eid):
        """선수 통계"""
        partners, rivals = {}, {}
        players_dict = self.players
        
        for d in self.history:
            for m in self.history[d]:
                if m["status"] != "done":
                    continue
                if eid in m["team1"]:
                    t_my, t_op = m["team1"], m["team2"]
                    win = m["score1"] > m["score2"]
                elif eid in m["team2"]:
                    t_my, t_op = m["team2"], m["team1"]
                    win = m["score2"] > m["score1"]
                else:
                    continue
                
                for p in t_my:
                    if p == eid:
                        continue
                    if p not in partners:
                        partners[p] = {"g": 0, "w": 0}
                    partners[p]["g"] += 1
                    if win:
                        partners[p]["w"] += 1
                
                if not win:
                    for p in t_op:
                        if p not in rivals:
                            rivals[p] = {"g": 0, "w": 0}
                        rivals[p]["g"] += 1
                        rivals[p]["w"] += 1
        
        bp, bpr = "-", ""
        if partners:
            best = max(partners.items(), key=lambda x: (x[1]["w"] / max(x[1]["g"], 1), x[1]["g"]))
            if best[0] in players_dict:
                bp = players_dict[best[0]].name
                bpr = f"{int(best[1]['w'] / max(best[1]['g'], 1) * 100)}% ({best[1]['w']}승)"
        
        wr, wrr = "-", ""
        if rivals:
            worst = max(rivals.items(), key=lambda x: x[1]["w"])
            if worst[0] in players_dict:
                wr = players_dict[worst[0]].name
                wrr = f"{worst[1]['w']}패"
        
        return {"best_partner": bp, "best_partner_rate": bpr, "rival": wr, "rival_rate": wrr}
    
    def get_player_match_history(self, eid):
        """선수 경기 이력"""
        match_log = []
        players_dict = self.players
        
        for d in sorted(self.history.keys(), reverse=True):
            for m in self.history[d]:
                if m["status"] != "done":
                    continue
                if eid in m["team1"] or eid in m["team2"]:
                    is_t1 = eid in m["team1"]
                    is_win = (is_t1 and m["score1"] > m["score2"]) or (not is_t1 and m["score2"] > m["score1"])
                    my_team = m["team1"] if is_t1 else m["team2"]
                    op_team = m["team2"] if is_t1 else m["team1"]
                    
                    try:
                        my_names = ", ".join([players_dict[pid].name for pid in my_team if pid in players_dict])
                        op_names = ", ".join([players_dict[pid].name for pid in op_team if pid in players_dict])
                    except:
                        continue
                    
                    my_score = m["score1"] if is_t1 else m["score2"]
                    op_score = m["score2"] if is_t1 else m["score1"]
                    change = m.get("change1", 0) if is_t1 else m.get("change2", 0)
                    
                    match_log.append({
                        "date": d,
                        "my_team": my_names,
                        "op_team": op_names,
                        "my_score": my_score,
                        "op_score": op_score,
                        "result": "승리" if is_win else "패배",
                        "change": change,
                        "group": m.get("group", "-"),
                    })
        return match_log
    
    def get_daily_summary(self, date):
        """당일 경기 요약"""
        matches = self.history.get(date, [])
        stats = {}
        players_dict = self.players
        
        for m in matches:
            if m.get("status") != "done":
                continue
            win_t1 = m["score1"] > m["score2"]
            
            for pid in m["team1"]:
                if pid not in players_dict:
                    continue
                if pid not in stats:
                    stats[pid] = {"name": players_dict[pid].name, "w": 0, "l": 0, "c": 0, "g": 0}
                stats[pid]["g"] += 1
                stats[pid]["c"] += m.get("change1", 0)
                if win_t1:
                    stats[pid]["w"] += 1
                else:
                    stats[pid]["l"] += 1
            
            for pid in m["team2"]:
                if pid not in players_dict:
                    continue
                if pid not in stats:
                    stats[pid] = {"name": players_dict[pid].name, "w": 0, "l": 0, "c": 0, "g": 0}
                stats[pid]["g"] += 1
                stats[pid]["c"] += m.get("change2", 0)
                if not win_t1:
                    stats[pid]["w"] += 1
                else:
                    stats[pid]["l"] += 1
        
        return stats
    
    # ========== 대진표 생성 ==========
    def generate_tournament(self, date, attendees, mode="밸런스"):
        """대진표 생성"""
        if len(attendees) < 4:
            return False, "최소 4명 이상 필요합니다."
        
        players_dict = self.players
        attendees.sort(key=lambda x: players_dict[x].score if x in players_dict else 0, reverse=True)
        
        # 출석 XP 지급
        self.add_attendance_xp(date, attendees)
        
        # 조 편성
        groups = self._split_groups(len(attendees))
        if not groups:
            return False, "인원 조합을 만들 수 없습니다."
        
        idx = 0
        target = self.score_rules.get("target_games", 4)
        
        for i, size in enumerate(groups):
            mems = attendees[idx: idx + size]
            idx += size
            
            if "밸런스" in mode:
                matches = self._get_balanced_matches(mems, target)
            else:
                matches = self._get_random_matches(mems, target)
            
            for m in matches:
                self.db.add_match(
                    date=date,
                    team1=m[0],
                    team2=m[1],
                    group_name=chr(65 + i)
                )
        
        self._invalidate_cache()
        return True, f"[{date}] 대진표 생성 완료! ({len(attendees)}명, {len(groups)}조)"
    
    def _split_groups(self, total):
        """조 분할 알고리즘"""
        best, min_fours = None, total
        for n6 in range(total // 6, -1, -1):
            rem = total - n6 * 6
            for n5 in range(rem // 5, -1, -1):
                rem2 = rem - n5 * 5
                if rem2 % 4 == 0:
                    n4 = rem2 // 4
                    if n4 <= min_fours:
                        min_fours = n4
                        best = [6] * n6 + [5] * n5 + [4] * n4
        return best
    
    def _get_balanced_matches(self, m, target):
        """밸런스 매칭"""
        import random
        if len(m) == 4:
            base = [
                ([m[0], m[3]], [m[1], m[2]]),
                ([m[0], m[2]], [m[1], m[3]]),
                ([m[0], m[1]], [m[2], m[3]]),
            ]
        else:
            return self._get_random_matches(m, target)
        
        final_matches = []
        while len(final_matches) * 4 / len(m) < target:
            final_matches.extend(base)
        needed = int(target * len(m) / 4)
        return final_matches[:needed]
    
    def _get_random_matches(self, m, target):
        """랜덤 매칭"""
        import random
        base = []
        if len(m) == 4:
            base = [
                ([m[0], m[1]], [m[2], m[3]]),
                ([m[0], m[2]], [m[1], m[3]]),
                ([m[0], m[3]], [m[1], m[2]]),
            ]
            return base[:target]
        elif len(m) == 5:
            base = [
                ([m[0], m[1]], [m[2], m[3]]),
                ([m[0], m[2]], [m[3], m[4]]),
                ([m[0], m[3]], [m[1], m[4]]),
                ([m[0], m[4]], [m[1], m[2]]),
                ([m[1], m[3]], [m[2], m[4]]),
            ]
        elif len(m) == 6:
            base = [
                ([m[0], m[1]], [m[2], m[3]]),
                ([m[0], m[4]], [m[1], m[5]]),
                ([m[2], m[4]], [m[3], m[5]]),
                ([m[0], m[2]], [m[4], m[5]]),
                ([m[1], m[3]], [m[2], m[5]]),
                ([m[0], m[3]], [m[1], m[4]]),
            ]
        
        curr = len(base) * 4 / len(m)
        while curr < target:
            ex = list(m)
            random.shuffle(ex)
            base.append(([ex[0], ex[1]], [ex[2], ex[3]]))
            curr = len(base) * 4 / len(m)
        return base
