import json
import os
import shutil
import hashlib
from datetime import datetime
import config


class Player:
    def __init__(self, name, score=1000, xp=0, tier="브론즈",
                 is_active=True, join_date=None,
                 match_count=0, win_count=0, streak=0, boost_games=0):
        self.name = name
        self.score = score
        self.xp = xp
        self.tier = tier
        self.is_active = is_active
        self.join_date = join_date if join_date else datetime.now().strftime("%Y-%m-%d")
        self.match_count = match_count
        self.win_count = win_count
        self.streak = streak
        self.boost_games = boost_games
        self.last_attendance = None
        self.attendance_count = 0
        self.consecutive_months = 0
        self.total_played = 0
        # 웹 신규 필드
        self.role = "player"  # "player" | "admin"

    def to_dict(self):
        return self.__dict__

    @classmethod
    def from_dict(cls, data):
        p = cls(data["name"])
        p.__dict__.update(data)
        # 마이그레이션: 영문 등급 → 한글
        tier_map = {
            "Challenger": "챌린저", "Diamond": "다이아몬드", "Platinum": "플래티넘",
            "Gold": "골드", "Silver": "실버", "Bronze": "브론즈",
        }
        if p.tier in tier_map:
            p.tier = tier_map[p.tier]
        # 마이그레이션: role 필드 없으면 추가
        if not hasattr(p, "role"):
            p.role = "player"
        return p


class DataManager:
    def __init__(self, data_file=None):
        self.data_file = data_file or config.DATA_FILE
        self.backup_dir = config.BACKUP_DIR
        self.players = {}
        self.history = {}
        self.score_rules = config.SCORE_RULES.copy()
        self.tier_rules = config.TIER_RULES.copy()
        # 슈퍼관리자 설정
        self.settings = {
            "super_admin": config.DEFAULT_SUPER_ADMIN.copy()
        }

        if not os.path.exists(self.backup_dir):
            os.makedirs(self.backup_dir)

        self.load_data()

    # ========== 인증 시스템 ==========
    def authenticate(self, username, password):
        """
        로그인 처리.
        Returns: (success: bool, role: str, emp_id: str|None)
        role: "super_admin" | "admin" | "player" | None
        """
        # 1. 슈퍼관리자 체크
        sa = self.settings.get("super_admin", {})
        if username == sa.get("username", "admin"):
            pw_hash = hashlib.sha256(password.encode()).hexdigest()
            if pw_hash == sa.get("password_hash"):
                return True, "super_admin", None
        
        # 2. 선수 로그인 (이름 = username, 사번 = password)
        for eid, p in self.players.items():
            if p.name == username and eid == password:
                role = "admin" if getattr(p, "role", "player") == "admin" else "player"
                return True, role, eid

        return False, None, None

    def set_player_role(self, eid, role):
        """관리자 권한 부여/회수"""
        if eid in self.players:
            self.players[eid].role = role
            self.save_data()
            return True
        return False

    def change_super_admin_password(self, new_password):
        """슈퍼관리자 비밀번호 변경"""
        self.settings["super_admin"]["password_hash"] = hashlib.sha256(new_password.encode()).hexdigest()
        self.save_data()

    # ========== 데이터 I/O ==========
    def create_backup(self):
        if not os.path.exists(self.data_file):
            return
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(self.backup_dir, f"data_backup_{timestamp}.json")
        try:
            shutil.copy2(self.data_file, backup_path)
            backups = self.get_backup_list()
            if len(backups) > 30:
                for old_file in backups[30:]:
                    os.remove(os.path.join(self.backup_dir, old_file))
        except Exception as e:
            print(f"백업 실패: {e}")

    def get_backup_list(self):
        if not os.path.exists(self.backup_dir):
            return []
        files = [f for f in os.listdir(self.backup_dir) if f.startswith("data_backup_") and f.endswith(".json")]
        files.sort(reverse=True)
        return files

    def restore_backup(self, filename):
        src = os.path.join(self.backup_dir, filename)
        if os.path.exists(src):
            shutil.copy2(src, self.data_file)
            self.load_data()
            return True
        return False

    def load_data(self):
        if not os.path.exists(self.data_file):
            return
        try:
            with open(self.data_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.players = {k: Player.from_dict(v) for k, v in data.get("players", {}).items()}
                self.history = data.get("history", {})
                if "rules" in data:
                    if "score" in data["rules"]:
                        self.score_rules = data["rules"]["score"]
                    if "tier" in data["rules"]:
                        self.tier_rules = data["rules"]["tier"]
                if "settings" in data:
                    self.settings.update(data["settings"])
        except Exception as e:
            print(f"데이터 로드 실패: {e}")

    def save_data(self):
        data = {
            "players": {k: v.to_dict() for k, v in self.players.items()},
            "history": self.history,
            "rules": {
                "score": self.score_rules,
                "tier": self.tier_rules,
            },
            "settings": self.settings,
        }
        with open(self.data_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)

    # ========== 규칙 / 티어 ==========
    def update_rules(self, new_score_rules, new_tier_rules):
        self.score_rules = new_score_rules
        self.tier_rules = new_tier_rules
        self.save_data()
        for p in self.players.values():
            p.tier = self.calculate_tier(p.score)
        self.save_data()

    def calculate_tier(self, score):
        sorted_tiers = sorted(self.tier_rules.items(), key=lambda x: x[1], reverse=True)
        for tier_name, threshold in sorted_tiers:
            if score >= threshold:
                return tier_name
        return "브론즈"

    # ========== 선수 관리 ==========
    def add_player(self, eid, name, score=1000, is_active=True):
        if eid in self.players:
            return False, "이미 존재하는 사번입니다."
        new_player = Player(
            name=name,
            score=score,
            tier=self.calculate_tier(score),
            is_active=is_active,
            join_date=datetime.now().strftime("%Y-%m-%d"),
        )
        self.players[eid] = new_player
        self.save_data()
        return True, f"{name} 선수 등록 완료!"

    def update_player_info(self, emp_id, new_name=None, new_score=None, is_active=None):
        if emp_id in self.players:
            p = self.players[emp_id]
            if new_name:
                p.name = new_name
            if new_score is not None:
                p.score = new_score
                p.tier = self.calculate_tier(p.score)
            if is_active is not None:
                p.is_active = is_active
            self.save_data()
            return True
        return False

    def delete_player(self, eid):
        if eid in self.players:
            del self.players[eid]
            self.save_data()
            return True
        return False

    def change_emp_id(self, old_id, new_id):
        if old_id not in self.players or new_id in self.players:
            return False
        self.players[new_id] = self.players.pop(old_id)
        for date in self.history:
            for match in self.history[date]:
                match["team1"] = [new_id if x == old_id else x for x in match["team1"]]
                match["team2"] = [new_id if x == old_id else x for x in match["team2"]]
        self.save_data()
        return True

    # ========== 경기 결과 처리 (기존 로직 100% 유지) ==========
    def update_match_result(self, date, match_idx, score1, score2, input_by=None):
        if date not in self.history or match_idx >= len(self.history[date]):
            return False

        match = self.history[date][match_idx]
        t1, t2 = match["team1"], match["team2"]

        if match.get("status") == "done":
            self._rollback_match_effect(match)

        win_t1 = score1 > score2
        diff = abs(score1 - score2)

        avg_s1 = sum(self.players[p].score for p in t1 if p in self.players) / max(len(t1), 1)
        avg_s2 = sum(self.players[p].score for p in t2 if p in self.players) / max(len(t2), 1)

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

        for pid in t1:
            if pid in self.players:
                self._apply_score(pid, win_t1, change_win, change_loss)
        for pid in t2:
            if pid in self.players:
                self._apply_score(pid, not win_t1, change_win, change_loss)

        match["score1"] = score1
        match["score2"] = score2
        match["status"] = "done"
        match["change1"] = change_win if win_t1 else change_loss
        match["change2"] = change_loss if win_t1 else change_win

        # 웹 확장 필드
        if input_by:
            match["input_by"] = input_by
            match["input_timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M")

        self.save_data()
        return True

    def submit_score_for_approval(self, date, match_idx, score1, score2, input_by):
        """점수 입력 → 승인 대기 상태로 전환 (랭킹 미반영)"""
        if date not in self.history or match_idx >= len(self.history[date]):
            return False

        match = self.history[date][match_idx]
        if match.get("status") == "done":
            return False  # 이미 확정된 경기

        match["score1"] = score1
        match["score2"] = score2
        match["status"] = "pending_approval"
        match["input_by"] = input_by
        match["input_timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M")
        match["approved_by"] = None

        self.save_data()
        return True

    def approve_match(self, date, match_idx, approved_by):
        """상대팀 승인 → 확정 + 랭킹 반영"""
        if date not in self.history or match_idx >= len(self.history[date]):
            return False

        match = self.history[date][match_idx]
        if match.get("status") != "pending_approval":
            return False

        s1, s2 = match["score1"], match["score2"]
        match["status"] = "pending"  # 임시로 리셋
        match["score1"] = 0
        match["score2"] = 0
        match["approved_by"] = approved_by
        match["approved_timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M")

        # 실제 점수 반영
        return self.update_match_result(date, match_idx, s1, s2, input_by=match.get("input_by"))

    def reject_match(self, date, match_idx, reason=""):
        """이의제기 → 관리자 중재 필요"""
        if date not in self.history or match_idx >= len(self.history[date]):
            return False

        match = self.history[date][match_idx]
        if match.get("status") != "pending_approval":
            return False

        match["status"] = "disputed"
        match["dispute_reason"] = reason
        match["score1"] = 0
        match["score2"] = 0
        self.save_data()
        return True

    def admin_force_confirm(self, date, match_idx, score1, score2, admin_id):
        """관리자 강제 확정"""
        if date not in self.history or match_idx >= len(self.history[date]):
            return False

        match = self.history[date][match_idx]
        # 이미 done이면 롤백 후 재적용
        match["status"] = "pending"
        match["score1"] = 0
        match["score2"] = 0
        match["approved_by"] = admin_id
        match["approved_timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M")

        return self.update_match_result(date, match_idx, score1, score2, input_by=admin_id)

    def _apply_score(self, pid, is_win, win_pt, loss_pt):
        p = self.players[pid]
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

    def _rollback_match_effect(self, match):
        t1, t2 = match["team1"], match["team2"]
        win_t1 = match["score1"] > match["score2"]
        c1 = match.get("change1", 0)
        c2 = match.get("change2", 0)
        for pid in t1:
            if pid in self.players:
                self._revert_score(pid, win_t1, c1)
        for pid in t2:
            if pid in self.players:
                self._revert_score(pid, not win_t1, c2)
        match["status"] = "pending"
        match["score1"] = 0
        match["score2"] = 0
        match["change1"] = 0
        match["change2"] = 0
        self.save_data()

    def _revert_score(self, pid, is_win, change):
        p = self.players[pid]
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

    def delete_match_from_history(self, date, idx, keep_match=False):
        if date not in self.history:
            return
        match = self.history[date][idx]
        if match["status"] == "done":
            self._rollback_match_effect(match)
        if not keep_match:
            del self.history[date][idx]
            if not self.history[date]:
                del self.history[date]
        self.save_data()

    # ========== 부스트 / 유틸 ==========
    def get_first_play_date(self, eid):
        if not self.history:
            return None
        sorted_dates = sorted(self.history.keys())
        for d in sorted_dates:
            for m in self.history[d]:
                if eid in m["team1"] or eid in m["team2"]:
                    return d
        return None

    def get_boost_multiplier(self, eid):
        p = self.players[eid]
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
        p = self.players[eid]
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
        self.save_data()

    def add_attendance_xp(self, date, attendees):
        for eid in attendees:
            if eid in self.players:
                self.check_attendance(eid, date)
        return True, "XP 지급 완료"

    def recalculate_all_xp(self):
        try:
            for p in self.players.values():
                p.xp = 0
                p.last_attendance = None
                p.attendance_count = 0
                p.consecutive_months = 0
            dates = sorted(self.history.keys())
            for d in dates:
                attendees = set()
                for m in self.history[d]:
                    attendees.update(m["team1"])
                    attendees.update(m["team2"])
                for eid in attendees:
                    if eid in self.players:
                        self.check_attendance(eid, d)
            self.save_data()
            return True, "모든 선수의 XP가 재계산되었습니다."
        except Exception as e:
            return False, str(e)

    # ========== 통계 ==========
    def get_rank_changes(self):
        current_rank = {}
        sorted_curr = sorted(self.players.items(), key=lambda x: x[1].score, reverse=True)
        for i, (eid, _) in enumerate(sorted_curr):
            current_rank[eid] = i + 1
        prev_scores = {eid: p.score for eid, p in self.players.items()}
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
        for eid in self.players:
            if eid in current_rank and eid in prev_rank:
                changes[eid] = {"rank_ch": prev_rank[eid] - current_rank[eid]}
        return changes

    def get_player_stats(self, eid):
        partners, rivals = {}, {}
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
            if best[0] in self.players:
                bp = self.players[best[0]].name
                bpr = f"{int(best[1]['w'] / max(best[1]['g'], 1) * 100)}% ({best[1]['w']}승)"
        wr, wrr = "-", ""
        if rivals:
            worst = max(rivals.items(), key=lambda x: x[1]["w"])
            if worst[0] in self.players:
                wr = self.players[worst[0]].name
                wrr = f"{worst[1]['w']}패"
        return {"best_partner": bp, "best_partner_rate": bpr, "rival": wr, "rival_rate": wrr}

    def get_player_match_history(self, eid):
        """선수의 전체 경기 이력 반환"""
        match_log = []
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
                        my_names = ", ".join([self.players[pid].name for pid in my_team if pid in self.players])
                        op_names = ", ".join([self.players[pid].name for pid in op_team if pid in self.players])
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
        """당일 경기 결과 요약"""
        matches = self.history.get(date, [])
        stats = {}
        for m in matches:
            if m.get("status") != "done":
                continue
            win_t1 = m["score1"] > m["score2"]
            for pid in m["team1"]:
                if pid not in self.players:
                    continue
                if pid not in stats:
                    stats[pid] = {"name": self.players[pid].name, "w": 0, "l": 0, "c": 0, "g": 0}
                stats[pid]["g"] += 1
                stats[pid]["c"] += m.get("change1", 0)
                if win_t1:
                    stats[pid]["w"] += 1
                else:
                    stats[pid]["l"] += 1
            for pid in m["team2"]:
                if pid not in self.players:
                    continue
                if pid not in stats:
                    stats[pid] = {"name": self.players[pid].name, "w": 0, "l": 0, "c": 0, "g": 0}
                stats[pid]["g"] += 1
                stats[pid]["c"] += m.get("change2", 0)
                if not win_t1:
                    stats[pid]["w"] += 1
                else:
                    stats[pid]["l"] += 1
        return stats

    # ========== 대진표 생성 (기존 tab_tourney 로직 이식) ==========
    def generate_tournament(self, date, attendees, mode="밸런스"):
        """대진표 생성"""
        if len(attendees) < 4:
            return False, "최소 4명 이상 필요합니다."

        attendees.sort(key=lambda x: self.players[x].score if x in self.players else 0, reverse=True)

        # 출석 XP 지급
        self.add_attendance_xp(date, attendees)

        # 조 편성
        groups = self._split_groups(len(attendees))
        if not groups:
            return False, "인원 조합을 만들 수 없습니다."

        self.history[date] = []
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
                self.history[date].append({
                    "team1": m[0], "score1": 0, "change1": 0,
                    "team2": m[1], "score2": 0, "change2": 0,
                    "group": chr(65 + i), "status": "pending",
                })

        self.save_data()
        return True, f"[{date}] 대진표 생성 완료! ({len(attendees)}명, {len(groups)}조)"

    def _split_groups(self, total):
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
