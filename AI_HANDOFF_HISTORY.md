# AI Handoff History (Required)

Last Updated: 2026-02-27 (2월 고정 버전 + 문서 최신화)
Branch: `main`
Purpose: 새 채팅/새 AI 세션에서도 즉시 개발을 이어갈 수 있도록 프로젝트 전반 맥락을 유지한다.

---

## 1) 필수 규칙
1. 코드/설정/동작이 바뀌면, 같은 작업에서 이 파일을 반드시 업데이트한다.
2. 업데이트 시 아래 4가지를 반드시 남긴다.
   - 변경 이유
   - 변경 파일
   - 동작 영향
   - 검증 결과
3. 새 AI 세션은 이 파일을 먼저 읽고 작업한다.

---

## 2) 프로젝트 스냅샷
- 프로젝트: KNOC 배드민턴 클럽 운영 시스템
- 운영 단위: 월(`YYYY-MM`)
- 스택:
  - Frontend: React + Vite + TypeScript + Tailwind
  - API: Cloudflare Workers + Hono
  - DB: Supabase Postgres
  - 참고 레거시: Python/Streamlit

### 현재 제공 기능(요약)
- 로그인/권한/JWT
- 최초 로그인 비밀번호 변경 강제
- 회원가입 요청 + 관리자 승인/거부
- 사용자 정보 수정/비활성/삭제
- 대진 생성 + 경기 점수 제출/승인/반려
- 경기 수동 생성/수정/삭제
- 경기 취소 처리
- 월 마감/해제
- 점수/XP 재계산
- 대진표/결과 출력
- 감사 로그 조회
- 개인 프로필 통계 확장

---

## 3) 운영 기준선
- 서비스 타이틀: `KNOC 배드민턴 클럽`
- 용어 기준: 사용자 화면에서 `PIN` 대신 `비밀번호` 사용
- 대진 생성 동점 정렬 규칙(결정적 정렬):
  - 1순위: 포인트 내림차순
  - 2순위: 이름 오름차순
- 기준 레퍼런스: "2월 월 고정 완료" 시점 버전

---

## 4) 중요 변경 이력 (핵심)
1. Supabase 연동 안정화 및 API 폴백(`/api`) 정리
2. Python 기반 기능 이관 확장
3. 경기/승패 집계(`match_count`, `win_count`) 동적 계산 수정
4. 경기 관리 API 추가 (`POST/PATCH/DELETE /matches`)
5. 월 마감 기능 추가
   - 마감 월은 점수 제출/승인/거부, 경기 CRUD, 대진 생성 제한
6. 취소 경기(`cancelled`) 상태 추가
   - 점수/승패 통계는 `done` 기준 유지
7. 점수/XP 재계산 API + UI 추가
8. 출력 기능 추가/개선
   - 대진표 A3 가로 출력
   - 경기결과 요약 출력(현장 공유용)
9. 감사 로그 도입
   - 주요 변경 API에 로그 기록
   - `GET /admin/audit-logs` 조회 및 설정 화면 뷰어 추가
10. 프로필 기능 강화
    - 월 필터, 승률/출석/연속참여, 최근 폼, 다음 티어 정보
11. 회원 관리 확장
    - 가입 요청 승인/거부
    - 관리자 사용자 수정
    - 조건부 하드 삭제
12. 인코딩 안정화
    - `.editorconfig`, `.gitattributes`, `scripts/utf8_guard.ps1` 반영
13. 2026-02 실경기 기준 정합성 보정
    - 사용자 제공 대진/결과 기준으로 월 데이터 고정

---

## 5) 데이터/운영 메모
Supabase project:
- `https://xyvrrubphbkclsdtagoe.supabase.co`

최근 데이터 작업:
- `data.json` 기준 데이터 복원 유틸 추가/사용
- `2026-02` 월 대진/경기 정합성 보정 및 기준 버전 고정

이름 정규화 이슈 메모:
- OCR/수기 입력으로 이름 변형이 자주 발생하므로, 운영 시 이름 매핑 확인 필수

---

## 6) 핵심 API 표면
### Auth / Signup
- `POST /login`
- `POST /signup`
- `POST /change-pin` (UI 문구는 비밀번호 변경)
- `POST /admin/reset-pin/:emp_id`
- `GET /admin/signup-requests`
- `POST /admin/signup-requests/:emp_id/approve`
- `POST /admin/signup-requests/:emp_id/reject`

### Players
- `GET /players`
- `POST /players`
- `PATCH /players/:emp_id`
- `DELETE /players/:emp_id` (비활성화)
- `DELETE /players/:emp_id/hard` (조건부 하드 삭제)
- `GET /players/:emp_id/stats`
- `GET /players/:emp_id/matches`

### Matches / Tournament
- `GET /matches/:date` (`YYYY-MM`)
- `POST /matches/:date/:match_id/submit-score`
- `POST /matches/:date/:match_id/approve`
- `POST /matches/:date/:match_id/reject`
- `POST /matches`
- `PATCH /matches/:match_id`
- `DELETE /matches/:match_id`
- `POST /tournaments/generate`
- `GET /summary/:date`

### Settings / Recalculate / Audit
- `GET /settings/month-close`
- `GET /settings/month-close/:month`
- `POST /settings/month-close`
- `DELETE /settings/month-close/:month`
- `GET /settings/rules`
- `PATCH /settings/rules`
- `POST /admin/recalculate/score`
- `POST /admin/recalculate/xp`
- `POST /admin/recalculate/all`
- `GET /admin/audit-logs`

---

## 7) 주요 파일
Frontend:
- `frontend/src/App.tsx`
- `frontend/src/api/client.ts`
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/pages/Tournament.tsx`
- `frontend/src/pages/Matches.tsx`
- `frontend/src/pages/Profile.tsx`
- `frontend/src/pages/SystemSettings.tsx`
- `frontend/src/pages/MatchAdmin.tsx`

Workers:
- `workers/src/index.ts`

Ops/Docs:
- `restore_from_data_json.py`
- `data.json`
- `sql/audit_logs.sql`
- `scripts/utf8_guard.ps1`
- `README.md`
- `SETUP_GUIDE.md`

---

## 8) 실행/검증
실행:
- `cd workers && npm run dev`
- `cd frontend && npm run dev`

검증:
- `cd workers && npm run typecheck`
- `cd frontend && npm run build`

---

## 9) 리스크 및 주의
1. 과거 인코딩 깨짐 이력이 있으므로 UTF-8 가드 없이 한글 대량 치환 금지.
2. 운영 데이터 변경 작업 전 대상 월/대상 사용자 확인 필수.
3. 하드 삭제는 경기 이력 없는 계정에만 허용.

---

## 10) 새 AI 세션 시작 프로토콜
1. 이 파일을 먼저 읽는다.
2. 대상 월/데이터 범위를 먼저 확인한다.
3. 작업 후 아래를 남긴다.
   - 변경 파일 목록
   - 검증 명령과 결과
   - 이 파일 업데이트
