"""
Restore Supabase data from local data.json.

Default mode is dry-run. Use --apply for actual writes.

Examples:
  python restore_from_data_json.py
  python restore_from_data_json.py --up-to-month 2026-01
  python restore_from_data_json.py --apply --truncate --up-to-month 2026-01
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MONTH_RE = re.compile(r"^\d{4}-\d{2}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass
class PreparedData:
  players: list[dict[str, Any]]
  matches: list[dict[str, Any]]
  score_rules: list[dict[str, Any]]
  tier_rules: list[dict[str, Any]]
  skipped_history_keys: list[str]


def month_key(date_value: str) -> str:
  if MONTH_RE.match(date_value):
    return date_value
  if DATE_RE.match(date_value):
    return date_value[:7]
  raise ValueError(f"Unsupported date key format: {date_value}")


def build_player_row(emp_id: str, src: dict[str, Any]) -> dict[str, Any]:
  # Keep only columns used by current Workers + known schema fields.
  return {
    "emp_id": emp_id,
    "name": src.get("name", emp_id),
    "score": int(src.get("score", 1000)),
    "xp": int(src.get("xp", 0)),
    "tier": src.get("tier", "브론즈"),
    "win_count": int(src.get("win_count", 0)),
    "match_count": int(src.get("match_count", 0)),
    "streak": int(src.get("streak", 0)),
    "is_active": bool(src.get("is_active", True)),
    "join_date": src.get("join_date"),
    "attendance_count": int(src.get("attendance_count", 0)),
    "consecutive_months": int(src.get("consecutive_months", 0)),
    "role": src.get("role", "player"),
    "pin_hash": None,
  }


def build_match_rows(history: dict[str, Any], up_to_month: str | None) -> tuple[list[dict[str, Any]], list[str]]:
  rows: list[dict[str, Any]] = []
  skipped: list[str] = []
  for date_key, games in history.items():
    if not (MONTH_RE.match(date_key) or DATE_RE.match(date_key)):
      skipped.append(date_key)
      continue
    if up_to_month and month_key(date_key) > up_to_month:
      continue
    if not isinstance(games, list):
      skipped.append(date_key)
      continue

    for g in games:
      team1 = g.get("team1", [])
      team2 = g.get("team2", [])
      row = {
        "date": date_key,
        "group_name": g.get("group"),
        "team1_player1": team1[0] if len(team1) > 0 else None,
        "team1_player2": team1[1] if len(team1) > 1 else None,
        "team2_player1": team2[0] if len(team2) > 0 else None,
        "team2_player2": team2[1] if len(team2) > 1 else None,
        "score1": int(g.get("score1", 0)),
        "score2": int(g.get("score2", 0)),
        "status": g.get("status", "done"),
        "dispute_reason": None,
      }
      rows.append(row)
  return rows, skipped


def prepare_data(payload: dict[str, Any], up_to_month: str | None) -> PreparedData:
  players_obj = payload.get("players", {})
  history_obj = payload.get("history", {})
  rules_obj = payload.get("rules", {})

  players = []
  for emp_id, src in players_obj.items():
    players.append(build_player_row(str(emp_id), src or {}))

  matches, skipped = build_match_rows(history_obj, up_to_month)

  score_map = (rules_obj.get("score") or {})
  tier_map = (rules_obj.get("tier") or {})
  score_rules = [{"key": str(k), "value": int(v)} for k, v in score_map.items()]
  tier_rules = [{"tier_name": str(k), "threshold": int(v)} for k, v in tier_map.items()]

  return PreparedData(
    players=players,
    matches=matches,
    score_rules=score_rules,
    tier_rules=tier_rules,
    skipped_history_keys=skipped,
  )


def chunked(items: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
  return [items[i : i + size] for i in range(0, len(items), size)]


def print_summary(data: PreparedData, up_to_month: str | None, apply: bool, truncate: bool) -> None:
  print("=== data.json 복원 준비 요약 ===")
  print(f"모드: {'APPLY' if apply else 'DRY-RUN'}")
  print(f"기존 데이터 삭제(truncate): {'예' if truncate else '아니오'}")
  print(f"반영 기준 월 상한: {up_to_month or '제한 없음'}")
  print(f"선수 수: {len(data.players)}")
  print(f"경기 수: {len(data.matches)}")
  print(f"점수 규칙 수: {len(data.score_rules)}")
  print(f"티어 규칙 수: {len(data.tier_rules)}")
  if data.matches:
    months = sorted({month_key(m['date']) for m in data.matches})
    print(f"경기 월 범위: {months[0]} ~ {months[-1]}")
  if data.skipped_history_keys:
    print(f"건너뛴 history 키: {', '.join(data.skipped_history_keys)}")
  print("=============================")


def validate_args(args: argparse.Namespace) -> None:
  if args.up_to_month and not MONTH_RE.match(args.up_to_month):
    raise ValueError("--up-to-month 형식은 YYYY-MM 이어야 합니다.")
  if args.apply and (not args.supabase_url or not args.supabase_key):
    raise ValueError("--apply 사용 시 SUPABASE_URL/SUPABASE_KEY(또는 인자) 설정이 필요합니다.")


def run_apply(data: PreparedData, supabase_url: str, supabase_key: str, truncate: bool) -> None:
  from supabase import create_client

  client = create_client(supabase_url, supabase_key)

  if truncate:
    print("기존 데이터 삭제 중...")
    # Delete child/transaction-like tables first.
    client.table("matches").delete().neq("id", -1).execute()
    client.table("players").delete().neq("emp_id", "").execute()
    client.table("score_rules").delete().neq("key", "").execute()
    client.table("tier_rules").delete().neq("tier_name", "").execute()

  print("선수 업서트 중...")
  for chunk in chunked(data.players, 200):
    client.table("players").upsert(chunk).execute()

  print("경기 입력 중...")
  for chunk in chunked(data.matches, 300):
    client.table("matches").insert(chunk).execute()

  print("규칙 반영 중...")
  client.table("score_rules").delete().neq("key", "").execute()
  if data.score_rules:
    client.table("score_rules").insert(data.score_rules).execute()
  client.table("tier_rules").delete().neq("tier_name", "").execute()
  if data.tier_rules:
    client.table("tier_rules").insert(data.tier_rules).execute()

  print("복원 완료.")
  print("권장 후속 작업: 시스템 설정 페이지에서 '포인트/XP 재계산 적용' 실행")


def main() -> None:
  parser = argparse.ArgumentParser(description="Restore Supabase data from data.json")
  parser.add_argument("--data-file", default="data.json", help="Input JSON path (default: data.json)")
  parser.add_argument("--up-to-month", default=None, help="Only include history <= YYYY-MM")
  parser.add_argument("--apply", action="store_true", help="Apply to Supabase (default: dry-run)")
  parser.add_argument("--truncate", action="store_true", help="Delete existing rows before import (apply mode only)")
  parser.add_argument("--supabase-url", default=os.environ.get("SUPABASE_URL"), help="Supabase URL")
  parser.add_argument("--supabase-key", default=os.environ.get("SUPABASE_KEY"), help="Supabase service key")
  args = parser.parse_args()

  validate_args(args)

  path = Path(args.data_file)
  if not path.exists():
    raise FileNotFoundError(f"data file not found: {path}")

  payload = json.loads(path.read_text(encoding="utf-8"))
  prepared = prepare_data(payload, args.up_to_month)
  print_summary(prepared, args.up_to_month, args.apply, args.truncate)

  if not args.apply:
    print("DRY-RUN 완료: 실제 반영은 --apply 옵션으로 실행하세요.")
    return

  run_apply(prepared, args.supabase_url, args.supabase_key, args.truncate)


if __name__ == "__main__":
  main()
