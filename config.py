import os
import hashlib

# =========================================================
# ⚙️ KNOC 배드민턴 웹 시스템 설정
# =========================================================

BASE_PATH = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_PATH, "data.json")
BACKUP_DIR = os.path.join(BASE_PATH, "backups")

# 앱 정보
APP_TITLE = "KNOC 배드민턴 월례대회 관리 시스템"
APP_VERSION = "3.0 Web"
APP_ICON = "🏸"

# 색상 팔레트
COLOR_PRIMARY = "#1565C0"
COLOR_SECONDARY = "#263238"
COLOR_SUCCESS = "#4CAF50"
COLOR_WARNING = "#FF9800"
COLOR_DANGER = "#F44336"
COLOR_BG_LIGHT = "#F5F5F5"

# 티어 색상 매핑
TIER_COLORS = {
    "챌린저": "#FF6F00",
    "다이아몬드": "#00BCD4",
    "플래티넘": "#78909C",
    "골드": "#FFC107",
    "실버": "#90A4AE",
    "브론즈": "#8D6E63",
}

TIER_ICONS = {
    "챌린저": "👑",
    "다이아몬드": "💎",
    "플래티넘": "⚡",
    "골드": "🥇",
    "실버": "🥈",
    "브론즈": "🥉",
}

# 게임 규칙 기본값
TIER_RULES = {
    "챌린저": 1650,
    "다이아몬드": 1550,
    "플래티넘": 1450,
    "골드": 1350,
    "실버": 1200,
    "브론즈": 0,
}

SCORE_RULES = {
    "win": 20,
    "loss": 0,
    "underdog": 15,
    "big_win": 5,
    "big_diff": 10,
    "target_games": 4,
}

# 슈퍼관리자 기본 설정
DEFAULT_SUPER_ADMIN = {
    "username": "admin",
    "password_hash": hashlib.sha256("admin1234".encode()).hexdigest(),
}

# 승인 시스템 설정
APPROVAL_TIMEOUT_HOURS = 24
