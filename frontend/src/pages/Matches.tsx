import { useEffect, useMemo, useState } from "react";
import { api, type Match, type Player } from "../api/client";

function nowMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "대기", cls: "bg-yellow-50 text-yellow-700" },
  done: { label: "확정", cls: "bg-green-50 text-green-700" },
  disputed: { label: "이의", cls: "bg-red-50 text-red-700" },
  cancelled: { label: "취소", cls: "bg-slate-100 text-slate-600" },
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function Matches() {
  const [month, setMonth] = useState(nowMonth());
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tab, setTab] = useState<"matches" | "notice">("matches");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerName = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => map.set(p.emp_id, p.name));
    return (empId?: string | null) => (empId ? map.get(empId) ?? empId : "-");
  }, [players]);

  function teamLabel(p1?: string | null, p2?: string | null): string {
    if (!p1) return "-";
    return `${playerName(p1)}${p2 ? `, ${playerName(p2)}` : ""}`;
  }

  const groupedMatches = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of [...matches].sort((a, b) => a.id - b.id)) {
      const key = m.group_name || "A";
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [matches]);

  const noticeText = useMemo(() => {
    const courtEmojis = ["🔵", "🟢", "🔴", "🟣", "🟠"];
    const done = matches.filter((m) => m.status === "done");
    const cancelled = matches.filter((m) => m.status === "cancelled");
    const pending = matches.filter((m) => m.status === "pending");
    const disputed = matches.filter((m) => m.status === "disputed");

    const lines: string[] = [];
    lines.push(`📢 KNOC 배드민턴 ${month} 경기 결과`);
    lines.push("");

    groupedMatches.forEach(([groupName, list], gi) => {
      lines.push(`${courtEmojis[gi % courtEmojis.length]} ${groupName}조 (${gi + 1}번 코트)`);
      list.forEach((m, i) => {
        const t1 = teamLabel(m.team1_player1, m.team1_player2);
        const t2 = teamLabel(m.team2_player1, m.team2_player2);
        if (m.status === "cancelled") {
          lines.push(`${i + 1}경기 ${t1} VS ${t2} (취소)`);
        } else {
          lines.push(`${i + 1}경기 ${t1} ${m.score1} : ${m.score2} ${t2}`);
        }
      });
      lines.push("");
    });

    lines.push(`확정 ${done.length}경기 / 취소 ${cancelled.length}경기 / 대기 ${pending.length}경기 / 이의 ${disputed.length}경기`);
    return lines.join("\n");
  }, [groupedMatches, matches, month]);


  const load = (target: string) => {
    setLoading(true);
    setError(null);
    Promise.all([api.matches.byDate(target), api.players.list(false)])
      .then(([matchRows, playerRows]) => {
        setMatches(matchRows);
        setPlayers(playerRows);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(month), [month]);

  function printBracketA3() {
    if (groupedMatches.length === 0) {
      setError("출력할 대진표가 없습니다.");
      return;
    }

    const gridCols = 3;
    const gridRows = Math.max(1, Math.ceil(groupedMatches.length / gridCols));

    const tableSections = groupedMatches
      .map(([groupName, list], idx) => {
        const courtNo = idx + 1;
        const rows = list
          .map((m, i) => {
            const team1 = teamLabel(m.team1_player1, m.team1_player2);
            const team2 = teamLabel(m.team2_player1, m.team2_player2);
            return `
              <tr>
                <td class="c-no">${i + 1}</td>
                <td class="c-team">${escapeHtml(team1)}</td>
                <td class="c-score"></td>
                <td class="c-vs">VS</td>
                <td class="c-score"></td>
                <td class="c-team">${escapeHtml(team2)}</td>
                <td class="c-note"></td>
              </tr>
            `;
          })
          .join("");

        return `
          <section class="group">
            <div class="group-head">${["🔵", "🟢", "🔴", "🟣", "🟠"][idx % 5]} ${escapeHtml(groupName)}조 (코트 ${courtNo})</div>
            <table>
              <thead>
                <tr>
                  <th class="c-no">경기</th>
                  <th class="c-team">팀 1</th>
                  <th class="c-score">점수</th>
                  <th class="c-vs"> </th>
                  <th class="c-score">점수</th>
                  <th class="c-team">팀 2</th>
                  <th class="c-note">비고</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </section>
        `;
      })
      .join("");

    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${month} 대진표 (A3 가로)</title>
  <style>
    @page { size: A3 landscape; margin: 3.5mm; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body {
      margin: 0;
      color: #0f172a;
      font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 15px;
      background: #ffffff;
    }
    .wrap {
      padding: 1.5mm;
      height: calc(297mm - 7mm);
      display: flex;
      flex-direction: column;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 5px;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 4px;
    }
    .title { font-size: 28px; font-weight: 800; letter-spacing: -0.2px; line-height: 1.1; }
    .meta { font-size: 13px; color: #374151; text-align: right; line-height: 1.25; }
    .grid {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(${gridCols}, minmax(0, 1fr));
      grid-template-rows: repeat(${gridRows}, minmax(0, 1fr));
      gap: 4px;
      min-height: 0;
    }
    .group {
      border: 1px solid #334155;
      border-radius: 6px;
      overflow: hidden;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .group-head {
      background: linear-gradient(90deg, #e2e8f0 0%, #f8fafc 100%);
      font-size: 16px;
      font-weight: 700;
      padding: 5px 7px;
      border-bottom: 1px solid #cbd5e1;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; height: 100%; }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 3px 4px;
      vertical-align: middle;
      text-align: center;
      height: 36px;
    }
    th { background: #f8fafc; font-size: 12px; line-height: 1.1; color: #334155; font-weight: 700; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .c-no { width: 40px; font-weight: 700; color: #1e293b; }
    .c-team {
      width: auto;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.2;
      color: #0f172a;
      text-align: center;
    }
    .c-score { width: 56px; font-size: 18px; font-weight: 800; }
    .c-vs { width: 34px; color: #64748b; font-weight: 700; font-size: 12px; }
    .c-note { width: 84px; }
    .foot {
      margin-top: 4px;
      font-size: 9.5px;
      color: #6b7280;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="title-row">
      <div class="title">KNOC 배드민턴 클럽 대진표</div>
      <div class="meta">대상 월: ${month}<br/>출력 시각: ${new Date().toLocaleString("ko-KR")}</div>
    </div>
    <div class="grid">${tableSections}</div>
    <div class="foot">
      <span>현장 기록용: 점수/비고 칸에 수기 입력</span>
      <span>총 경기 수: ${matches.length}</span>
    </div>
  </div>
</body>
</html>`;

    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const frameDoc = frame.contentDocument ?? frame.contentWindow?.document;
    if (!frameDoc || !frame.contentWindow) {
      document.body.removeChild(frame);
      setError("인쇄 프레임을 생성하지 못했습니다.");
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    // 렌더링 완료 후 인쇄하고 프레임 정리
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(frame)) document.body.removeChild(frame);
      }, 1000);
    }, 200);
  }

  function printResultA3() {
    if (groupedMatches.length === 0) {
      setError("출력할 경기결과가 없습니다.");
      return;
    }

    const gridCols = 3;
    const gridRows = Math.max(1, Math.ceil(groupedMatches.length / gridCols));

    const tableSections = groupedMatches
      .map(([groupName, list], idx) => {
        const courtNo = idx + 1;
        const rows = list
          .map((m, i) => {
            const team1 = teamLabel(m.team1_player1, m.team1_player2);
            const team2 = teamLabel(m.team2_player1, m.team2_player2);
            const isCancelled = m.status === "cancelled";
            return `
              <tr>
                <td class="c-no">${i + 1}</td>
                <td class="c-team">${escapeHtml(team1)}</td>
                <td class="c-score">${isCancelled ? "-" : m.score1}</td>
                <td class="c-vs">VS</td>
                <td class="c-score">${isCancelled ? "-" : m.score2}</td>
                <td class="c-team">${escapeHtml(team2)}</td>
                <td class="c-note">${isCancelled ? "취소" : ""}</td>
              </tr>
            `;
          })
          .join("");

        return `
          <section class="group">
            <div class="group-head">${["🔵", "🟢", "🔴", "🟣", "🟠"][idx % 5]} ${escapeHtml(groupName)}조 (코트 ${courtNo})</div>
            <table>
              <thead>
                <tr>
                  <th class="c-no">경기</th>
                  <th class="c-team">팀 1</th>
                  <th class="c-score">점수</th>
                  <th class="c-vs"> </th>
                  <th class="c-score">점수</th>
                  <th class="c-team">팀 2</th>
                  <th class="c-note">비고</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </section>
        `;
      })
      .join("");

    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${month} 경기결과표 (A3 가로)</title>
  <style>
    @page { size: A3 landscape; margin: 3.5mm; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body {
      margin: 0;
      color: #0f172a;
      font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 15px;
      background: #ffffff;
    }
    .wrap {
      padding: 1.5mm;
      height: calc(297mm - 7mm);
      display: flex;
      flex-direction: column;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 5px;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 4px;
    }
    .title { font-size: 28px; font-weight: 800; letter-spacing: -0.2px; line-height: 1.1; }
    .meta { font-size: 13px; color: #374151; text-align: right; line-height: 1.25; }
    .grid {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(${gridCols}, minmax(0, 1fr));
      grid-template-rows: repeat(${gridRows}, minmax(0, 1fr));
      gap: 4px;
      min-height: 0;
    }
    .group {
      border: 1px solid #334155;
      border-radius: 6px;
      overflow: hidden;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .group-head {
      background: linear-gradient(90deg, #e2e8f0 0%, #f8fafc 100%);
      font-size: 16px;
      font-weight: 700;
      padding: 5px 7px;
      border-bottom: 1px solid #cbd5e1;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; height: 100%; }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 3px 4px;
      vertical-align: middle;
      text-align: center;
      height: 36px;
    }
    th { background: #f8fafc; font-size: 12px; line-height: 1.1; color: #334155; font-weight: 700; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .c-no { width: 40px; font-weight: 700; color: #1e293b; }
    .c-team { width: auto; font-size: 14px; font-weight: 700; line-height: 1.2; color: #0f172a; text-align: center; }
    .c-score { width: 56px; font-size: 18px; font-weight: 800; }
    .c-vs { width: 34px; color: #64748b; font-weight: 700; font-size: 12px; }
    .c-note { width: 84px; }
    .foot {
      margin-top: 4px;
      font-size: 9.5px;
      color: #6b7280;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="title-row">
      <div class="title">KNOC 배드민턴 클럽 경기결과표</div>
      <div class="meta">대상 월: ${month}<br/>출력 시각: ${new Date().toLocaleString("ko-KR")}</div>
    </div>
    <div class="grid">${tableSections}</div>
    <div class="foot">
      <span>경기 결과 확정본</span>
      <span>총 경기 수: ${matches.length}</span>
    </div>
  </div>
</body>
</html>`;

    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const frameDoc = frame.contentDocument ?? frame.contentWindow?.document;
    if (!frameDoc || !frame.contentWindow) {
      document.body.removeChild(frame);
      setError("인쇄 프레임을 생성하지 못했습니다.");
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(frame)) document.body.removeChild(frame);
      }, 1000);
    }, 200);
  }

  async function copyNotice() {
    try {
      await navigator.clipboard.writeText(noticeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setError("클립보드 복사에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600">대상 월</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button onClick={() => load(month)} className="text-xs text-primary-600 hover:underline ml-auto">
          새로고침
        </button>
        <button
          onClick={printBracketA3}
          disabled={matches.length === 0}
          className="px-3 py-2 text-xs bg-slate-800 text-white rounded disabled:opacity-50"
        >
          대진표 출력(A3 가로)
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("matches")}
          className={[
            "px-3 py-1.5 text-sm rounded border",
            tab === "matches" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-700 border-slate-300",
          ].join(" ")}
        >
          경기 조회
        </button>
        <button
          onClick={() => setTab("notice")}
          className={[
            "px-3 py-1.5 text-sm rounded border",
            tab === "notice" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-700 border-slate-300",
          ].join(" ")}
        >
          경기결과 요약
        </button>
      </div>

      {loading && <p className="text-slate-400 text-center mt-8">불러오는 중...</p>}
      {error && <p className="text-red-500 text-center mt-8">오류: {error}</p>}

      {!loading && !error && tab === "matches" && matches.length === 0 && (
        <p className="text-slate-400 text-center mt-8">{month} 경기 데이터가 없습니다.</p>
      )}

      {tab === "notice" && !loading && !error && (
        <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">경기결과 요약</h3>
            <div className="flex gap-2">
              <button
                onClick={copyNotice}
                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded"
              >
                {copied ? "복사됨" : "요약 복사"}
              </button>
              <button
                onClick={printResultA3}
                className="px-3 py-1.5 text-xs bg-slate-800 text-white rounded"
              >
                결과표 출력(A3 가로)
              </button>
            </div>
          </div>
          <textarea
            readOnly
            value={noticeText}
            className="w-full min-h-[360px] border border-slate-300 rounded p-3 text-sm leading-6"
          />
        </section>
      )}

      {tab === "matches" && matches.map((m) => {
        const s = STATUS_LABEL[m.status] ?? { label: m.status, cls: "bg-slate-100 text-slate-500" };
        return (
          <div key={m.id} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs font-medium text-slate-500">
                {m.group_name}조 · #{m.id}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center text-center gap-2">
              <div className="text-sm font-medium">{teamLabel(m.team1_player1, m.team1_player2)}</div>
              <div className="text-xl font-bold tabular-nums">
                {m.score1} : {m.score2}
              </div>
              <div className="text-sm font-medium">{teamLabel(m.team2_player1, m.team2_player2)}</div>
            </div>
            {m.dispute_reason && (
              <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">이의 사유: {m.dispute_reason}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
