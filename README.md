# 야구 경기 일정 한눈에 보기 (KBO 시연 버전)

10개 구단의 경기 일정을 주간/월간으로 보고, 응원팀 경기를 강조해 주는 정적 웹사이트입니다.
HTML + CSS + JavaScript만 사용하며 빌드 과정이 없습니다.

> **⚠ 배포된 사이트의 경기 데이터는 시연용 가상 데이터이며 실제 경기 일정과 결과가 아닙니다.**
> 팀 이름만 실제 구단을 쓰고, 일정·점수·구장은 모두 가상입니다. KBO와 무관한 학습용 프로젝트입니다.

## 기능
- 주간·월간 보기, 기간 이동
- 응원팀 선택·강조(브라우저에 저장)
- 경기 상태(예정/종료/취소/연기) 색상·글자 표시, 종료 경기 최종 점수
- 경기 카드 클릭 시 상세 화면(날짜, 양 팀, 최종 점수)
- 이닝별·선수별 상세 기록은 준비 중 (`app.js`의 `SHOW_DETAIL_RECORDS = false`)

## 데이터 구분
| 구분 | 파일 | GitHub/배포 |
|---|---|---|
| 시연용 가상 데이터 | `data/demo_games.csv` (60경기, 9/8~9/20) | **포함** |
| 실제 2026 일정·점수 (로컬 개발용) | `data/kbo_2026_full.csv` | **제외** (`.gitignore`, `.vercelignore`) |
| 실제 원본 JSON | `data/raw/` | **제외** |

실제 데이터의 출처(https://github.com/dentearl/kbo-data)에는 라이선스가 없고, KBO 사이트의 자동 수집 금지 정책도 있어 재배포 허가를 확인하지 못했습니다. 그래서 공개 배포에는 쓰지 않습니다.

## 로컬 실행
`index.html`을 더블클릭하면 CSV를 읽지 못합니다. 로컬 서버로 실행하세요.
```bash
node server.js
```
- 시연 데이터: http://localhost:5500
- 실제 데이터(로컬 전용): http://localhost:5500/?data=real  (`data/kbo_2026_full.csv`가 있어야 함)

## 시연 데이터 다시 만들기
```bash
node scripts/make_demo_csv.js
```
실제 데이터를 다시 만들려면 원본 JSON을 `data/raw/kbo_2026_source.json`에 내려받은 뒤 `node scripts/convert_kbo.js`를 실행합니다.

## 파일 구성
| 파일 | 설명 |
|---|---|
| `index.html`, `style.css`, `app.js` | 사이트 본체 |
| `data/demo_games.csv` | 시연용 가상 일정 |
| `scripts/make_demo_csv.js` | 시연 데이터 생성 스크립트 |
| `scripts/convert_kbo.js` | (로컬용) 원본 JSON → 실제 데이터 CSV 변환 |
| `vercel.json`, `.vercelignore` | Vercel 정적 배포 설정 |
| `server.js` | 로컬 실행용 서버(배포에는 쓰이지 않음) |
