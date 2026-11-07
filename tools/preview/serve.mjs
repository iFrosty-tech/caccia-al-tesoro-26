// Local preview server for the site (no dependencies).
//   node tools/preview/serve.mjs                 the real site on :8080 (real Apps Script backend)
//   node tools/preview/serve.mjs --demo          on :8081 with an in-page fake backend (demo.js):
//                                                any username/password works, nothing reaches the
//                                                Google Sheet, and the video download is slowed
//                                                down so the loader can be watched
//   --port <n>                                   another port
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const DEMO = args.includes("--demo");
const PORT = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : DEMO ? 8081 : 8080;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

// Demo only: encrypted media trickles at ~2.5 MB/s so the download crystal can be watched.
function send(stream, res) {
  if (!DEMO) return stream.pipe(res);
  const RATE = 2.5 * 1024 * 1024;
  stream.on("data", (chunk) => {
    stream.pause();
    res.write(chunk);
    setTimeout(() => stream.resume(), (chunk.length / RATE) * 1000);
  });
  stream.on("end", () => res.end());
  res.on("close", () => stream.destroy());
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg",
  ".webp": "image/webp", ".enc": "application/octet-stream",
};

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (DEMO && url.pathname === "/__demo.js") {
    res.writeHead(200, { "Content-Type": TYPES[".js"], "Cache-Control": "no-store" });
    return res.end(fs.readFileSync(path.join(HERE, "demo.js")));
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
  const type = TYPES[path.extname(file)] || "application/octet-stream";

  if (DEMO && file.endsWith(".html")) {
    // The fake backend must be installed before config.js and app.js run.
    const html = fs.readFileSync(file, "utf8").replace(
      /(<script src="(\.\.\/)?config\.js(\?[^"]*)?">)/,
      '<script src="/__demo.js"></script>\n  $1'
    );
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    return res.end(html);
  }

  const stat = fs.statSync(file);
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": "no-store" });
    const part = fs.createReadStream(file, { start, end });
    return file.endsWith(".enc") ? send(part, res) : part.pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
  const whole = fs.createReadStream(file);
  file.endsWith(".enc") ? send(whole, res) : whole.pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}/${DEMO ? "  (backend finto)" : ""}`));
