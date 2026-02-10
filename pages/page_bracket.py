import streamlit as st
import pandas as pd
import config


def render(dm):
    st.markdown("""
    <div class="main-header">
        <h1>📋 대진표 조회</h1>
        <p>날짜별 경기 일정 · 조별 대진 · 결과 확인</p>
    </div>
    """, unsafe_allow_html=True)

    if not dm.history:
        st.info("아직 생성된 대진표가 없습니다.")
        return

    # 날짜 선택 (모바일 친화적 네비게이션)
    dates = sorted(dm.history.keys(), reverse=True)
    
    # 현재 선택된 날짜 인덱스
    if "selected_date_idx" not in st.session_state:
        st.session_state.selected_date_idx = 0
    
    col1, col2, col3, col4 = st.columns([1, 3, 1, 1])
    with col1:
        if st.button("◀", width="stretch", disabled=st.session_state.selected_date_idx >= len(dates) - 1):
            st.session_state.selected_date_idx += 1
            st.rerun()
    with col2:
        selected_date = st.selectbox(
            "📅 대회 날짜 선택",
            dates,
            index=st.session_state.selected_date_idx,
            label_visibility="collapsed"
        )
        # 드롭다운 변경 시 인덱스 업데이트
        st.session_state.selected_date_idx = dates.index(selected_date)
    with col3:
        if st.button("▶", width="stretch", disabled=st.session_state.selected_date_idx <= 0):
            st.session_state.selected_date_idx -= 1
            st.rerun()
    with col4:
        if st.button("📊 결산", width="stretch"):
            st.session_state["show_summary"] = True

    if not selected_date:
        return

    matches = dm.history.get(selected_date, [])
    
    # 경기 통계 카드
    total = len(matches)
    done = sum(1 for m in matches if m.get("status") == "done")
    pending = sum(1 for m in matches if m.get("status") in ("pending", None))
    pending_approval = sum(1 for m in matches if m.get("status") == "pending_approval")
    disputed = sum(1 for m in matches if m.get("status") == "disputed")
    
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("전체 경기", f"{total}경기")
    c2.metric("✅ 확정", f"{done}경기")
    c3.metric("⏳ 대기", f"{pending + pending_approval}경기")
    c4.metric("⚠️ 이의제기", f"{disputed}경기")

    # 조별 그룹핑
    groups = {}
    for i, m in enumerate(matches):
        g = m.get("group", "기타")
        if g not in groups:
            groups[g] = []
        groups[g].append((i, m))

    my_eid = st.session_state.get("emp_id")

    for group_name in sorted(groups.keys()):
        st.markdown(f"### 🏟️ {group_name}조")
        
        group_matches = groups[group_name]
        
        for match_idx, m in group_matches:
            # 선수 이름 가져오기
            try:
                t1_names = ", ".join([dm.players[p].name for p in m["team1"] if p in dm.players])
                t2_names = ", ".join([dm.players[p].name for p in m["team2"] if p in dm.players])
            except:
                t1_names, t2_names = "Unknown", "Unknown"

            # 상태 뱃지
            status = m.get("status", "pending")
            if status == "done":
                status_badge = '<span class="status-done">✅ 확정</span>'
                score_text = f"<b>{m['score1']}</b> : <b>{m['score2']}</b>"
            elif status == "pending_approval":
                input_name = ""
                if m.get("input_by") and m["input_by"] in dm.players:
                    input_name = dm.players[m["input_by"]].name
                status_badge = f'<span class="status-pending">🟡 승인대기 ({input_name})</span>'
                score_text = f"<b>{m['score1']}</b> : <b>{m['score2']}</b> <i style='font-size: 0.8rem;'>(미확정)</i>"
            elif status == "disputed":
                status_badge = '<span class="status-disputed">🔴 이의제기</span>'
                score_text = "— : —"
            else:
                status_badge = '<span class="status-waiting">⚪ 대기중</span>'
                score_text = "— : —"

            # 내 경기 하이라이트
            is_my_match = my_eid and (my_eid in m.get("team1", []) or my_eid in m.get("team2", []))
            highlight = "border-left: 4px solid #1565C0; background: #E3F2FD; color: #263238;" if is_my_match else "border-left: 4px solid #E0E0E0;"

            # 승리팀 강조
            if status == "done":
                if m["score1"] > m["score2"]:
                    t1_style = "color: #1565C0; font-weight: bold;"
                    t2_style = "color: #90A4AE;"
                else:
                    t1_style = "color: #90A4AE;"
                    t2_style = "color: #1565C0; font-weight: bold;"
            else:
                t1_style = t2_style = ""

            # 변동 표시
            change_text = ""
            if status == "done":
                c1_val = m.get("change1", 0)
                c2_val = m.get("change2", 0)
                if m["score1"] > m["score2"]:
                    change_text = f"(+{c1_val}) vs (+{c2_val})"
                else:
                    change_text = f"(+{c1_val}) vs (+{c2_val})"

            st.markdown(f"""
            <div style="{highlight} padding: 0.8rem 1rem; margin: 0.3rem 0; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <span style="{t1_style}">{t1_names}</span>
                        &nbsp;&nbsp;{score_text}&nbsp;&nbsp;
                        <span style="{t2_style}">{t2_names}</span>
                        <span style="color: #78909C; font-size: 0.8rem; margin-left: 8px;">{change_text}</span>
                    </div>
                    <div>{status_badge}</div>
                </div>
            </div>
            """, unsafe_allow_html=True)

    # 당일 결산 팝업
    if st.session_state.get("show_summary"):
        st.markdown("---")
        st.markdown(f"### 📊 [{selected_date}] 당일 결산")
        
        summary = dm.get_daily_summary(selected_date)
        if summary:
            sorted_stats = sorted(summary.items(), key=lambda x: (x[1]["c"], x[1]["w"]), reverse=True)
            
            rows = []
            for i, (eid, d) in enumerate(sorted_stats, 1):
                score_txt = f"+{d['c']}" if d["c"] > 0 else str(d["c"])
                rows.append({
                    "순위": i,
                    "이름": d["name"],
                    "전적": f"{d['g']}전 {d['w']}승 {d['l']}패",
                    "획득 점수": score_txt,
                })
            
            df = pd.DataFrame(rows)
            
            def color_score(val):
                if val.startswith("+"):
                    return "color: #1565C0; font-weight: bold;"
                elif val.startswith("-"):
                    return "color: #F44336;"
                return ""
            
            styled = df.style.map(color_score, subset=["획득 점수"])
            st.dataframe(styled, use_container_width=True, hide_index=True)
        else:
            st.info("완료된 경기가 없습니다.")
        
        if st.button("닫기"):
            st.session_state["show_summary"] = False
            st.rerun()
