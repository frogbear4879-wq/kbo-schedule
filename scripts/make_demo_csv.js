// 시연용 '가상' 경기 일정 CSV를 만드는 스크립트 (실제 경기와 무관)
// 실행: node scripts/make_demo_csv.js  →  data/demo_games.csv 생성
// 같은 코드를 실행하면 항상 같은 결과가 나옵니다(난수 대신 고정 계산식 사용).
const fs = require("fs");
const path = require("path");

const OUTPUT = path.join(__dirname, "..", "data", "demo_games.csv");
const TEAMS = ["두산", "LG", "삼성", "롯데", "KT", "한화", "NC", "KIA", "키움", "SSG"];

// 가상 일정 기간: 2026-09-08(화) ~ 2026-09-20(일), 월요일은 휴식
const START = new Date(2026, 8, 8);
const END = new Date(2026, 8, 20);

// 가상의 경기 결과: 몇 경기는 취소·연기, 마지막 며칠은 아직 열리지 않은 '예정' 경기
const CANCEL_DAYS = { "2026-09-10": 1, "2026-09-17": 2 }; // 날짜 → 그날 취소할 경기 순번(1부터)
const POSTPONE_DAYS = { "2026-09-12": 3 };
const SCHEDULED_FROM = "2026-09-18";

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 원 돌리기(라운드 로빈) 방식으로 매일 10팀이 5경기를 하도록 짝을 만듭니다
function pairings(round) {
  const t = TEAMS.slice(1);
  const rot = round % 9;
  const order = [TEAMS[0], ...t.slice(9 - rot), ...t.slice(0, 9 - rot)];
  const games = [];
  for (let i = 0; i < 5; i++) {
    let a = order[i], b = order[9 - i];
    if ((i + round) % 2 === 1) [a, b] = [b, a]; // 홈/원정을 번갈아 배정
    games.push({ home: a, away: b });
  }
  return games;
}

// 고정 계산식으로 만든 가상 점수 (0~9점)
function fakeScore(seed) {
  return (seed * 7 + 3) % 10;
}

const rows = [];
let round = 0;
for (let d = new Date(START); d <= END; d.setDate(d.getDate() + 1)) {
  if (d.getDay() === 1) continue; // 월요일 휴식
  const date = fmt(d);
  const time = d.getDay() === 6 || d.getDay() === 0 ? "17:00" : "18:30";

  pairings(round).forEach((g, idx) => {
    const n = idx + 1;
    let status = "종료";
    if (CANCEL_DAYS[date] === n) status = "취소";
    else if (POSTPONE_DAYS[date] === n) status = "연기";
    else if (date >= SCHEDULED_FROM) status = "예정";

    let away = "", home = "";
    if (status === "종료") {
      away = fakeScore(round * 5 + n);
      home = fakeScore(round * 5 + n + 4);
      if (away === home) home += 1; // 무승부 없이 만들기
    }
    rows.push({
      game_id: `DEMO-${date.replace(/-/g, "")}-${n}`,
      date, time,
      home_team: g.home, away_team: g.away,
      stadium: `시연구장(${g.home})`, // 실제 구장이 아님을 이름에서 구분
      status, away_score: away, home_score: home,
    });
  });
  round++;
}

const cols = ["game_id", "date", "time", "home_team", "away_team", "stadium", "status", "away_score", "home_score"];
const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => r[c]).join(","))].join("\n") + "\n";
fs.writeFileSync(OUTPUT, "﻿" + csv, "utf8");
console.log(`가상 경기 ${rows.length}건 생성 → ${OUTPUT}`);
