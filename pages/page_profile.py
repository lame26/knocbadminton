import streamlit as st
import pandas as pd
import config


def render(dm):
    emp_id = st.session_state.get("emp_id")
    
    if not emp_id or emp_id not in dm.players:
        st.warning("프로필 정보를 찾을 수 없습니다.")
        return

    p = dm.players[emp_id]
    stats = dm.get_player_stats(emp_id)
    match_log = dm.get_player_match_history(emp_id)

    # 프로필 헤더
    tier_icon = config.TIER_ICONS.get(p.tier, "🏸")
    tier_color = config.TIER_COLORS.get(p.tier, "#78909C")

    st.markdown(f"""
    <div style="background: linear-gradient(135deg, {tier_color}CC, {tier_color}99); 
                color: white; padding: 2rem; border-radius: 16px; margin-bottom: 1.5rem;">
        <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div style="font-size: 4rem;">{tier_icon}</div>
            <div>
                <h1 style="color: white; margin: 0;">{p.name}</h1>
                <p style="color: rgba(255,255,255,0.85); margin: 0.3rem 0; font-size: 1.1rem;">
                    {p.tier} · {p.score:,}Pt · {p.xp:,}XP
                </p>
                <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem;">
                    사번: {emp_id} · 가입: {p.join_date}
                </p>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # 핵심 지표 — history에서 직접 계산
    wins, losses = 0, 0
    for matches in dm.history.values():
        for m in matches:
            if m.get("status") != "done":
                continue
            if emp_id in m["team1"] or emp_id in m["team2"]:
                is_t1 = emp_id in m["team1"]
                is_win = (is_t1 and m["score1"] > m["score2"]) or (not is_t1 and m["score2"] > m["score1"])
                if is_win:
                    wins += 1
                else:
                    losses += 1
    total = wins + losses
    win_rate = int(wins / max(total, 1) * 100)

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.markdown(f"""
        <div class="metric-card">
            <h3>{total}</h3>
            <p>🏸 총 경기</p>
        </div>
        """, unsafe_allow_html=True)
    with c2:
        st.markdown(f"""
        <div class="metric-card">
            <h3>{wins}승 {losses}패</h3>
            <p>📊 전적</p>
        </div>
        """, unsafe_allow_html=True)
    with c3:
        st.markdown(f"""
        <div class="metric-card">
            <h3>{win_rate}%</h3>
            <p>🎯 승률</p>
        </div>
        """, unsafe_allow_html=True)
    with c4:
        streak_text = f"🔥 {p.streak}연승" if p.streak >= 2 else f"{p.streak}"
        st.markdown(f"""
        <div class="metric-card">
            <h3>{streak_text}</h3>
            <p>🔥 현재 연승</p>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("")

    # 분석 카드
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown("#### 🤝 베스트 파트너")
        if stats["best_partner"] != "-":
            st.success(f"**{stats['best_partner']}** — {stats['best_partner_rate']}")
        else:
            st.info("아직 데이터가 부족합니다")
    
    with col2:
        st.markdown("#### ⚔️ 천적 (라이벌)")
        if stats["rival"] != "-":
            st.error(f"**{stats['rival']}** — {stats['rival_rate']}")
        else:
            st.info("아직 데이터가 부족합니다")

    st.markdown("")

    # 출석 정보
    col1, col2, col3 = st.columns(3)
    col1.metric("📅 출석 횟수", f"{p.attendance_count}회")
    col2.metric("🔗 연속 출석", f"{p.consecutive_months}개월")
    col3.metric("✨ 활동 포인트", f"{p.xp:,} XP")

    # 승률 시각화
    if total > 0:
        st.markdown("---")
        st.markdown("#### 📈 승률 차트")
        
        import json
        chart_data = pd.DataFrame({
            "구분": ["승리", "패배"],
            "경기수": [wins, losses],
        })
        st.bar_chart(chart_data.set_index("구분"), color=["#1565C0"])

    # 최근 경기 이력
    st.markdown("---")
    st.markdown("#### 📝 최근 경기 이력")
    
    if match_log:
        rows = []
        for log in match_log[:20]:
            result_icon = "🏆" if log["result"] == "승리" else "💔"
            change_text = f"+{log['change']}" if log["change"] > 0 else str(log["change"])
            rows.append({
                "날짜": log["date"],
                "조": log["group"],
                "우리 팀": log["my_team"],
                "점수": f"{log['my_score']} : {log['op_score']}",
                "상대 팀": log["op_team"],
                "결과": f"{result_icon} {log['result']}",
                "변동": change_text,
            })
        
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True, hide_index=True, height=min(len(rows) * 40 + 60, 500))
    else:
        st.info("아직 경기 기록이 없습니다.")
