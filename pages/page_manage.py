import streamlit as st
import pandas as pd
from datetime import datetime
import config


def render(dm):
    st.markdown("""
    <div class="main-header">
        <h1>👥 선수 등록 / 관리</h1>
        <p>신규 등록 · 정보 수정 · 휴회 처리</p>
    </div>
    """, unsafe_allow_html=True)

    # ========== 신규 선수 등록 ==========
    with st.expander("✨ 신규 선수 등록", expanded=False):
        with st.form("add_player_form"):
            col1, col2, col3, col4 = st.columns([1, 1, 1, 1])
            with col1:
                new_id = st.text_input("사번", placeholder="1234567")
            with col2:
                new_name = st.text_input("이름", placeholder="홍길동")
            with col3:
                new_score = st.number_input("초기 점수", value=1000, min_value=0, max_value=3000)
            with col4:
                new_active = st.checkbox("활동 상태", value=True)

            submitted = st.form_submit_button("등록", use_container_width=True, type="primary")
            if submitted:
                if not new_id or not new_name:
                    st.error("사번과 이름을 모두 입력해주세요.")
                else:
                    success, msg = dm.add_player(new_id.strip(), new_name.strip(), new_score, new_active)
                    if success:
                        st.success(msg)
                        st.rerun()
                    else:
                        st.error(msg)

    # ========== 선수 목록 ==========
    st.markdown("### 📋 선수 목록")

    # 검색 필터
    search = st.text_input("🔍 검색 (이름/사번)", placeholder="검색어 입력...")

    # 테이블 데이터 구성
    rows = []
    for eid, p in sorted(dm.players.items(), key=lambda x: x[1].score, reverse=True):
        if search:
            if search.lower() not in f"{eid} {p.name} {p.tier}".lower():
                continue

        first_play = dm.get_first_play_date(eid) or "-"
        role_txt = "🔧관리자" if getattr(p, "role", "player") == "admin" else "일반"

        rows.append({
            "상태": "✅활동" if p.is_active else "💤휴회",
            "사번": eid,
            "이름": p.name,
            "점수": p.score,
            "티어": f"{config.TIER_ICONS.get(p.tier, '')} {p.tier}",
            "XP": p.xp,
            "출석": p.attendance_count,
            "권한": role_txt,
            "첫 출전": first_play,
        })

    if rows:
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True, hide_index=True, height=min(len(rows) * 40 + 60, 500))
    else:
        st.info("조건에 맞는 선수가 없습니다.")

    # ========== 선수 수정 ==========
    st.markdown("---")
    st.markdown("### 🔧 선수 정보 수정")

    player_options = {f"{p.name} ({eid})": eid for eid, p in dm.players.items()}
    if not player_options:
        return

    selected = st.selectbox("수정할 선수 선택", list(player_options.keys()))
    selected_eid = player_options[selected]
    p = dm.players[selected_eid]

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("#### 기본 정보 수정")
        with st.form("edit_player"):
            edit_name = st.text_input("이름", value=p.name)
            edit_score = st.number_input("점수", value=p.score, min_value=0, max_value=5000)
            edit_active = st.checkbox("활동 상태", value=p.is_active)

            if st.form_submit_button("수정 적용", use_container_width=True):
                dm.update_player_info(
                    selected_eid,
                    new_name=edit_name if edit_name != p.name else None,
                    new_score=edit_score if edit_score != p.score else None,
                    is_active=edit_active,
                )
                st.success("수정 완료!")
                st.rerun()

    with col2:
        st.markdown("#### 위험 작업")

        # 사번 변경
        with st.form("change_id"):
            new_eid = st.text_input("새 사번", placeholder="변경할 사번 입력")
            if st.form_submit_button("사번 변경", use_container_width=True):
                if new_eid and new_eid.strip():
                    if dm.change_emp_id(selected_eid, new_eid.strip()):
                        st.success("사번 변경 완료!")
                        st.rerun()
                    else:
                        st.error("이미 존재하는 사번이거나 잘못된 입력입니다.")

        # 영구 삭제
        st.markdown("")
        if st.button("🗑 영구 삭제", key="delete_player", use_container_width=True, type="secondary"):
            st.session_state["confirm_delete"] = selected_eid

        if st.session_state.get("confirm_delete") == selected_eid:
            st.warning(f"정말 **{p.name}({selected_eid})**를 영구 삭제하시겠습니까?")
            col_a, col_b = st.columns(2)
            with col_a:
                if st.button("⚠️ 삭제 확인", type="primary"):
                    dm.delete_player(selected_eid)
                    st.session_state.pop("confirm_delete", None)
                    st.success("삭제 완료!")
                    st.rerun()
            with col_b:
                if st.button("취소"):
                    st.session_state.pop("confirm_delete", None)
                    st.rerun()
