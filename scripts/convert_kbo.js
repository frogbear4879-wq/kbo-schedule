// 2026 KBO 원본 JSON(dentearl/kbo-data)을 웹사이트용 CSV로 바꾸는 스크립트
// 실행: node scripts/convert_kbo.js
const fs = require("fs");
const path = require("path");

const SOURCE = path.join(__dirname, "..", "data", "raw", "kbo_2026_source.json");
const OUTPUT = path.join(__dirname, "..", "data", "kbo_2026_full.csv");

// 원본의 팀 약어 → 웹사이트에서 쓰는 팀 이름
const TEAM_NAMES = {
  DOO: "두산", LG: "LG", SAM: "삼성", LOT: "롯데", KT: "KT",
  HAN: "한화", NC: "NC", KIA: "KIA", KIW: "키움", SSG: "SSG",
};

// 원본에는 구장 정보가 없어서, 홈팀의 연고 구장으로 채웁니다 (추정값)
const HOME_STADIUMS = {
  두산: "잠실", LG: "잠실", 삼성: "대구", 롯데: "사직", KT: "수원",
  한화: "대전", NC: "창원", KIA: "광주", 키움: "고척", SSG: "문학",
};

// 원본 상태 → 웹사이트 상태. 원본에 'Final'과 'Postponed'만 있고 그 외는 판단하지 않습니다.
// 'Postponed'이면서 isCancelled=true 인 경기는 '취소'로 봅니다. (기존 샘플 CSV의 9/3 NC-KIA도 취소)
// 원본에는 '취소'와 '연기'를 따로 구분하는 값이 없어, isCancelled가 없는 Postponed만 '연기'로 둡니다.
function toStatus(g) {
  const s = g.status.detailedState;
  if (s === "Final") return "종료";
  if (s === "Postponed") return g.isCancelled === true ? "취소" : "연기";
  return null; // 알 수 없는 상태는 변환하지 않고 보고
}

const source = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
const report = { total: source.length, skipped: [], duplicates: [] };
const seen = new Set();
const rows = [];

for (const g of source) {
  const away = TEAM_NAMES[g.teams.away.team.abbrev];
  const home = TEAM_NAMES[g.teams.home.team.abbrev];
  const status = toStatus(g);
  if (!away || !home || !status || g.isPostseason) {
    report.skipped.push(g.gamePk);
    continue;
  }
  // 같은 경기 ID가 두 번 나오면 첫 번째만 사용
  if (seen.has(g.gamePk)) { report.duplicates.push(g.gamePk); continue; }
  seen.add(g.gamePk);

  rows.push({
    game_id: g.gamePk,
    date: g.officialDate,
    time: g.gameDate.slice(11, 16), // "2026-03-28T14:00:00+09:00" → "14:00" (한국시간)
    home_team: home,
    away_team: away,
    stadium: HOME_STADIUMS[home],
    status,
    // 최종 점수 (종료된 경기만 값이 있고, 취소 경기는 빈 칸)
    away_score: status === "종료" ? g.teams.away.score : "",
    home_score: status === "종료" ? g.teams.home.score : "",
  });
}

// 날짜 → 시간 → game_id 순서로 정렬
rows.sort((a, b) => (a.date + a.time + a.game_id).localeCompare(b.date + b.time + b.game_id));

const cols = ["game_id", "date", "time", "home_team", "away_team", "stadium", "status", "away_score", "home_score"];
const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => r[c]).join(","))].join("\n") + "\n";
fs.writeFileSync(OUTPUT, "﻿" + csv, "utf8"); // BOM을 붙여 엑셀에서도 한글이 깨지지 않게 함

console.log(`원본 ${report.total}건 → CSV ${rows.length}건`);
console.log("건너뜀:", report.skipped.length, "중복 제거:", report.duplicates.length);
