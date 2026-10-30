/* =====================================================
   야구 경기 일정 한눈에 보기 - 1차 버전 (조회 전용)
   ===================================================== */

// ---------- 1. 기본 설정 ----------

// 불러올 CSV 파일 경로
// - 배포 버전(기본): 시연용 가상 데이터. 실제 경기와 무관합니다.
// - 로컬 개발용: 주소 끝에 ?data=real 을 붙이면 실제 2026 CSV를 읽습니다.
//   (이 파일은 GitHub/배포에 올리지 않으므로 배포 사이트에서는 열리지 않습니다)
const DEMO_CSV_PATH = "data/demo_games.csv";
const REAL_CSV_PATH = "data/kbo_2026_full.csv";
const IS_DEMO = new URLSearchParams(location.search).get("data") !== "real";
const CSV_PATH = IS_DEMO ? DEMO_CSV_PATH : REAL_CSV_PATH;
const DEMO_NOTICE = "시연용 가상 데이터이며 실제 경기 일정과 결과가 아닙니다";

// KBO 10개 구단 (CSV의 팀 이름과 똑같이 써야 합니다)
const TEAMS = ["두산", "LG", "삼성", "롯데", "KT", "한화", "NC", "KIA", "키움", "SSG"];

// 허용하는 경기 상태 → 화면에 쓸 CSS 클래스 이름
const STATUS_CLASS = {
  "예정": "scheduled",
  "종료": "finished",
  "취소": "canceled",
  "연기": "postponed",
};

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const STORAGE_KEY = "myTeam"; // 응원팀을 브라우저에 저장할 때 쓰는 이름

// ---------- 2. 현재 화면 상태 ----------
const state = {
  games: [],          // CSV에서 읽은 경기 목록
  view: "week",       // "week"(주간) 또는 "month"(월간)
  baseDate: null,     // 지금 보고 있는 기준 날짜
  myTeam: "",         // 응원팀
};

// 자주 쓰는 화면 요소
const $ = (id) => document.getElementById(id);
const teamSelect = $("teamSelect");
const scheduleEl = $("schedule");
const messageEl = $("message");

// ---------- 3. 날짜 도우미 함수 ----------

// "2026-09-01" 문자열 → Date 객체 (시간대 문제를 피하려고 직접 만듭니다)
function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Date 객체 → "2026-09-01" 문자열
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 날짜에 일수를 더한 새 Date 반환
function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

// 그 주의 월요일 구하기 (KBO는 월요일 휴식이라 월~일 기준으로 보여줍니다)
function startOfWeek(date) {
  const diff = (date.getDay() + 6) % 7; // 월=0 ... 일=6
  return addDays(date, -diff);
}

// 실제로 존재하는 날짜인지 확인 (예: 2026-02-31 은 오류)
function isValidDateString(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  return formatDate(parseDate(str)) === str;
}

// ---------- 4. CSV 읽기 ----------

// CSV 한 줄을 쉼표 기준으로 나눕니다 (큰따옴표 안의 쉼표는 무시)
function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

// CSV 전체 글자를 { games, errors } 로 변환
// 잘못된 줄은 건너뛰고 errors에 이유를 모아 둡니다 (화면이 멈추지 않도록)
function parseCsv(text) {
  const games = [];
  const errors = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");

  if (lines.length < 2) {
    errors.push("CSV에 경기 데이터가 없습니다.");
    return { games, errors };
  }

  const header = splitCsvLine(lines[0]);
  const required = ["game_id", "date", "time", "home_team", "away_team", "stadium", "status"];
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    errors.push(`CSV 헤더에 필요한 컬럼이 없습니다: ${missing.join(", ")}`);
    return { games, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row = {};
    header.forEach((name, idx) => (row[name] = cells[idx] || ""));
    const lineNo = i + 1;

    if (required.some((c) => row[c] === "")) {
      errors.push(`${lineNo}번째 줄: 비어 있는 값이 있어 건너뜀`);
    } else if (!isValidDateString(row.date)) {
      errors.push(`${lineNo}번째 줄: 날짜 형식 오류(${row.date})`);
    } else if (!TEAMS.includes(row.home_team) || !TEAMS.includes(row.away_team)) {
      errors.push(`${lineNo}번째 줄: 알 수 없는 팀 이름(${row.home_team} / ${row.away_team})`);
    } else if (!(row.status in STATUS_CLASS)) {
      errors.push(`${lineNo}번째 줄: 알 수 없는 경기 상태(${row.status})`);
    } else if (row.status === "종료" && !(/^\d+$/.test(row.away_score) && /^\d+$/.test(row.home_score))) {
      // 점수 컬럼은 선택 사항: 종료 경기에 점수가 없으면 경기는 보여주되 점수는 '기록 없음'으로 처리
      row.away_score = "";
      row.home_score = "";
      games.push(row);
    } else {
      games.push(row);
    }
  }

  // 날짜, 시간 순으로 정렬
  games.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { games, errors };
}

// ---------- 5. 화면 그리기 ----------

// 경기 카드 하나의 HTML 만들기
function gameCard(g) {
  const cls = STATUS_CLASS[g.status];
  const isMine = state.myTeam && (g.home_team === state.myTeam || g.away_team === state.myTeam);

  // 응원팀 이름은 색을 다르게 표시
  const name = (t) => (t === state.myTeam ? `<span class="my-team-name">${t}</span>` : t);

  // 종료된 경기는 "원정팀 점수 : 홈팀 점수" 형태로, 아니면 "원정팀 vs 홈팀"
  const hasScore = g.status === "종료" && g.away_score !== "" && g.home_score !== "";
  const teamsLine = hasScore
    ? `${name(g.away_team)} <b class="score">${g.away_score}</b> : <b class="score">${g.home_score}</b> ${name(g.home_team)}`
    : `${name(g.away_team)} vs ${name(g.home_team)}`;

  // 카드를 누르면 상세 화면이 열립니다 (키보드: Enter/Space)
  return `
    <div class="game st-${cls}-card ${isMine ? "my-team" : ""}" role="button" tabindex="0" data-id="${g.game_id}">
      <div class="teams">${teamsLine}</div>
      <div class="meta">${g.time} · ${g.stadium}</div>
      <span class="badge st-${cls}">${g.status}</span>
    </div>`;
}

// 하루 칸 하나의 HTML 만들기
function dayCell(date, gamesByDate, extraClass = "") {
  const key = formatDate(date);
  const list = gamesByDate[key] || [];
  const dow = date.getDay();
  const dowClass = dow === 0 ? "sun" : dow === 6 ? "sat" : "";
  const label = state.view === "week" ? `${date.getMonth() + 1}/${date.getDate()}` : `${date.getDate()}`;
  const body = list.length ? list.map(gameCard).join("") : `<div class="no-game">경기 없음</div>`;

  return `
    <div class="day ${extraClass} ${list.length ? "" : "empty"}">
      <div class="day-label ${dowClass}">${label}<span class="dow">(${DAY_NAMES[dow]})</span></div>
      ${body}
    </div>`;
}

// 일정표 전체 그리기
function render() {
  // 날짜별로 경기를 묶어 둡니다 → { "2026-09-01": [경기, 경기...] }
  const gamesByDate = {};
  state.games.forEach((g) => (gamesByDate[g.date] = gamesByDate[g.date] || []).push(g));

  let start, count, title, monthNum = null;

  if (state.view === "week") {
    // 주간: 월요일부터 7일
    start = startOfWeek(state.baseDate);
    count = 7;
    const end = addDays(start, 6);
    title = `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getMonth() + 1}월 ${end.getDate()}일`;
  } else {
    // 월간: 1일이 속한 주의 월요일부터 말일이 속한 주의 일요일까지
    const y = state.baseDate.getFullYear();
    monthNum = state.baseDate.getMonth();
    const first = new Date(y, monthNum, 1);
    const last = new Date(y, monthNum + 1, 0);
    start = startOfWeek(first);
    count = Math.round((addDays(startOfWeek(last), 7) - start) / 86400000);
    title = `${y}년 ${monthNum + 1}월`;
  }

  $("periodTitle").textContent = title;

  // 요일 머리글 (월~일)
  const heads = ["월", "화", "수", "목", "금", "토", "일"]
    .map((d) => `<div class="weekday-head ${d === "일" ? "sun" : d === "토" ? "sat" : ""}">${d}</div>`)
    .join("");

  // 날짜 칸들
  let cells = "";
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    let extra = state.view === "month" ? "is-month-view" : "";
    if (monthNum !== null && date.getMonth() !== monthNum) extra += " other-month";
    cells += dayCell(date, gamesByDate, extra);
  }

  scheduleEl.classList.toggle("has-my-team", Boolean(state.myTeam));
  scheduleEl.innerHTML = heads + cells;
}

// 안내/오류 메시지 표시
function showMessage(html, isError = false) {
  messageEl.hidden = false;
  messageEl.className = "message" + (isError ? " error" : "");
  messageEl.innerHTML = html;
}

// ---------- 6. 사용자 조작 ----------

// 이전/다음 이동 (주간은 7일, 월간은 한 달)
function move(direction) {
  const d = state.baseDate;
  state.baseDate =
    state.view === "week"
      ? addDays(d, 7 * direction)
      : new Date(d.getFullYear(), d.getMonth() + direction, 1);
  render();
}

// 주간/월간 전환
function setView(view) {
  state.view = view;
  $("weekBtn").classList.toggle("active", view === "week");
  $("monthBtn").classList.toggle("active", view === "month");
  render();
}

// 응원팀 저장 (브라우저를 껐다 켜도 유지)
function loadMyTeam() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return TEAMS.includes(saved) ? saved : "";
  } catch (e) {
    return ""; // 저장소를 쓸 수 없는 환경이면 그냥 무시
  }
}
function saveMyTeam(team) {
  try { localStorage.setItem(STORAGE_KEY, team); } catch (e) { /* 무시 */ }
}

// ---------- 7. 경기 상세 화면 ----------
// 상세 기록(이닝별 점수, 타자·투수 기록, 교체)은 data/details/{game_id}.json 파일이 있을 때만 보여줍니다.
// 파일이 없거나 항목이 비어 있으면 임의로 채우지 않고 '기록 없음'으로 표시합니다.
//
// 상세 JSON 형식 (모든 항목은 선택 사항):
// {
//   "innings": { "away": [0,0,1,...], "home": [...], "hits": {"away":5,"home":7}, "errors": {...}, "walks": {...} },
//   "batters": { "away": [ {"order":1,"position":"CF","name":"홍길동","ab":4,"h":2,"rbi":1,"r":1,"results":["좌안","삼진"]} ], "home": [...] },
//   "pitchers": { "away": [ {"name":"..","role":"선발","ip":"6.0","pitches":88,"h":5,"k":7,"r":2,"er":2} ], "home": [...] },
//   "substitutions": [ {"inning":"7회초","team":"NC","type":"투수 교체","text":"○○ → △△"} ]
// }

// 배포 버전에서는 실제 데이터가 없는 상세 기록(이닝·타자·투수·교체) 탭을 숨깁니다.
// 나중에 허용된 데이터가 준비되면 true 로 바꾸면 탭이 다시 나타납니다.
const SHOW_DETAIL_RECORDS = false;

const DETAIL_DIR = "data/details/";
const NO_RECORD = `<span class="no-record">기록 없음</span>`;
const detailEl = $("detail");
let currentDetail = null; // { game, data } 지금 열려 있는 경기

// 글자를 화면에 안전하게 넣기 위한 변환 (외부 JSON 값 보호)
function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// 값이 없으면 '기록 없음', 있으면 그대로 표시
function val(v) {
  return v === undefined || v === null || v === "" ? NO_RECORD : esc(v);
}

// 상세 파일 불러오기: 없으면 null (오류가 아니라 '기록 없음'으로 처리)
async function loadDetail(gameId) {
  try {
    const res = await fetch(DETAIL_DIR + encodeURIComponent(gameId) + ".json");
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// 이닝별 점수표
function renderLineScore(g, data) {
  const inn = data && data.innings;
  const hasInnings = inn && Array.isArray(inn.away) && Array.isArray(inn.home);
  const hasScore = g.status === "종료" && g.away_score !== "";
  const runs = (side) => (hasScore ? g[side + "_score"] : "");

  if (!hasInnings) {
    // 이닝별 기록이 없으면 최종 점수(R)만 보여줍니다
    return `
      <table class="record-table linescore">
        <thead><tr><th>팀</th><th>이닝별 점수</th><th>R</th></tr></thead>
        <tbody>
          <tr><th>${g.away_team}</th><td>${NO_RECORD}</td><td><b>${val(runs("away"))}</b></td></tr>
          <tr><th>${g.home_team}</th><td>${NO_RECORD}</td><td><b>${val(runs("home"))}</b></td></tr>
        </tbody>
      </table>`;
  }

  const n = Math.max(9, inn.away.length, inn.home.length);
  const head = Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join("");
  const row = (side) => {
    const cells = Array.from({ length: n }, (_, i) => `<td>${val(inn[side][i])}</td>`).join("");
    const extra = (k) => `<td>${val(inn[k] && inn[k][side])}</td>`;
    return `<tr><th>${g[side + "_team"]}</th>${cells}<td><b>${val(runs(side))}</b></td>${extra("hits")}${extra("errors")}${extra("walks")}</tr>`;
  };
  return `
    <div class="table-wrap"><table class="record-table linescore">
      <thead><tr><th>팀</th>${head}<th>R</th><th>H</th><th>E</th><th>B</th></tr></thead>
      <tbody>${row("away")}${row("home")}</tbody>
    </table></div>`;
}

// 타자 기록 탭
function renderBatters(g, data) {
  const b = data && data.batters;
  const side = (s) => {
    const list = b && Array.isArray(b[s]) ? b[s] : [];
    const body = list.length
      ? list.map((p) => `<tr>
          <td>${val(p.order)}</td><td>${val(p.position)}</td><td class="left">${val(p.name)}</td>
          <td>${val(p.ab)}</td><td>${val(p.h)}</td><td>${val(p.rbi)}</td><td>${val(p.r)}</td>
          <td class="left">${Array.isArray(p.results) && p.results.length ? p.results.map(esc).join(" · ") : NO_RECORD}</td></tr>`).join("")
      : `<tr><td colspan="8">${NO_RECORD}</td></tr>`;
    return `<h4>${g[s + "_team"]} (${s === "away" ? "원정" : "홈"})</h4>
      <div class="table-wrap"><table class="record-table">
        <thead><tr><th>타순</th><th>포지션</th><th>선수</th><th>타수</th><th>안타</th><th>타점</th><th>득점</th><th>이닝별 타격 결과</th></tr></thead>
        <tbody>${body}</tbody></table></div>`;
  };
  return side("away") + side("home");
}

// 투수 기록 탭
function renderPitchers(g, data) {
  const p = data && data.pitchers;
  const side = (s) => {
    const list = p && Array.isArray(p[s]) ? p[s] : [];
    const body = list.length
      ? list.map((x) => `<tr>
          <td class="left">${val(x.name)}</td><td>${val(x.role)}</td><td>${val(x.ip)}</td><td>${val(x.pitches)}</td>
          <td>${val(x.h)}</td><td>${val(x.k)}</td><td>${val(x.r)}</td><td>${val(x.er)}</td></tr>`).join("")
      : `<tr><td colspan="8">${NO_RECORD}</td></tr>`;
    return `<h4>${g[s + "_team"]} (${s === "away" ? "원정" : "홈"})</h4>
      <div class="table-wrap"><table class="record-table">
        <thead><tr><th>선수</th><th>구분</th><th>투구이닝</th><th>투구 수</th><th>피안타</th><th>탈삼진</th><th>실점</th><th>자책점</th></tr></thead>
        <tbody>${body}</tbody></table></div>`;
  };
  return side("away") + side("home");
}

// 교체 내역 탭
function renderSubs(g, data) {
  const list = data && Array.isArray(data.substitutions) ? data.substitutions : [];
  if (list.length === 0) return `<p class="empty-note">${NO_RECORD}</p>`;
  return `<ul class="sub-list">${list
    .map((s) => `<li><b>${val(s.inning)}</b> ${val(s.team)} · ${val(s.type)}<br>${val(s.text)}</li>`)
    .join("")}</ul>`;
}

// 상세 화면 열기
async function openDetail(gameId) {
  const g = state.games.find((x) => x.game_id === gameId);
  if (!g) return;

  // 상세 기록 기능이 꺼져 있으면(SHOW_DETAIL_RECORDS = false) 상세 파일을 읽지 않습니다
  const data = SHOW_DETAIL_RECORDS && g.status === "종료" ? await loadDetail(gameId) : null;
  currentDetail = { g, data };

  // 탭 영역을 켜거나 끕니다 (기능 코드는 그대로 두고 화면에서만 숨김)
  document.querySelector(".tabs").hidden = !SHOW_DETAIL_RECORDS;
  $("detailBody").hidden = !SHOW_DETAIL_RECORDS;

  const cls = STATUS_CLASS[g.status];
  const hasScore = g.status === "종료" && g.away_score !== "";
  const d = parseDate(g.date);
  $("detailTitle").innerHTML = `${g.away_team} <b class="score">${hasScore ? g.away_score : "-"}</b> : <b class="score">${hasScore ? g.home_score : "-"}</b> ${g.home_team}`;
  $("detailMeta").innerHTML = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일(${DAY_NAMES[d.getDay()]}) ${g.time} · ${g.stadium} <span class="badge st-${cls}">${g.status}</span>${IS_DEMO ? `<br><span class="demo-tag">${DEMO_NOTICE}</span>` : ""}`;
  $("detailLine").innerHTML = renderLineScore(g, data);

  // 경기가 종료되지 않았으면 기록이 있을 수 없으므로 이유를 알려줍니다
  $("detailNote").textContent =
    g.status !== "종료"
      ? `${g.status}된 경기라 경기 기록이 없습니다.`
      : !SHOW_DETAIL_RECORDS
        ? "이닝별 점수와 선수별 상세 기록은 준비 중입니다."
        : data
          ? ""
          : "이 경기의 상세 기록(이닝별 점수, 타자·투수 기록, 교체)은 아직 수집되지 않았습니다.";

  if (SHOW_DETAIL_RECORDS) showTab("batters");
  if (!detailEl.open) detailEl.showModal();
}

// 탭 전환
function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  const { g, data } = currentDetail;
  const html = { batters: renderBatters, pitchers: renderPitchers, subs: renderSubs }[name](g, data);
  $("detailBody").innerHTML = html;
}

// ---------- 8. 시작 ----------
async function init() {
  // 시연용 데이터일 때는 안내 배너를 항상 보여주고, 푸터 문구도 바꿉니다
  if (IS_DEMO) {
    $("demoBanner").hidden = false;
    $("demoBanner").innerHTML = `<b>⚠ ${DEMO_NOTICE}.</b> 구장도 실제 구장이 아닌 시연용 이름입니다.`;
    $("footerNote").textContent = `${DEMO_NOTICE}. 학습용 시연 프로젝트이며 KBO와 무관합니다.`;
  } else {
    document.title += " (로컬 개발용 실제 데이터)";
    $("footerNote").textContent = "로컬 개발용: 실제 2026 데이터(출처: dentearl/kbo-data, 재배포 허가 미확인). 공개 배포 금지.";
  }

  // 구단 선택 목록 채우기
  TEAMS.forEach((t) => teamSelect.add(new Option(t, t)));
  state.myTeam = loadMyTeam();
  teamSelect.value = state.myTeam;

  // 버튼 이벤트 연결
  teamSelect.addEventListener("change", () => {
    state.myTeam = teamSelect.value;
    saveMyTeam(state.myTeam);
    render();
  });
  $("weekBtn").addEventListener("click", () => setView("week"));
  $("monthBtn").addEventListener("click", () => setView("month"));
  $("prevBtn").addEventListener("click", () => move(-1));
  $("nextBtn").addEventListener("click", () => move(1));

  // 경기 카드 클릭/키보드 → 상세 화면 (일정표를 다시 그려도 동작하도록 부모에 연결)
  scheduleEl.addEventListener("click", (e) => {
    const card = e.target.closest(".game");
    if (card) openDetail(card.dataset.id);
  });
  scheduleEl.addEventListener("keydown", (e) => {
    const card = e.target.closest(".game");
    if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDetail(card.dataset.id); }
  });
  // 상세 화면: 탭, 닫기 버튼, 바깥 영역 클릭
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
  $("detailClose").addEventListener("click", () => detailEl.close());
  detailEl.addEventListener("click", (e) => { if (e.target === detailEl) detailEl.close(); });

  // CSV 불러오기
  try {
    const res = await fetch(CSV_PATH);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { games, errors } = parseCsv(await res.text());
    state.games = games;

    if (errors.length > 0) {
      showMessage(
        `일부 데이터에 문제가 있어 건너뛰었습니다.<ul>${errors.map((e) => `<li>${e}</li>`).join("")}</ul>`
      );
    }
  } catch (e) {
    showMessage(
      IS_DEMO
        ? "일정 파일을 불러오지 못했습니다. 파일을 더블클릭해서 여는 대신 로컬 서버로 실행했는지 확인해 주세요. (README 참고)"
        : "실제 데이터 파일(data/kbo_2026_full.csv)이 없습니다. 이 파일은 로컬 개발용이며 배포 사이트에는 없습니다. 주소에서 ?data=real 을 지우면 시연 데이터가 열립니다.",
      true
    );
  }

  // 처음 화면: 시연 데이터는 항상 첫 경기 주. 실제 데이터는 오늘이 기간 안이면 이번 주, 아니면 첫 경기 주
  const today = new Date();
  const first = state.games.length > 0 ? state.games[0].date : "2026-09-08";
  const last = state.games.length > 0 ? state.games[state.games.length - 1].date : first;
  const todayKey = formatDate(today);
  state.baseDate = !IS_DEMO && todayKey >= first && todayKey <= last ? today : parseDate(first);
  render();
}

init();
