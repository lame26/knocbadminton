import streamlit as st
import config


def render(dm):
    emp_id = st.session_state.get("emp_id")

    st.markdown("""
    <div class="main-header">
        <h1>🎯 내 경기 입력</h1>
        <p>점수 입력 · 상대팀 승인 · 이의제기</p>
    </div>
    """, unsafe_allow_html=True)

    if not emp_id:
        st.warning("로그인 정보가 없습니다.")
        return

    if not dm.history:
        st.info("아직 대진표가 없습니다.")
        return

    # 날짜 선택
    dates = sorted(dm.history.keys(), reverse=True)
    selected_date = st.selectbox("📅 날짜 선택", dates)

    if not selected_date:
        return

    matches = dm.history.get(selected_date, [])

    # 내 경기만 필터
    my_matches = []
    for i, m in enumerate(matches):
        if emp_id in m.get("team1", []) or emp_id in m.get("team2", []):
            my_matches.append((i, m))

    if not my_matches:
        st.info("이 날짜에 배정된 경기가 없습니다.")
        return

    # 상태별 분류
    needs_input = []
    needs_approval = []
    my_pending = []
    completed = []
    disputed = []

    for idx, m in my_matches:
        status = m.get("status", "pending")
        if status == "pending":
            needs_input.append((idx, m))
        elif status == "pending_approval":
            if m.get("input_by") == emp_id:
                my_pending.append((idx, m))
            else:
                needs_approval.append((idx, m))
        elif status == "done":
            completed.append((idx, m))
        elif status == "disputed":
            disputed.append((idx, m))

    def get_names(team):
        return ", ".join([dm.players[p].name for p in team if p in dm.players])

    # ========== 1. 승인 대기 (내가 승인해야 할 경기) ==========
    if needs_approval:
        st.markdown("### 🔔 승인 요청")
        st.caption("상대팀이 점수를 입력했습니다. 확인 후 승인하거나 이의제기 해주세요.")

        for idx, m in needs_approval:
            t1_names = get_names(m["team1"])
            t2_names = get_names(m["team2"])
            input_player = dm.players.get(m.get("input_by", ""), None)
            input_name = input_player.name if input_player else "알 수 없음"

            with st.container():
                st.markdown(f"""
                <div style="background: #FFF3E0; padding: 1rem; border-radius: 10px; border-left: 4px solid #FF9800; margin-bottom: 0.5rem;">
                    <strong>{t1_names}</strong> vs <strong>{t2_names}</strong><br>
                    입력된 점수: <strong>{m['score1']} : {m['score2']}</strong> (입력자: {input_name})
                </div>
                """, unsafe_allow_html=True)

                col1, col2 = st.columns(2)
                with col1:
                    if st.button("✅ 승인", key=f"approve_{idx}", use_container_width=True, type="primary"):
                        if dm.approve_match(selected_date, idx, emp_id):
                            st.success("승인 완료! 랭킹에 반영되었습니다.")
                            st.rerun()
                        else:
                            st.error("승인 처리 중 오류가 발생했습니다.")
                with col2:
                    reason = st.text_input("이의 사유", key=f"reason_{idx}", placeholder="선택사항")
                    if st.button("⚠️ 이의제기", key=f"dispute_{idx}", use_container_width=True):
                        if dm.reject_match(selected_date, idx, reason):
                            st.warning("이의제기가 접수되었습니다. 관리자가 확인합니다.")
                            st.rerun()

                st.markdown("---")

    # ========== 2. 점수 입력 가능 ==========
    if needs_input:
        st.markdown("### ✏️ 점수 입력")
        st.caption("경기 결과를 입력하면 상대팀에게 승인 요청이 전송됩니다.")

        for idx, m in needs_input:
            t1_names = get_names(m["team1"])
            t2_names = get_names(m["team2"])
            group = m.get("group", "-")

            with st.expander(f"🏟️ {group}조 | {t1_names} vs {t2_names}", expanded=True):
                col1, col2, col3 = st.columns([2, 1, 2])
                with col1:
                    st.markdown(f"**🔵 {t1_names}**")
                    s1 = st.number_input("팀1 점수", min_value=0, max_value=99, value=0, key=f"s1_{idx}")
                with col2:
                    st.markdown(
                        "<div style='text-align:center; padding-top: 2rem; font-size: 1.5rem; font-weight: bold; color: #90A4AE;'>VS</div>",
                        unsafe_allow_html=True,
                    )
                with col3:
                    st.markdown(f"**🔴 {t2_names}**")
                    s2 = st.number_input("팀2 점수", min_value=0, max_value=99, value=0, key=f"s2_{idx}")

                if st.button("📤 점수 제출", key=f"submit_{idx}", use_container_width=True, type="primary"):
                    if s1 == s2:
                        st.error("무승부는 처리할 수 없습니다.")
                    elif s1 == 0 and s2 == 0:
                        st.error("점수를 입력해주세요.")
                    else:
                        other_team = m["team2"] if emp_id in m["team1"] else m["team1"]
                        has_opponent = any(pid in dm.players for pid in other_team)

                        if has_opponent:
                            if dm.submit_score_for_approval(selected_date, idx, s1, s2, emp_id):
                                st.success("점수가 제출되었습니다! 상대팀의 승인을 기다립니다.")
                                st.rerun()
                        else:
                            if dm.update_match_result(selected_date, idx, s1, s2, input_by=emp_id):
                                st.success("점수가 확정되었습니다!")
                                st.rerun()

    # ========== 3. 내가 입력, 승인 대기 중 ==========
    if my_pending:
        st.markdown("### ⏳ 승인 대기 중")
        st.caption("상대팀의 승인을 기다리고 있습니다.")

        for idx, m in my_pending:
            t1_names = get_names(m["team1"])
            t2_names = get_names(m["team2"])
            st.markdown(f"""
            <div style="background: #E8EAF6; padding: 0.8rem 1rem; border-radius: 8px; border-left: 4px solid #3F51B5; margin-bottom: 0.5rem;">
                {t1_names} <strong>{m['score1']} : {m['score2']}</strong> {t2_names}
                &nbsp;&nbsp;<span class="status-pending">⏳ 승인 대기</span>
            </div>
            """, unsafe_allow_html=True)

    # ========== 4. 확정된 경기 ==========
    if completed:
        st.markdown("### ✅ 확정된 경기")

        for idx, m in completed:
            t1_names = get_names(m["team1"])
            t2_names = get_names(m["team2"])

            is_t1 = emp_id in m["team1"]
            my_won = (is_t1 and m["score1"] > m["score2"]) or (not is_t1 and m["score2"] > m["score1"])
            change = m.get("change1", 0) if is_t1 else m.get("change2", 0)

            result_icon = "🏆" if my_won else "💔"
            change_txt = f"+{change}" if change > 0 else str(change)
            bg_color = "#E8F5E9" if my_won else "#FFEBEE"

            st.markdown(f"""
            <div style="background: {bg_color}; padding: 0.8rem 1rem; border-radius: 8px; margin-bottom: 0.3rem;">
                {result_icon} {t1_names} <strong>{m['score1']} : {m['score2']}</strong> {t2_names}
                &nbsp;&nbsp;(점수 변동: <strong>{change_txt}</strong>)
            </div>
            """, unsafe_allow_html=True)

    # ========== 5. 이의제기 경기 ==========
    if disputed:
        st.markdown("### ⚠️ 이의제기 경기")
        for idx, m in disputed:
            t1_names = get_names(m["team1"])
            t2_names = get_names(m["team2"])
            reason = m.get("dispute_reason", "사유 없음")
            st.markdown(f"""
            <div style="background: #FBE9E7; padding: 0.8rem 1rem; border-radius: 8px; border-left: 4px solid #F44336; margin-bottom: 0.3rem;">
                ⚠️ {t1_names} vs {t2_names} — 관리자 중재 대기 중<br>
                <span style="color: #78909C; font-size: 0.85rem;">사유: {reason}</span>
            </div>
            """, unsafe_allow_html=True)
