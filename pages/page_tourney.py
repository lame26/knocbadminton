import streamlit as st
from datetime import datetime
import config


def render(dm):
    st.markdown("""
    <div class="main-header">
        <h1>🏸 대진표 생성</h1>
        <p>참가 선수 선택 · 매칭 방식 설정 · 자동 조편성</p>
    </div>
    """, unsafe_allow_html=True)

    # 기본 설정
    col1, col2 = st.columns(2)
    with col1:
        date = st.text_input("📅 대회 월(Month)", value=datetime.now().strftime("%Y-%m"))
    with col2:
        mode = st.selectbox("⚖️ 매칭 방식", ["밸런스(박빙)", "완전랜덤"])

    if date in dm.history:
        st.warning(f"⚠️ [{date}] 날짜에 이미 대진표가 존재합니다. 생성 시 덮어쓰기됩니다.")

    # 참가자 선택
    st.markdown("### 👥 참가 선수 선택")
    
    # 검색
    search = st.text_input("🔍 이름 검색", placeholder="검색어...")

    # 전체 선택/해제
    col_a, col_b = st.columns(2)
    with col_a:
        select_all = st.button("✅ 전체 선택")
    with col_b:
        deselect_all = st.button("❌ 전체 해제")

    # 활성 선수 목록
    active_players = sorted(
        [(eid, p) for eid, p in dm.players.items() if p.is_active],
        key=lambda x: x[1].score, reverse=True,
    )

    if search:
        active_players = [(eid, p) for eid, p in active_players if search.lower() in p.name.lower()]

    # 체크박스 상태 관리
    if "tourney_checks" not in st.session_state:
        st.session_state.tourney_checks = {}

    if select_all:
        for eid, p in active_players:
            st.session_state.tourney_checks[eid] = True
        st.rerun()
    if deselect_all:
        st.session_state.tourney_checks = {}
        st.rerun()

    # 체크박스 그리드 (3열)
    cols = st.columns(3)
    selected_players = []

    for i, (eid, p) in enumerate(active_players):
        col = cols[i % 3]
        tier_icon = config.TIER_ICONS.get(p.tier, "")
        default_val = st.session_state.tourney_checks.get(eid, False)
        
        checked = col.checkbox(
            f"{tier_icon} {p.name} ({p.score}p)",
            value=default_val,
            key=f"chk_{eid}",
        )
        st.session_state.tourney_checks[eid] = checked
        if checked:
            selected_players.append(eid)

    # 선택 인원 표시
    st.markdown(f"---\n**선택된 인원: {len(selected_players)}명**")
    
    if len(selected_players) > 0:
        # 조 편성 미리보기
        groups = dm._split_groups(len(selected_players))
        if groups:
            group_text = ", ".join([f"{s}명조" for s in groups])
            st.info(f"📋 예상 조편성: {group_text} ({len(groups)}개 조)")
        else:
            st.error("이 인원으로는 조를 편성할 수 없습니다.")

    # 생성 버튼
    st.markdown("")
    if st.button(
        "🚀 대진표 생성 및 확정",
        use_container_width=True,
        type="primary",
        disabled=len(selected_players) < 4,
    ):
        if len(selected_players) < 4:
            st.error("최소 4명 이상 선택해주세요.")
        else:
            mode_val = "밸런스" if "밸런스" in mode else "랜덤"
            
            # 기존 기록 확인
            if date in dm.history:
                # 덮어쓰기
                pass
            
            success, msg = dm.generate_tournament(date, selected_players, mode_val)
            if success:
                st.success(msg)
                st.balloons()
                # 체크 초기화
                st.session_state.tourney_checks = {}
            else:
                st.error(msg)
