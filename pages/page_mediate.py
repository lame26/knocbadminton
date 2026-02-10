import streamlit as st
import config


def render(dm):
    role = st.session_state.get("role")
    admin_id = st.session_state.get("emp_id") or "admin"

    st.markdown("""
    <div class="main-header">
        <h1>⚖️ 경기 중재 · 관리</h1>
        <p>이의제기 처리 · 강제 확정 · 경기 추가/삭제</p>
    </div>
    """, unsafe_allow_html=True)

    if not dm.history:
        st.info("경기 기록이 없습니다.")
        return

    dates = sorted(dm.history.keys(), reverse=True)
    selected_date = st.selectbox("📅 날짜 선택", dates)

    if not selected_date:
        return

    matches = dm.history.get(selected_date, [])

    def get_names(team):
        return ", ".join([dm.players[p].name for p in team if p in dm.players])

    # ========== 1. 이의제기 경기 ==========
    disputed = [(i, m) for i, m in enumerate(matches) if m.get("status") == "disputed"]
    if disputed:
        st.markdown("### 🔴 이의제기 경기")
        for idx, m in disputed:
            t1_names = get_names(m["team1"])
            t2_names = get_names(m["team2"])
            reason = m.get("dispute_reason", "사유 없음")

            with st.expander(f"⚠️ {t1_names} vs {t2_names} — 이의제기", expanded=True):
                st.markdown(f"**사유:** {reason}")

                col1, col2, col3 = st.columns(3)
                with col1:
                    s1 = st.number_input("팀1 점수", min_value=0, max_value=99, value=0, key=f"med_s1_{idx}")
                with col2:
                    st.markdown("<div style='text-align:center; padding-top:2rem; font-weight:bold;'>VS</div>", unsafe_allow_html=True)
                with col3:
                    s2 = st.number_input("팀2 점수", min_value=0, max_value=99, value=0, key=f"med_s2_{idx}")

                col_a, col_b = st.columns(2)
                with col_a:
                    if st.button("✅ 이 점수로 강제 확정", key=f"force_{idx}", use_container_width=True, type="primary"):
                        if s1 == s2:
                            st.error("무승부 불가")
                        elif s1 == 0 and s2 == 0:
                            st.error("점수 입력 필요")
                        else:
                            if dm.admin_force_confirm(selected_date, idx, s1, s2, admin_id):
                                st.success("강제 확정 완료!")
                                st.rerun()
                with col_b:
                    if st.button("🗑 경기 삭제", key=f"del_dis_{idx}", use_container_width=True):
                        dm.delete_match_from_history(selected_date, idx)
                        st.success("삭제 완료!")
                        st.rerun()

    # ========== 2. 승인 대기 경기 ==========
    pending_approval = [(i, m) for i, m in enumerate(matches) if m.get("status") == "pending_approval"]
    if pending_approval:
        st.markdown("### 🟡 승인 대기 경기")
        for idx, m in pending_approval:
            t1_names = get_names(m["team1"])
            t2_names = get_names(m["team2"])
            input_player = dm.players.get(m.get("input_by", ""), None)
            input_name = input_player.name if input_player else "알 수 없음"

            with st.expander(f"⏳ {t1_names} vs {t2_names} (입력: {input_name})"):
                st.markdown(f"입력된 점수: **{m['score1']} : {m['score2']}**")

                col1, col2 = st.columns(2)
                with col1:
                    if st.button("✅ 관리자 승인 (이 점수로 확정)", key=f"admin_approve_{idx}", use_container_width=True, type="primary"):
                        if dm.approve_match(selected_date, idx, admin_id):
                            st.success("확정 완료!")
                            st.rerun()
                with col2:
                    if st.button("🗑 삭제", key=f"del_pa_{idx}", use_container_width=True):
                        dm.delete_match_from_history(selected_date, idx)
                        st.success("삭제!")
                        st.rerun()

    # ========== 3. 전체 경기 관리 ==========
    st.markdown("---")
    st.markdown("### 📋 전체 경기 관리")

    for idx, m in enumerate(matches):
        t1_names = get_names(m["team1"])
        t2_names = get_names(m["team2"])
        status = m.get("status", "pending")
        group = m.get("group", "-")

        status_map = {
            "done": "✅확정",
            "pending": "⚪대기",
            "pending_approval": "🟡승인대기",
            "disputed": "🔴이의제기",
        }
        status_txt = status_map.get(status, status)
        score_txt = f"{m['score1']}:{m['score2']}" if status in ("done", "pending_approval") else "-:-"

        with st.expander(f"[{group}조] {t1_names} {score_txt} {t2_names} — {status_txt}"):
            col1, col2, col3 = st.columns(3)
            with col1:
                new_s1 = st.number_input("팀1", min_value=0, value=m["score1"], key=f"all_s1_{idx}")
            with col2:
                st.markdown("")
            with col3:
                new_s2 = st.number_input("팀2", min_value=0, value=m["score2"], key=f"all_s2_{idx}")

            col_a, col_b, col_c = st.columns(3)
            with col_a:
                if st.button("💾 저장/수정", key=f"save_{idx}", use_container_width=True, type="primary"):
                    if new_s1 == new_s2:
                        st.error("무승부 불가")
                    else:
                        dm.admin_force_confirm(selected_date, idx, new_s1, new_s2, admin_id)
                        st.success("저장 완료!")
                        st.rerun()
            with col_b:
                if st.button("↩️ 초기화", key=f"reset_{idx}", use_container_width=True):
                    if status == "done":
                        dm.delete_match_from_history(selected_date, idx, keep_match=True)
                        st.success("초기화 완료!")
                        st.rerun()
            with col_c:
                if st.button("🗑 삭제", key=f"delete_{idx}", use_container_width=True):
                    dm.delete_match_from_history(selected_date, idx, keep_match=False)
                    st.success("삭제 완료!")
                    st.rerun()

    # ========== 4. 수동 경기 추가 ==========
    st.markdown("---")
    st.markdown("### ➕ 수동 경기 추가")

    active_options = {f"{p.name} ({eid})": eid for eid, p in dm.players.items() if p.is_active}
    option_list = list(active_options.keys())

    if len(option_list) < 4:
        st.info("활동 선수가 4명 미만이라 추가할 수 없습니다.")
        return

    with st.form("manual_match"):
        group = st.text_input("조 이름", value="번외")
        col1, col2 = st.columns(2)
        with col1:
            st.markdown("**팀1**")
            p1 = st.selectbox("선수1", option_list, key="manual_p1")
            p2 = st.selectbox("선수2", option_list, key="manual_p2")
        with col2:
            st.markdown("**팀2**")
            p3 = st.selectbox("선수3", option_list, key="manual_p3")
            p4 = st.selectbox("선수4", option_list, key="manual_p4")

        if st.form_submit_button("경기 추가", use_container_width=True, type="primary"):
            ids = [active_options[p1], active_options[p2], active_options[p3], active_options[p4]]
            if len(set(ids)) != 4:
                st.error("선수 4명을 중복 없이 선택해주세요.")
            else:
                if selected_date not in dm.history:
                    dm.history[selected_date] = []
                dm.history[selected_date].append({
                    "team1": ids[:2], "score1": 0, "change1": 0,
                    "team2": ids[2:], "score2": 0, "change2": 0,
                    "group": group.strip() or "번외", "status": "pending",
                })
                dm.save_data()
                st.success("경기 추가 완료!")
                st.rerun()
