import os
from functools import lru_cache
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from data_manager import DataManager


class ApiResponse(BaseModel):
    success: bool
    message: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class ScoreSubmitRequest(BaseModel):
    score1: int = Field(ge=0)
    score2: int = Field(ge=0)
    input_by: str


class MatchApproveRequest(BaseModel):
    approved_by: str


class MatchRejectRequest(BaseModel):
    reason: str = ""


class PlayerCreateRequest(BaseModel):
    emp_id: str
    name: str
    score: int = Field(default=1000, ge=0)
    is_active: bool = True


class PlayerUpdateRequest(BaseModel):
    name: Optional[str] = None
    score: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class TournamentGenerateRequest(BaseModel):
    date: str
    attendees: list[str]
    mode: str = "밸런스"


app = FastAPI(title="KNOC Badminton API", version="0.2.0")


origins = [o.strip() for o in os.getenv("FRONTEND_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_dm() -> DataManager:
    return DataManager()



app.mount("/web", StaticFiles(directory="web"), name="web")


@app.get("/")
def web_index():
    return FileResponse("web/index.html")


def _player_payload(eid, p):
    return {
        "emp_id": eid,
        "name": p.name,
        "score": p.score,
        "tier": p.tier,
        "is_active": p.is_active,
        "role": p.role,
        "match_count": p.match_count,
        "win_count": p.win_count,
        "xp": p.xp,
    }


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/auth/login")
def login(payload: LoginRequest):
    dm = get_dm()
    success, role, emp_id = dm.authenticate(payload.username, payload.password)
    if not success:
        raise HTTPException(status_code=401, detail="invalid credentials")

    return {
        "success": True,
        "user": {
            "username": payload.username,
            "role": role,
            "emp_id": emp_id,
        },
    }


@app.post("/admin/reload")
def reload_data():
    get_dm.cache_clear()
    get_dm()
    return ApiResponse(success=True, message="reloaded")


@app.get("/players")
def get_players(active_only: bool = Query(default=False)):
    dm = get_dm()
    players = []
    for eid, p in dm.players.items():
        if active_only and not p.is_active:
            continue
        players.append(_player_payload(eid, p))
    players.sort(key=lambda x: x["score"], reverse=True)
    return {"count": len(players), "items": players}


@app.post("/players")
def create_player(payload: PlayerCreateRequest):
    dm = get_dm()
    ok, msg = dm.add_player(
        eid=payload.emp_id,
        name=payload.name,
        score=payload.score,
        is_active=payload.is_active,
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return ApiResponse(success=True, message=msg)


@app.patch("/players/{emp_id}")
def update_player(emp_id: str, payload: PlayerUpdateRequest):
    dm = get_dm()
    ok = dm.update_player_info(
        emp_id=emp_id,
        new_name=payload.name,
        new_score=payload.score,
        is_active=payload.is_active,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="update failed")
    return ApiResponse(success=True, message="updated")


@app.delete("/players/{emp_id}")
def delete_player(emp_id: str):
    dm = get_dm()
    ok = dm.delete_player(emp_id)
    if not ok:
        raise HTTPException(status_code=400, detail="delete failed")
    return ApiResponse(success=True, message="deleted")


@app.get("/ranking")
def get_ranking(limit: int = Query(default=20, ge=1, le=200)):
    dm = get_dm()
    ranking = sorted(dm.players.items(), key=lambda x: x[1].score, reverse=True)[:limit]
    return {
        "count": len(ranking),
        "items": [
            {
                "rank": i + 1,
                **_player_payload(eid, p),
            }
            for i, (eid, p) in enumerate(ranking)
        ],
    }


@app.get("/dashboard/overview")
def get_dashboard_overview(date: Optional[str] = None):
    dm = get_dm()
    history = dm.history
    target_date = date or (sorted(history.keys(), reverse=True)[0] if history else None)
    matches = history.get(target_date, []) if target_date else []

    pending_approval = sum(1 for m in matches if m.get("status") == "pending_approval")
    disputed = sum(1 for m in matches if m.get("status") == "disputed")
    done = sum(1 for m in matches if m.get("status") == "done")

    return {
        "date": target_date,
        "players_total": len(dm.players),
        "matches_total": len(matches),
        "matches_done": done,
        "matches_pending_approval": pending_approval,
        "matches_disputed": disputed,
    }




@app.get("/match-dates")
def get_match_dates(limit: int = Query(default=12, ge=1, le=120)):
    dm = get_dm()
    dates = sorted(dm.history.keys(), reverse=True)
    return {"count": len(dates), "items": dates[:limit]}

@app.get("/matches/{date}")
def get_matches(date: str, group: Optional[str] = None):
    dm = get_dm()
    matches = dm.history.get(date, [])
    if group:
        matches = [m for m in matches if m.get("group") == group]
    return {"date": date, "count": len(matches), "items": matches}


@app.get("/players/{emp_id}/stats")
def get_player_stats(emp_id: str):
    dm = get_dm()
    if emp_id not in dm.players:
        raise HTTPException(status_code=404, detail="player not found")
    return dm.get_player_stats(emp_id)


@app.get("/players/{emp_id}/matches")
def get_player_matches(emp_id: str):
    dm = get_dm()
    if emp_id not in dm.players:
        raise HTTPException(status_code=404, detail="player not found")
    matches = dm.get_player_match_history(emp_id)
    return {"count": len(matches), "items": matches}


@app.get("/summary/{date}")
def get_daily_summary(date: str):
    dm = get_dm()
    return {"date": date, "items": dm.get_daily_summary(date)}


@app.post("/matches/{date}/{match_idx}/submit-score")
def submit_score(date: str, match_idx: int, payload: ScoreSubmitRequest):
    dm = get_dm()
    ok = dm.submit_score_for_approval(
        date=date,
        match_idx=match_idx,
        score1=payload.score1,
        score2=payload.score2,
        input_by=payload.input_by,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="score submit failed")
    return ApiResponse(success=True, message="submitted")


@app.post("/matches/{date}/{match_idx}/approve")
def approve_score(date: str, match_idx: int, payload: MatchApproveRequest):
    dm = get_dm()
    ok = dm.approve_match(date=date, match_idx=match_idx, approved_by=payload.approved_by)
    if not ok:
        raise HTTPException(status_code=400, detail="approve failed")
    return ApiResponse(success=True, message="approved")


@app.post("/matches/{date}/{match_idx}/reject")
def reject_score(date: str, match_idx: int, payload: MatchRejectRequest):
    dm = get_dm()
    ok = dm.reject_match(date=date, match_idx=match_idx, reason=payload.reason)
    if not ok:
        raise HTTPException(status_code=400, detail="reject failed")
    return ApiResponse(success=True, message="rejected")


@app.post("/tournaments/generate")
def generate_tournament(payload: TournamentGenerateRequest):
    dm = get_dm()
    ok, msg = dm.generate_tournament(
        date=payload.date,
        attendees=payload.attendees,
        mode=payload.mode,
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return ApiResponse(success=True, message=msg)
