import streamlit as st
import pandas as pd
import config


def render(dm):
    st.markdown("""
    <div class="main-header">
        <h1>👑 권한 관리</h1>
        <p>선수별 관리자 권한 부여 · 회수</p>
    </div>
    """, unsafe_allow_html=True)

    st.info("💡 관리자 권한을 가진 선수는 대진표 생성, 선수 등록, 경기 중재 등을 할 수 있습니다.")

    # 현재 권한 현황
    admins = [(eid, p) for eid, p in dm.players.items() if getattr(p, "role", "player") == "admin"]
    players = [(eid, p) for eid, p in dm.players.items() if getattr(p, "role", "player") != "admin"]

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("### 🔧 현재 관리자")
        if admins:
            for eid, p in admins:
                c1, c2 = st.columns([3, 1])
                c1.markdown(f"**{p.name}** ({eid})")
                if c2.button("❌ 해제", key=f"revoke_{eid}"):
                    dm.set_player_role(eid, "player")
                    st.success(f"{p.name}의 관리자 권한이 해제되었습니다.")
                    st.rerun()
        else:
            st.info("지정된 관리자가 없습니다.")

    with col2:
        st.markdown("### 👤 일반 선수")
        if players:
            for eid, p in sorted(players, key=lambda x: x[1].name):
                if not p.is_active:
                    continue
                c1, c2 = st.columns([3, 1])
                c1.markdown(f"{p.name} ({eid})")
                if c2.button("🔧 지정", key=f"grant_{eid}"):
                    dm.set_player_role(eid, "admin")
                    st.success(f"{p.name}에게 관리자 권한이 부여되었습니다.")
                    st.rerun()

    # 슈퍼관리자 비밀번호 변경
    st.markdown("---")
    st.markdown("### 🔐 슈퍼관리자 비밀번호 변경")
    
    with st.form("change_pw"):
        new_pw = st.text_input("새 비밀번호", type="password")
        confirm_pw = st.text_input("비밀번호 확인", type="password")
        
        if st.form_submit_button("비밀번호 변경", use_container_width=True):
            if not new_pw or len(new_pw) < 4:
                st.error("비밀번호는 4자 이상이어야 합니다.")
            elif new_pw != confirm_pw:
                st.error("비밀번호가 일치하지 않습니다.")
            else:
                dm.change_super_admin_password(new_pw)
                st.success("비밀번호가 변경되었습니다.")
