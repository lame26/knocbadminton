import streamlit as st
import os
import sys

# 경로 설정
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
from data_manager import DataManager

# =========================================================
# 세션 초기화
# =========================================================
def init_session():
    defaults = {
        "authenticated": False,
        "role": None,       # "super_admin" | "admin" | "player"
        "emp_id": None,     # 선수 사번 (슈퍼관리자는 None)
        "username": None,
        "current_page": "🏆 실시간 랭킹",
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def get_dm():
    """DataManager 싱글턴 (세션 내 캐시)"""
    if "dm" not in st.session_state:
        st.session_state.dm = DataManager()
    return st.session_state.dm


def reload_dm():
    """데이터 강제 리로드"""
    st.session_state.dm = DataManager()
    return st.session_state.dm


# =========================================================
# 페이지 설정
# =========================================================
st.set_page_config(
    page_title=config.APP_TITLE,
    page_icon=config.APP_ICON,
    layout="wide",
    initial_sidebar_state="expanded",
)

# CSS 커스텀 스타일
st.markdown("""
<style>
    /* 1. 자동 생성된 상단 메뉴 숨기기 (이 부분 추가!) */
    [data-testid="stSidebarNav"] {
        display: none !important;
    }

    /* 사이드바 */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #1565C0 0%, #0D47A1 100%);
    }
    
    /* 메인 헤더 */
    .main-header {
        background: linear-gradient(135deg, #1565C0, #0D47A1);
        color: white;
        padding: 1.5rem 2rem;
        border-radius: 12px;
        margin-bottom: 1.5rem;
        text-align: center;
    }
    .main-header h1 { color: white; margin: 0; font-size: 1.8rem; }
    .main-header p { color: #BBDEFB; margin: 0.3rem 0 0 0; font-size: 0.95rem; }
    
    /* 메트릭 카드 */
    .metric-card {
        background: white;
        border-radius: 12px;
        padding: 1.2rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        text-align: center;
        border-left: 4px solid #1565C0;
    }
    .metric-card h3 { margin: 0; color: #263238; font-size: 1.6rem; }
    .metric-card p { margin: 0.2rem 0 0 0; color: #78909C; font-size: 0.85rem; }
    
    /* 티어 뱃지 */
    .tier-badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 0.85rem;
        color: white;
    }
    
    /* 승인 상태 뱃지 */
    .status-pending { background: #FF9800; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; }
    .status-done { background: #4CAF50; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; }
    .status-disputed { background: #F44336; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; }
    .status-waiting { background: #90A4AE; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; }

    /* 랭킹 테이블 */
    .rank-1 { background: linear-gradient(90deg, #FFF9C4, white) !important; }
    .rank-2 { background: linear-gradient(90deg, #F5F5F5, white) !important; }
    .rank-3 { background: linear-gradient(90deg, #FFCCBC, white) !important; }
    
    /* 로그인 화면 */
    .login-container {
        max-width: 400px;
        margin: 5rem auto;
        padding: 2rem;
        background: white;
        border-radius: 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    
    /* 스크롤 가능 영역 */
    .scrollable { max-height: 500px; overflow-y: auto; }
    
    /* 버튼 스타일 */
    div.stButton > button {
        border-radius: 8px;
        font-weight: 600;
    }
    
    /* 데이터프레임 헤더 */
    .stDataFrame thead th {
        background-color: #1565C0 !important;
        color: white !important;
    }
</style>
""", unsafe_allow_html=True)


# =========================================================
# 로그인 화면
# =========================================================
def show_login():
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        st.markdown("""
        <div style="text-align: center; margin-top: 3rem;">
            <h1 style="font-size: 3rem;">🏸</h1>
            <h2 style="color: #1565C0;">KNOC 배드민턴</h2>
            <p style="color: #78909C;">월례대회 관리 시스템 v3.0</p>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("---")
        
        with st.form("login_form"):
            username = st.text_input("👤 이름 (관리자: admin)", placeholder="홍길동")
            password = st.text_input("🔑 사번 (관리자: 비밀번호)", type="password", placeholder="1234567")
            submitted = st.form_submit_button("로그인", use_container_width=True, type="primary")
            
            if submitted:
                dm = get_dm()
                success, role, emp_id = dm.authenticate(username, password)
                if success:
                    st.session_state.authenticated = True
                    st.session_state.role = role
                    st.session_state.emp_id = emp_id
                    st.session_state.username = username
                    st.rerun()
                else:
                    st.error("❌ 이름 또는 사번이 올바르지 않습니다.")
        
        st.markdown("""
        <div style="text-align: center; color: #90A4AE; font-size: 0.85rem; margin-top: 1rem;">
            💡 <b>선수</b>: 이름 + 사번으로 로그인<br>
            💡 <b>관리자</b>: admin + 비밀번호로 로그인
        </div>
        """, unsafe_allow_html=True)


# =========================================================
# 메인 앱 (로그인 후)
# =========================================================
def show_main_app():
    dm = get_dm()
    role = st.session_state.role
    username = st.session_state.username
    emp_id = st.session_state.emp_id

    # 사이드바
    with st.sidebar:
        st.markdown(f"""
        <div style="text-align: center; padding: 1rem 0;">
            <h2 style="color: white; margin: 0;">🏸 KNOC</h2>
            <p style="color: #BBDEFB; font-size: 0.9rem;">배드민턴 월례대회</p>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("---")
        
        # 사용자 정보
        role_labels = {"super_admin": "👑 슈퍼관리자", "admin": "🔧 관리자", "player": "👤 선수"}
        role_label = role_labels.get(role, "👤")
        st.markdown(f"""
        <div style="background: rgba(255,255,255,0.1); border-radius: 10px; padding: 0.8rem; margin-bottom: 1rem;">
            <p style="color: white; margin: 0; font-weight: bold;">🙋 {username}</p>
            <p style="color: #BBDEFB; margin: 0; font-size: 0.85rem;">{role_label}</p>
        </div>
        """, unsafe_allow_html=True)

        # 메뉴 구성 (권한별)
        menu_items = ["🏆 실시간 랭킹", "📋 대진표 조회"]
        
        if role == "player":
            menu_items += ["👤 내 프로필", "🎯 내 경기 입력"]
        
        if role in ("admin", "super_admin"):
            menu_items += ["👤 내 프로필"] if emp_id else []
            menu_items += ["👥 선수 관리", "🏸 대진표 생성", "⚖️ 경기 중재"]
        
        if role == "super_admin":
            menu_items += ["👑 권한 관리", "⚙️ 시스템 설정"]

        # 알림 뱃지 계산
        pending_count = 0
        if emp_id:
            for d in dm.history:
                for m in dm.history[d]:
                    if m.get("status") == "pending_approval":
                        if emp_id in m["team1"] or emp_id in m["team2"]:
                            if m.get("input_by") != emp_id:
                                pending_count += 1
        
        disputed_count = 0
        if role in ("admin", "super_admin"):
            for d in dm.history:
                for m in dm.history[d]:
                    if m.get("status") == "disputed":
                        disputed_count += 1

        page = st.radio(
            "메뉴",
            menu_items,
            label_visibility="collapsed",
        )
        
        # 알림 표시
        if pending_count > 0:
            st.warning(f"🔔 승인 대기 {pending_count}건")
        if disputed_count > 0:
            st.error(f"⚠️ 이의제기 {disputed_count}건")
        
        st.markdown("---")
        if st.button("🚪 로그아웃", use_container_width=True):
            for key in list(st.session_state.keys()):
                del st.session_state[key]
            st.rerun()

    # 페이지 라우팅
    if page == "🏆 실시간 랭킹":
        from pages import page_ranking
        page_ranking.render(dm)
    elif page == "📋 대진표 조회":
        from pages import page_bracket
        page_bracket.render(dm)
    elif page == "👤 내 프로필":
        from pages import page_profile
        page_profile.render(dm)
    elif page == "🎯 내 경기 입력":
        from pages import page_my_matches
        page_my_matches.render(dm)
    elif page == "👥 선수 관리":
        from pages import page_manage
        page_manage.render(dm)
    elif page == "🏸 대진표 생성":
        from pages import page_tourney
        page_tourney.render(dm)
    elif page == "⚖️ 경기 중재":
        from pages import page_mediate
        page_mediate.render(dm)
    elif page == "👑 권한 관리":
        from pages import page_roles
        page_roles.render(dm)
    elif page == "⚙️ 시스템 설정":
        from pages import page_settings
        page_settings.render(dm)


# =========================================================
# 엔트리 포인트
# =========================================================
init_session()

if not st.session_state.authenticated:
    show_login()
else:
    show_main_app()
