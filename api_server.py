from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from data_manager import DataManager


app = FastAPI(title="KNOC Badminton API", version="0.1.0")


def get_dm() -> DataManager:
    return DataManager()


class ScoreSubmitRequest(BaseModel):
    score1: int = Field(ge=0)
    score2: int = Field(ge=0)
    input_by: str


class MatchApproveRequest(BaseModel):
    approved_by: str


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/players")
def get_players(active_only: bool = Query(default=False)):
    dm = get_dm()
    players = []
    for eid, p in dm.players.items():
        if active_only and not p.is_active:
            continue
        players.append(
            {
                "emp_id": eid,
                "name": p.name,
                "score": p.score,
                "tier": p.tier,
                "is_active": p.is_active,
                "role": p.role,
            }
        )
    players.sort(key=lambda x: x["score"], reverse=True)
    return {"count": len(players), "items": players}


@app.get("/ranking")
def get_ranking(limit: int = Query(default=20, ge=1, le=200)):
    dm = get_dm()
    ranking = sorted(dm.players.items(), key=lambda x: x[1].score, reverse=True)[:limit]
    return {
        "count": len(ranking),
        "items": [
            {
                "rank": i + 1,
                "emp_id": eid,
                "name": p.name,
                "score": p.score,
                "tier": p.tier,
                "match_count": p.match_count,
                "win_count": p.win_count,
            }
            for i, (eid, p) in enumerate(ranking)
        ],
    }


@app.get("/matches/{date}")
def get_matches(date: str, group: Optional[str] = None):
    dm = get_dm()
    matches = dm.history.get(date, [])
    if group:
        matches = [m for m in matches if m.get("group") == group]
    return {"date": date, "count": len(matches), "items": matches}


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
    return {"success": True}


@app.post("/matches/{date}/{match_idx}/approve")
def approve_score(date: str, match_idx: int, payload: MatchApproveRequest):
    dm = get_dm()
    ok = dm.approve_match(date=date, match_idx=match_idx, approved_by=payload.approved_by)
    if not ok:
        raise HTTPException(status_code=400, detail="approve failed")
    return {"success": True}
