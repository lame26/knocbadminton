# 환경 설정 가이드 (Cloudflare Workers + Supabase)

이 문서는 KNOC 배드민턴 클럽 시스템을 로컬/배포 환경에서 실행하기 위한 최신 설정 절차입니다.

## 1) 사전 준비
- Node.js LTS 설치
- Supabase 프로젝트 준비
- Cloudflare 계정 및 Wrangler CLI 사용 가능 상태

## 2) Supabase 준비
1. Supabase 프로젝트 생성
2. 프로젝트 URL, Service Role Key 확인
3. 필요 SQL 실행
- 기본 스키마/테이블
- 감사 로그 테이블: `sql/audit_logs.sql`

## 3) Workers(API) 로컬 실행
```bash
cd workers
npm install
```

`workers/.dev.vars` 생성:
```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
JWT_SECRET=<your-jwt-secret>
FRONTEND_ORIGINS=http://localhost:5173
```

실행:
```bash
npm run dev
```

헬스체크:
- `http://localhost:8787/health`

## 4) Frontend 로컬 실행
```bash
cd frontend
npm install
```

`frontend/.env.local` 생성:
```env
VITE_API_URL=http://localhost:8787
```

실행:
```bash
npm run dev
```

접속:
- `http://localhost:5173`

## 5) 검증 명령
```bash
cd workers && npm run typecheck
cd frontend && npm run build
```

## 6) data.json 복원(선택)
드라이런:
```bash
python restore_from_data_json.py --up-to-month 2026-01
```

실적용:
```bash
python restore_from_data_json.py --apply --truncate --up-to-month 2026-01
```

## 7) 인코딩 안전 수칙(필수)
PowerShell 세션 시작 후 실행:
```powershell
.\scripts\utf8_guard.ps1
```

목적:
- 한글 문자열 파이프라인 깨짐 방지
- Python/PowerShell UTF-8 강제

## 8) 운영 체크리스트
- 월 마감 여부 확인 후 데이터 수정
- 점수/XP 재계산은 관리자에서 필요 시 실행
- 변경 작업 후 `AI_HANDOFF_HISTORY.md` 업데이트
