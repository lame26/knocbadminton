# 환경 설정 가이드 (Cloudflare + Supabase)

Streamlit → Cloudflare + Supabase 웹앱 전환을 위한 단계별 설정 가이드입니다.

---

## 사전 준비

| 항목 | 설치/가입 링크 |
|------|--------------|
| Node.js LTS | https://nodejs.org (LTS 버전 선택) |
| Cloudflare 계정 | https://dash.cloudflare.com (이미 있음) |
| Supabase 계정 | https://supabase.com |

---

## 1단계. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) 로그인 → **New project** 클릭
2. 프로젝트 이름: `knoc-badminton` (원하는 이름)
3. 데이터베이스 비밀번호 설정 (반드시 저장해두세요)
4. 지역: `Northeast Asia (Seoul)` 선택
5. **Create new project** 클릭 → 약 1분 대기

### 1-1. API 키 확인

- 왼쪽 메뉴 → **Project Settings** → **API**
- 아래 3가지 값을 메모장에 복사해두세요:
  - **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
  - **anon / public key**: `eyJ...` (길고 공개용)
  - **service_role / secret key**: `eyJ...` (절대 공개 금지!)

### 1-2. 데이터베이스 테이블 생성

1. 왼쪽 메뉴 → **SQL Editor** → **New query**
2. `supabase_setup.sql` 파일 내용을 전체 복사 후 붙여넣기 → **Run**
3. 성공 메시지 확인 후, `supabase_rls_policies.sql` 파일 내용도 동일하게 실행

### 1-3. 기존 데이터 마이그레이션 (선택)

기존 `data.json`의 선수 데이터를 Supabase로 옮기려면:

```bash
# .env 파일 만들기
echo "SUPABASE_URL=https://xxxx.supabase.co" > .env
echo "SUPABASE_KEY=your-service-role-key" >> .env

# 마이그레이션 실행 (주의: 키 하드코딩 대신 환경변수로 읽도록 수정 필요)
python migrate_to_supabase.py
```

> **보안 주의**: `migrate_to_supabase.py`에 키가 하드코딩되어 있다면 즉시 Supabase에서 키를 재발급받고 코드에서 제거하세요.

---

## 2단계. Cloudflare Workers API 설정

### 2-1. wrangler CLI 설치 및 로그인

```bash
npm install -g wrangler
wrangler login
# 브라우저가 열리면 Cloudflare 계정으로 로그인
```

### 2-2. 패키지 설치

```bash
cd workers
npm install
```

### 2-3. 로컬 환경변수 설정

```bash
# .dev.vars.example 을 .dev.vars 로 복사
cp .dev.vars.example .dev.vars
```

`.dev.vars` 파일을 열어서 실제 값으로 수정:

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
FRONTEND_ORIGINS=http://localhost:5173
```

> `.dev.vars`는 로컬 전용이며 git에 자동으로 제외됩니다.

### 2-4. 로컬 개발 서버 실행

```bash
wrangler dev
# http://localhost:8787 에서 API 실행
# http://localhost:8787/health 로 확인
```

### 2-5. Cloudflare에 배포

```bash
# 프로덕션 환경변수 등록 (한 번만 실행)
wrangler secret put SUPABASE_URL
# 입력 프롬프트에 Supabase URL 붙여넣기

wrangler secret put SUPABASE_SERVICE_KEY
# 입력 프롬프트에 service_role key 붙여넣기

# 배포
wrangler deploy
# 배포 완료 후 https://knoc-badminton-api.your-subdomain.workers.dev 형태의 URL 생성
```

---

## 3단계. Vite + React 프론트엔드 설정

### 3-1. 패키지 설치

```bash
cd frontend
npm install
```

### 3-2. 환경변수 설정 (프로덕션 배포 시)

```bash
cp .env.example .env.local
```

`.env.local` 파일에서 Workers 도메인으로 수정:

```
VITE_API_URL=https://knoc-badminton-api.your-subdomain.workers.dev
```

> 로컬 개발 중에는 이 설정 없어도 됩니다. `vite.config.ts`의 proxy 설정으로 자동 연결됩니다.

### 3-3. 로컬 개발 서버 실행

```bash
npm run dev
# http://localhost:5173 접속
# Workers가 http://localhost:8787 에서 실행 중이어야 합니다
```

### 3-4. Cloudflare Pages에 배포

```bash
# 빌드
npm run build

# Cloudflare Pages에 배포
npx wrangler pages deploy dist --project-name knoc-badminton
# 첫 실행 시 새 Pages 프로젝트 생성 여부 물어봄 → y 입력
```

---

## 4단계. 로컬에서 전체 동작 확인

터미널 창 2개를 열어:

**터미널 1 (Workers API)**:
```bash
cd workers && wrangler dev
```

**터미널 2 (프론트엔드)**:
```bash
cd frontend && npm run dev
```

브라우저에서 `http://localhost:5173` 접속 후:
- 대시보드: 랭킹 목록 표시되는지 확인
- 선수 관리: 선수 목록 표시되는지 확인
- 경기 운영: 오늘 날짜 경기 조회 되는지 확인

---

## 자주 묻는 오류

| 오류 | 해결 방법 |
|------|----------|
| `wrangler: command not found` | `npm install -g wrangler` 재실행, Node.js 재설치 확인 |
| `Error: SUPABASE_URL is not defined` | `.dev.vars` 파일 존재 여부 및 값 확인 |
| CORS 오류 | Workers의 `FRONTEND_ORIGINS` 값에 프론트엔드 URL 포함됐는지 확인 |
| Supabase `row-level security` 오류 | `supabase_rls_policies.sql` 실행했는지 확인, service_role 키 사용하는지 확인 |

---

## 파일 구조 (전환 후)

```
knocbadminton/
├── app.py               ← 기존 Streamlit (병행 운영 중)
├── api_server.py        ← 기존 FastAPI (Workers로 대체 예정)
├── workers/             ← Cloudflare Workers API (신규)
│   ├── src/index.ts
│   ├── wrangler.toml
│   └── package.json
├── frontend/            ← Vite + React SPA (신규)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api/client.ts
│   │   └── pages/
│   ├── vite.config.ts
│   └── package.json
├── supabase_setup.sql
├── supabase_rls_policies.sql  ← 신규 (RLS 보안 정책)
└── SETUP_GUIDE.md       ← 이 파일
```
