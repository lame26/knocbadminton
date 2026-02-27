# KNOC Badminton Club - Operations System

이 저장소는 KNOC 배드민턴 클럽 월간 리그 운영 시스템의 기준 버전입니다.

## 핵심 개요
- 운영 단위: 월(`YYYY-MM`)
- 스택: React + Vite + TypeScript, Cloudflare Workers(Hono), Supabase(Postgres)
- 운영 목표: 경기 생성/운영/기록/집계/공지/출력까지 웹에서 일원화

## 주요 기능
- 인증/권한
  - 로그인/로그아웃/JWT
  - 최초 로그인 시 비밀번호 변경 강제
  - 회원가입 요청 + 관리자 승인/거부
- 선수/회원 관리
  - 사용자 정보 수정(이름/사번/권한/활성)
  - 비밀번호 초기화
  - 비활성화 및 조건부 하드 삭제
- 경기 운영
  - 월별 대진 생성
  - 경기 점수 제출/승인/거부
  - 경기 수동 생성/수정/삭제
  - 경기 취소(`cancelled`) 처리
- 통계/정산
  - 월별 요약, 선수별 전적/출석/폼
  - 점수/XP 재계산(드라이런/적용)
  - 월 마감/해제(마감 월 데이터 변경 제한)
- 출력/공지
  - 대진표 A3 가로 출력
  - 경기결과 요약 출력(현장 공지/밴드 공유용)
- 감사 로그
  - 주요 변경 API 호출 이력 조회

## 디렉토리
```text
knocbadminton/
├─ frontend/                  # React 앱
│  └─ src/
│     ├─ api/client.ts
│     ├─ contexts/AuthContext.tsx
│     └─ pages/
├─ workers/                   # Cloudflare Workers API
│  └─ src/index.ts
├─ scripts/
│  └─ utf8_guard.ps1          # PowerShell UTF-8 가드
├─ sql/
│  └─ audit_logs.sql
├─ data.json                  # 기준 데이터(백업/복원 소스)
├─ restore_from_data_json.py  # data.json -> Supabase 복원 유틸
└─ AI_HANDOFF_HISTORY.md      # 세션 인계 필수 문서
```

## 로컬 실행
### 1) API(Workers)
```bash
cd workers
npm install
npm run dev
```

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```

## 환경변수
### workers/.dev.vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (또는 `SUPABASE_KEY`)
- `JWT_SECRET`
- `FRONTEND_ORIGINS` (선택)

### frontend/.env.local
- `VITE_API_URL` (미설정 시 `/api` 폴백)

## data.json 복원
드라이런:
```bash
python restore_from_data_json.py --up-to-month 2026-01
```

실적용:
```bash
python restore_from_data_json.py --apply --truncate --up-to-month 2026-01
```

권장 후속 작업:
- 시스템 설정 화면에서 점수/XP 재계산 실행

## 인코딩 정책(중요)
한글 깨짐 방지를 위해 PowerShell 세션 시작 시 실행:

```powershell
.\scripts\utf8_guard.ps1
```

저장소 보호 설정:
- `.editorconfig`: UTF-8 + LF 강제
- `.gitattributes`: 텍스트 파일 UTF-8 working-tree-encoding 지정

## 운영 규칙
- 코드/설정/동작 변경 시 `AI_HANDOFF_HISTORY.md`를 같은 작업에서 반드시 업데이트
- 새 AI/새 채팅 세션은 `AI_HANDOFF_HISTORY.md`를 먼저 읽고 작업 시작
