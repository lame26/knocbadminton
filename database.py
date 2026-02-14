import os
from typing import Optional, List, Dict, Any


def _get_supabase_client():
    """Supabase 클라이언트 생성 (Streamlit secrets 또는 환경변수 사용)"""
    from supabase import create_client
    try:
        import streamlit as st
        url = st.secrets["SUPABASE_URL"]
        key = st.secrets["SUPABASE_KEY"]
    except Exception:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_KEY", "")
    return create_client(url, key)


class Database:
    """Supabase 데이터베이스 관리 클래스"""

    def __init__(self, db_file=None):
        self.db_file = db_file or "supabase"  # 호환성 유지 (backup 체크용)
        self.client = _get_supabase_client()

    # ========== 선수 관리 ==========
    def add_player(self, emp_id: str, name: str, score: int = 1000,
                   tier: str = '브론즈', is_active: bool = True,
                   join_date: Optional[str] = None, role: str = 'player') -> bool:
        """선수 추가"""
        try:
            self.client.table('players').insert({
                'emp_id': emp_id,
                'name': name,
                'score': score,
                'tier': tier,
                'is_active': is_active,
                'join_date': join_date,
                'role': role,
            }).execute()
            return True
        except Exception:
            return False

    def get_player(self, emp_id: str) -> Optional[Dict[str, Any]]:
        """선수 조회"""
        result = self.client.table('players').select('*').eq('emp_id', emp_id).execute()
        return result.data[0] if result.data else None

    def get_all_players(self, active_only: bool = False) -> List[Dict[str, Any]]:
        """전체 선수 조회"""
        query = self.client.table('players').select('*')
        if active_only:
            query = query.eq('is_active', True)
        result = query.order('score', desc=True).execute()
        return result.data or []

    def update_player(self, emp_id: str, **kwargs) -> bool:
        """선수 정보 수정"""
        if not kwargs:
            return False
        try:
            self.client.table('players').update(kwargs).eq('emp_id', emp_id).execute()
            return True
        except Exception:
            return False

    def delete_player(self, emp_id: str) -> bool:
        """선수 삭제"""
        try:
            self.client.table('players').delete().eq('emp_id', emp_id).execute()
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

        try:
            result = self.client.table('matches').insert({
                'date': date,
                'group_name': group_name,
                'team1_player1': t1_p1,
                'team1_player2': t1_p2,
                'team2_player1': t2_p1,
                'team2_player2': t2_p2,
                'status': 'pending',
            }).execute()
            return result.data[0]['id'] if result.data else None
        except Exception:
            return None

    def get_matches_by_date(self, date: str) -> List[Dict[str, Any]]:
        """날짜별 경기 조회"""
        result = self.client.table('matches').select('*').eq('date', date).order('id').execute()
        return result.data or []

    def get_all_match_dates(self) -> List[str]:
        """모든 경기 날짜 조회"""
        result = self.client.table('matches').select('date').execute()
        dates = list(set(row['date'] for row in (result.data or [])))
        return sorted(dates, reverse=True)

    def update_match(self, match_id: int, **kwargs) -> bool:
        """경기 정보 수정"""
        if not kwargs:
            return False
        try:
            self.client.table('matches').update(kwargs).eq('id', match_id).execute()
            return True
        except Exception:
            return False

    def delete_match(self, match_id: int) -> bool:
        """경기 삭제"""
        try:
            self.client.table('matches').delete().eq('id', match_id).execute()
            return True
        except Exception:
            return False

    # ========== 설정 관리 ==========
    def set_setting(self, key: str, value: str) -> bool:
        """설정 저장"""
        try:
            self.client.table('settings').upsert({'key': key, 'value': value}).execute()
            return True
        except Exception:
            return False

    def get_setting(self, key: str) -> Optional[str]:
        """설정 조회"""
        result = self.client.table('settings').select('value').eq('key', key).execute()
        return result.data[0]['value'] if result.data else None

    def get_all_settings(self) -> Dict[str, str]:
        """전체 설정 조회"""
        result = self.client.table('settings').select('*').execute()
        return {row['key']: row['value'] for row in (result.data or [])}

    # ========== 규칙 관리 ==========
    def set_score_rule(self, key: str, value: int) -> bool:
        """점수 규칙 저장"""
        try:
            self.client.table('score_rules').upsert({'key': key, 'value': value}).execute()
            return True
        except Exception:
            return False

    def get_score_rules(self) -> Dict[str, int]:
        """점수 규칙 조회"""
        result = self.client.table('score_rules').select('*').execute()
        return {row['key']: row['value'] for row in (result.data or [])}

    def set_tier_rule(self, tier_name: str, threshold: int) -> bool:
        """티어 규칙 저장"""
        try:
            self.client.table('tier_rules').upsert({'tier_name': tier_name, 'threshold': threshold}).execute()
            return True
        except Exception:
            return False

    def get_tier_rules(self) -> Dict[str, int]:
        """티어 규칙 조회"""
        result = self.client.table('tier_rules').select('*').execute()
        return {row['tier_name']: row['threshold'] for row in (result.data or [])}
