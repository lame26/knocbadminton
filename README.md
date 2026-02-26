# KNOC 배드민턴 월례대회 관리 시스템

모바일 친화적인 배드민턴 토너먼트 관리 웹 애플리케이션

## 주요 기능

- 실시간 랭킹 시스템 (점수/XP 기반)
- 자동 대진표 생성 (균형/랜덤 매칭)
- 모바일 최적화 UI
- 점수 입력 승인 워크플로우
- 관리자 중재 시스템
- Supabase(Postgres) 데이터베이스
- 자동 백업/복구

## 빠른 시작 (Streamlit 버전)

### 1. 저장소 클론
```bash
git clone https://github.com/YOUR_USERNAME/knocbadminton.git
cd knocbadminton
```

### 2. 패키지 설치
```bash
pip install -r requirements.txt
```

### 3. 환경변수 설정

`.streamlit/secrets.toml` 파일을 생성하고 아래 내용을 입력하세요:

```toml
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_KEY = "your-anon-key"
```

또는 환경변수로 설정:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-anon-key"
```

> Supabase URL과 anon key는 Supabase 대시보드 → Project Settings → API에서 확인할 수 있습니다.

### 4. 실행
```bash
streamlit run app.py
```

### 5. 접속
브라우저에서 `http://localhost:8501` 으로 접속

## 🔐 로그인 정보

### 슈퍼관리자
- **아이디**: `admin`
- **비밀번호**: `admin1234` (첫 로그인 후 변경 권장)

### 선수 로그인
- **아이디**: 선수 이름
- **비밀번호**: 사번

## 📱 모바일 최적화

- 반응형 디자인 (768px, 480px 브레이크포인트)
- 터치 친화적 버튼 (최소 44px)
- 모바일 네비게이션 (날짜 이동 버튼)
- iOS 자동 줌 방지 (16px 입력 필드)

## 📂 프로젝트 구조

```
knocbadminton/
├── app.py              # 메인 앱
├── config.py           # 설정
├── data_manager.py     # 비즈니스 로직
├── database.py         # DB 레이어
├── requirements.txt    # 의존성
├── pages/              # 페이지 모듈
│   ├── page_ranking.py
│   ├── page_bracket.py
│   ├── page_profile.py
│   ├── page_my_matches.py
│   ├── page_manage.py
│   ├── page_tourney.py
│   ├── page_mediate.py
│   ├── page_roles.py
│   └── page_settings.py
└── README.md
```

## 기술 스택 (현재 Streamlit 버전)

- **Frontend**: Streamlit
- **Backend**: Python 3.8+, FastAPI (전환 중)
- **Database**: Supabase (Postgres)
- **Data Processing**: Pandas

## 전환 예정 아키텍처

현재 Streamlit 버전에서 아래 구조로 전환 작업 중입니다:

```
[Cloudflare Pages]  ← Vite + React SPA
        ↓
[Cloudflare Workers]  ← Hono 기반 REST API
        ↓
[Supabase (Postgres)]  ← 데이터 저장 + 인증
```

자세한 전환 계획은 [REPO_ANALYSIS.md](./REPO_ANALYSIS.md) 섹션 8을 참고하세요.

## 📝 라이선스

MIT License

## 👥 기여

이슈와 PR을 환영합니다!

## 📧 문의

문제가 있으시면 이슈를 등록해주세요.
