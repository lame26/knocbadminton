import streamlit as st
import config


def render(dm):
    st.markdown("""
    <div class="main-header">
        <h1>⚙️ 시스템 설정</h1>
        <p>게임 규칙 · 데이터 교정 · 백업 복구</p>
    </div>
    """, unsafe_allow_html=True)

    tab1, tab2, tab3 = st.tabs(["🏸 게임 규칙", "🔧 데이터 관리", "💾 백업/복구"])

    # ========== TAB 1: 게임 규칙 ==========
    with tab1:
        col1, col2 = st.columns(2)

        with col1:
            st.markdown("#### 🏆 등급 승급 기준 (점수)")
            tier_values = {}
            sorted_tiers = sorted(dm.tier_rules.items(), key=lambda x: x[1], reverse=True)
            for tier_name, threshold in sorted_tiers:
                icon = config.TIER_ICONS.get(tier_name, "")
                tier_values[tier_name] = st.number_input(
                    f"{icon} {tier_name}",
                    value=threshold,
                    min_value=0,
                    max_value=5000,
                    step=50,
                    key=f"tier_{tier_name}",
                )

        with col2:
            st.markdown("#### 🏸 경기 점수 부여 규칙")
            score_labels = {
                "win": "승리 기본 점수",
                "loss": "패배 기본 점수",
                "underdog": "언더독 보너스",
                "big_win": "대승 보너스",
                "big_diff": "대승 기준 점수차",
                "target_games": "목표 게임 수",
            }
            score_values = {}
            for key, label in score_labels.items():
                if key in dm.score_rules:
                    score_values[key] = st.number_input(
                        label,
                        value=dm.score_rules[key],
                        min_value=-100,
                        max_value=500,
                        step=1,
                        key=f"score_{key}",
                    )

        st.markdown("")
        if st.button("💾 규칙 저장 및 적용", use_container_width=True, type="primary"):
            new_tier_rules = tier_values
            new_score_rules = dm.score_rules.copy()
            new_score_rules.update(score_values)

            dm.update_rules(new_score_rules, new_tier_rules)
            st.success("규칙이 저장되고 모든 선수의 등급이 재산정되었습니다!")

    # ========== TAB 2: 데이터 관리 ==========
    with tab2:
        st.markdown("#### 🔄 XP 전체 재계산")
        st.caption("XP 기록이 꼬였거나 규칙 변경 시 재계산합니다. 모든 선수의 XP를 초기화 후 재계산합니다.")
        
        if st.button("🔄 XP 전체 재계산 실행", use_container_width=True):
            success, msg = dm.recalculate_all_xp()
            if success:
                st.success(msg)
            else:
                st.error(f"오류: {msg}")

        st.markdown("---")
        st.markdown("#### 🗑 데이터 초기화 (주의!)")
        st.error("⚠️ 이 작업은 모든 선수와 경기 기록을 삭제합니다. 복구할 수 없습니다.")

        confirm_text = st.text_input("삭제하려면 '초기화'를 입력하세요", placeholder="초기화")
        if st.button("🚨 전체 데이터 삭제 (Factory Reset)", type="secondary", use_container_width=True):
            if confirm_text == "초기화":
                dm.create_backup()  # 마지막 백업
                dm.players = {}
                dm.history = {}
                dm.save_data()
                st.success("시스템이 초기화되었습니다.")
                st.rerun()
            else:
                st.warning("'초기화'를 정확히 입력해주세요.")

    # ========== TAB 3: 백업/복구 ==========
    with tab3:
        st.markdown("#### 💾 수동 백업 생성")
        if st.button("📦 지금 백업 생성", use_container_width=True):
            dm.create_backup()
            st.success("백업이 생성되었습니다!")

        st.markdown("---")
        st.markdown("#### ♻️ 백업 복구")
        st.caption("과거 시점의 데이터로 되돌립니다. 현재 데이터는 사라집니다.")

        backups = dm.get_backup_list()
        if backups:
            selected_backup = st.selectbox("복구할 백업 선택", backups)
            
            if st.button("⏪ 이 시점으로 복원", use_container_width=True, type="secondary"):
                if dm.restore_backup(selected_backup):
                    st.success("데이터가 복구되었습니다! 페이지를 새로고침합니다.")
                    # 데이터 매니저 리로드
                    if "dm" in st.session_state:
                        del st.session_state["dm"]
                    st.rerun()
                else:
                    st.error("백업 파일을 찾을 수 없습니다.")
        else:
            st.info("저장된 백업이 없습니다.")
