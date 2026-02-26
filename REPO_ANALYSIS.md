# KNOC 배드민턴 월례대회/회원관리 프로그램 분석 메모

작성일: 2026-02-26

## 1) 프로젝트 개요
- Streamlit 기반 웹 앱이며 로그인 후 권한(슈퍼관리자/관리자/선수)에 따라 페이지 메뉴가 달라집니다.
- 기능 축은 **선수 관리 / 대진 생성 / 경기결과 승인 워크플로우 / 랭킹 및 통계**입니다.
- 현재 코드는 SQLite 설명이 README에 남아 있으나, 실제 `Database` 구현은 Supabase를 사용하도록 전환되어 있습니다.

## 2) 진입점 및 구조
- 엔트리: `app.py`
  - 세션 초기화(`authenticated`, `role`, `emp_id`, `username`)
  - `DataManager`를 세션 싱글턴으로 사용
  - 사이드바 메뉴에서 페이지 라우팅
- 업무 로직: `data_manager.py`
  - 인증/선수 CRUD/대진 생성/결과 반영/승인·이의제기/백업·복구
- 저장소 계층: `database.py`
  - Supabase 테이블 CRUD 래핑
- 페이지 모듈: `pages/*.py`
  - `page_tourney.py`: 대진 생성
  - `page_my_matches.py`: 선수 점수 입력
  - `page_mediate.py`: 관리자 중재
  - `page_manage.py`: 선수 관리, 점수 재계산/초기화

## 3) 데이터 모델 요약
- `players`: 사번(emp_id) PK, 이름, 점수, 티어, 활동여부, 경기 누적 통계, 역할(role)
- `matches`: 날짜/조/양팀 선수/스코어/변동점수/상태/입력·승인 메타
- `settings`: super_admin 설정(아이디/해시 비밀번호)
- `score_rules`, `tier_rules`: 점수 및 티어 규칙

## 4) 핵심 워크플로우
1. 선수는 `이름 + 사번`, 슈퍼관리자는 `admin + 비밀번호`로 로그인.
2. 선수가 경기 점수 입력 시 `pending_approval`로 저장.
3. 상대팀 승인 시 `done`으로 확정되며 점수/티어 재계산.
4. 이의제기 시 `disputed` 상태로 이동 후 관리자 중재 가능.

## 5) 코드 상태 진단 (중요)

### A. 문서/구현 불일치
- README는 SQLite 기반으로 설명하지만, 실제 `database.py`는 Supabase를 사용함.
- 신규 인수인계 관점에서 가장 먼저 정리해야 할 항목.

### B. 민감정보 노출
- `migrate_to_supabase.py`에 Supabase URL/anon key가 하드코딩됨.
- 공개 저장소 기준 즉시 키 교체/폐기와 비밀관리 방식 전환이 필요.

### C. 보안 설정 리스크
- `supabase_setup.sql`에서 모든 핵심 테이블 RLS를 비활성화.
- 현재 구조는 사실상 anon 키만 알면 폭넓은 읽기/쓰기 가능해질 수 있어 운영 리스크 큼.

### D. 백업/복구 로직의 기술부채
- `DataManager.create_backup()`은 로컬 DB 파일 복사를 전제로 작성되어 있음.
- 현재 DB 추상화가 Supabase인 상태에서는 실질 백업이 동작하지 않을 가능성이 높음.

### E. 예외 삼킴(관측성 부족)
- `database.py` 다수 메서드가 broad `except Exception: return False/None` 패턴.
- 장애 시 원인 추적이 어려워 운영 디버깅 비용이 커짐.

## 6) 우선순위 개선 제안 (실행순)
1. **보안 조치 즉시**
   - 노출 키 회수/재발급, 코드에서 하드코딩 제거, 환경변수/Secrets만 사용.
   - Supabase RLS 정책 설계 및 최소권한 적용.
2. **문서 정합성 복구**
   - README를 현재 아키텍처(Supabase) 기준으로 전면 갱신.
3. **운영 가시성 개선**
   - DB 계층의 예외 로깅 추가(메서드/파라미터/응답코드).
4. **백업 정책 재설계**
   - Supabase 스냅샷/덤프 또는 관리 스크립트 기반 백업으로 전환.
5. **테스트 자동화**
   - 점수 계산, 승인/중재 상태전이, 대진 생성에 대한 단위테스트 추가.

## 7) 빠른 재가동 체크리스트
- `.streamlit/secrets.toml` 또는 환경변수에 `SUPABASE_URL`, `SUPABASE_KEY` 준비
- `pip install -r requirements.txt`
- `streamlit run app.py`
- 관리자 로그인 및 주요 페이지(랭킹/대진/선수관리/중재) smoke test

