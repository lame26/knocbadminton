# KNOC Workers API Reference

기준: Cloudflare Workers + Hono + Supabase

Base URL
- Local: `http://localhost:8787`
- Frontend 프록시 사용 시: `/api`

## Auth
- `POST /login`
- `POST /signup`
- `POST /change-pin` (UI는 비밀번호 변경으로 표기)
- `POST /admin/reset-pin/:emp_id`

## Signup Admin
- `GET /admin/signup-requests`
- `POST /admin/signup-requests/:emp_id/approve`
- `POST /admin/signup-requests/:emp_id/reject`

## Players
- `GET /players`
- `POST /players`
- `PATCH /players/:emp_id`
- `DELETE /players/:emp_id`
- `DELETE /players/:emp_id/hard`
- `GET /players/:emp_id/stats`
- `GET /players/:emp_id/matches`

## Matches / Tournament
- `GET /matches/:date` (`YYYY-MM`)
- `POST /matches/:date/:match_id/submit-score`
- `POST /matches/:date/:match_id/approve`
- `POST /matches/:date/:match_id/reject`
- `POST /matches`
- `PATCH /matches/:match_id`
- `DELETE /matches/:match_id`
- `POST /tournaments/generate`
- `GET /summary/:date`

## Settings
- `GET /settings/rules`
- `PATCH /settings/rules`
- `GET /settings/month-close`
- `GET /settings/month-close/:month`
- `POST /settings/month-close`
- `DELETE /settings/month-close/:month`

## Admin Ops
- `POST /admin/recalculate/score`
- `POST /admin/recalculate/xp`
- `POST /admin/recalculate/all`
- `GET /admin/audit-logs`

## Note
- 월 마감 상태에서는 일부 변경 API가 차단됩니다.
- 감사 로그는 주요 변경성 API 호출에 대해 기록됩니다.
