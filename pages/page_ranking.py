import streamlit as st
import pandas as pd
import config


def render(dm):
    st.markdown("""
    <div class="main-header">
        <h1>🏆 KNOC 배드민턴 명예의 전당</h1>
        <p>실시간 랭킹 · 점수 & 활동 포인트</p>
    </div>
    """, unsafe_allow_html=True)

    # 정렬 모드 토글
    col1, col2, col3 = st.columns([1, 1, 1])
    with col1:
        st.markdown("")
    with col2:
        sort_mode = st.selectbox("정렬 기준", ["실력(Pt)", "활동(XP)"], label_visibility="collapsed")
    with col3:
        show_inactive = st.checkbox("휴회 선수 포함", value=False)

    # 통계 카드
    active_count = sum(1 for p in dm.players.values() if p.is_active)
    total_matches = sum(len(matches) for matches in dm.history.values())
    avg_score = 0
    if dm.players:
        active_scores = [p.score for p in dm.players.values() if p.is_active]
        avg_score = int(sum(active_scores) / max(len(active_scores), 1))

    # 모바일: 2x2 그리드, 데스크톱: 1x4
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.markdown(f"""
        <div class="metric-card">
            <h3>{active_count}</h3>
            <p>👥 활동 선수</p>
        </div>
        """, unsafe_allow_html=True)
    with c2:
        st.markdown(f"""
        <div class="metric-card">
            <h3>{len(dm.players)}</h3>
            <p>📋 전체 등록</p>
        </div>
        """, unsafe_allow_html=True)
    with c3:
        st.markdown(f"""
        <div class="metric-card">
            <h3>{total_matches}</h3>
            <p>🏸 총 경기 수</p>
        </div>
        """, unsafe_allow_html=True)
    with c4:
        st.markdown(f"""
        <div class="metric-card">
            <h3>{avg_score:,}</h3>
            <p>📊 평균 점수</p>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("")

    # 랭킹 데이터 생성
    changes = dm.get_rank_changes()
    
    # 전체 매치에서 통산 전적 계산
    all_matches = []
    for d in dm.history:
        for m in dm.history[d]:
            if m["status"] == "done":
                all_matches.append(m)

    player_stats = {}
    for eid in dm.players:
        wins, losses = 0, 0
        for m in all_matches:
            if eid in m["team1"] or eid in m["team2"]:
                is_t1 = eid in m["team1"]
                is_win = (is_t1 and m["score1"] > m["score2"]) or (not is_t1 and m["score2"] > m["score1"])
                if is_win:
                    wins += 1
                else:
                    losses += 1
        rate = int(wins / max(wins + losses, 1) * 100)
        player_stats[eid] = {"wins": wins, "losses": losses, "rate": rate}

    # 최근 대회 성적 계산
    last_perf_stats = {}
    remaining = set(dm.players.keys())
    for d in sorted(dm.history.keys(), reverse=True):
        if not remaining:
            break
        daily_stats = {}
        for m in dm.history[d]:
            if m["status"] != "done":
                continue
            win_t1 = m["score1"] > m["score2"]
            for pid in m["team1"] + m["team2"]:
                if pid not in remaining:
                    continue
                if pid not in daily_stats:
                    daily_stats[pid] = {"score": 0, "w": 0, "l": 0}
                is_t1 = pid in m["team1"]
                change = m.get("change1", 0) if is_t1 else m.get("change2", 0)
                daily_stats[pid]["score"] += change
                is_win = (is_t1 and win_t1) or (not is_t1 and not win_t1)
                if is_win:
                    daily_stats[pid]["w"] += 1
                else:
                    daily_stats[pid]["l"] += 1
        for pid, s in daily_stats.items():
            sign = "+" if s["score"] > 0 else ""
            last_perf_stats[pid] = f"{sign}{s['score']} ({s['w']}승 {s['l']}패)"
            remaining.discard(pid)

    # 정렬
    if "XP" in sort_mode:
        sorted_players = sorted(dm.players.items(), key=lambda x: x[1].xp, reverse=True)
    else:
        sorted_players = sorted(dm.players.items(), key=lambda x: x[1].score, reverse=True)

    # 테이블 생성
    rows = []
    rank_idx = 1
    for eid, p in sorted_players:
        if not show_inactive and not p.is_active:
            continue
        
        stat = player_stats.get(eid, {"wins": 0, "losses": 0, "rate": 0})
        ch = changes.get(eid, {"rank_ch": 0})
        r_val = ch["rank_ch"]
        
        if r_val > 0:
            r_ch_txt = f"🔺{r_val}"
        elif r_val < 0:
            r_ch_txt = f"🔻{abs(r_val)}"
        else:
            r_ch_txt = "—"

        tier_icon = config.TIER_ICONS.get(p.tier, "")
        last_perf = last_perf_stats.get(eid, "—")
        
        status = "✅" if p.is_active else "💤"

        rows.append({
            "순위": rank_idx,
            "변동": r_ch_txt,
            "상태": status,
            "티어": f"{tier_icon} {p.tier}",
            "이름": p.name,
            "실력(Pt)": f"{p.score:,}",
            "활동(XP)": f"{p.xp:,}",
            "통산 전적": f"{stat['wins']}승 {stat['losses']}패 ({stat['rate']}%)",
            "최근 대회": last_perf,
            "연승": f"🔥{p.streak}" if p.streak >= 2 else str(p.streak),
        })
        rank_idx += 1

    if rows:
        df = pd.DataFrame(rows)
        
        # 순위별 하이라이트 스타일
        def highlight_rank(row):
            rank = row["순위"]
            if rank == 1:
                return ["background-color: #FFF9C4; color: #263238; font-weight: bold;"] * len(row)
            elif rank == 2:
                return ["background-color: #F5F5F5; color: #263238; font-weight: bold;"] * len(row)
            elif rank == 3:
                return ["background-color: #FFCCBC; color: #263238; font-weight: bold;"] * len(row)
            return [""] * len(row)
        
        styled = df.style.apply(highlight_rank, axis=1).set_properties(**{
            "text-align": "center",
            "font-size": "14px",
        })
        
        st.dataframe(
            styled,
            use_container_width=True,
            hide_index=True,
            height=min(len(rows) * 40 + 60, 700),
        )
    else:
        st.info("등록된 선수가 없습니다.")

    # 가이드 (접기)
    with st.expander("📖 점수 규칙 안내"):
        r = dm.score_rules
        st.markdown(f"""
        | 항목 | 점수 |
        |------|------|
        | 승리 기본 | +{r.get('win', 20)}점 |
        | 패배 | {r.get('loss', 0)}점 |
        | 대승 보너스 ({r.get('big_diff', 10)}점차 이상) | +{r.get('big_win', 5)}점 |
        | 언더독 보너스 (100점차 약팀 승리) | +{r.get('underdog', 15)}점 |
        """)
        
        st.markdown("**🏆 등급 기준**")
        for tier_name, threshold in sorted(dm.tier_rules.items(), key=lambda x: x[1], reverse=True):
            icon = config.TIER_ICONS.get(tier_name, "")
            st.markdown(f"- {icon} **{tier_name}**: {threshold:,}점 이상")
