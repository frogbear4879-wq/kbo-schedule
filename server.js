// 로컬에서 사이트를 열어 보기 위한 아주 작은 서버 (Node.js 필요)
// 실행: node server.js  →  브라우저에서 http://localhost:5500 접속
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 5500;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

http.createServer((req, res) => {
  // 주소가 "/" 이면 index.html 을 보여줌
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath);

  // 프로젝트 폴더 밖의 파일은 접근 금지
  if (!file.startsWith(__dirname)) { res.writeHead(403); return res.end("Forbidden"); }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT} 에서 실행 중 (종료: Ctrl+C)`));
