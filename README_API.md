# KNOC API (FastAPI) 시작점

Streamlit UI와 별개로 API 기반 웹앱 전환을 시작하기 위한 백엔드 엔트리입니다.

## 실행
```bash
pip install -r requirements.txt
uvicorn api_server:app --reload
```

## 주요 엔드포인트
- `GET /health`
- `GET /players?active_only=true`
- `POST /players`
- `PATCH /players/{emp_id}`
- `DELETE /players/{emp_id}`
- `GET /ranking?limit=20`
- `GET /matches/{date}`
- `POST /matches/{date}/{match_idx}/submit-score`
- `POST /matches/{date}/{match_idx}/approve`
- `POST /matches/{date}/{match_idx}/reject`
- `GET /players/{emp_id}/stats`
- `GET /players/{emp_id}/matches`
- `GET /summary/{date}`
- `POST /tournaments/generate`

Swagger 문서: `http://127.0.0.1:8000/docs`
