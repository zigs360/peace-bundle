const http = require('http');
const fs = require('fs');
const path = require('path');

const sessionId = 'manual-va-no-response';
const host = '127.0.0.1';
const startPort = 7777;
const outDir = path.resolve(process.cwd(), '.dbg');
const logFile = path.join(outDir, `trae-debug-log-${sessionId}.ndjson`);
const envFile = path.join(outDir, `${sessionId}.env`);

fs.mkdirSync(outDir, { recursive: true });
try { fs.writeFileSync(logFile, ''); } catch (_) {}

function writeEnvFile(port) {
  const apiUrl = `http://${host}:${port}/event`;
  fs.writeFileSync(envFile, `DEBUG_SERVER_URL=${apiUrl}\nDEBUG_SESSION_ID=${sessionId}\n`);
  return apiUrl;
}

function send(res, status, body) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(body));
}

function startServer(port, retries = 0) {
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    if (req.method === 'GET' && req.url.startsWith('/health')) {
      return send(res, 200, { ok: true, sessionId, logFile });
    }

    if (req.method === 'GET' && req.url.startsWith('/logs')) {
      let lines = [];
      try {
        lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      } catch (_) {}
      return send(res, 200, { sessionId, logs: lines });
    }

    if (req.method === 'DELETE' && req.url.startsWith('/logs')) {
      fs.writeFileSync(logFile, '');
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && req.url.startsWith('/event')) {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8') || '{}';
          const event = JSON.parse(raw);
          if (!event.ts) event.ts = Date.now();
          fs.appendFileSync(logFile, `${JSON.stringify(event)}\n`);
          send(res, 200, { ok: true });
        } catch (e) {
          send(res, 400, { ok: false, error: e.message });
        }
      });
      return;
    }

    send(res, 404, { ok: false, error: 'not_found' });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries < 10) {
      return startServer(port + 1, retries + 1);
    }
    throw err;
  });

  server.listen(port, host, () => {
    const apiUrl = writeEnvFile(port);
    console.log('@@DEBUG_SERVER_INFO');
    console.log(JSON.stringify({
      api_url: apiUrl,
      session_id: sessionId,
      log_dir: outDir,
      log_file: logFile,
      env_file: envFile,
    }, null, 2));
    console.log('@@END_DEBUG_SERVER_INFO');
  });
}

startServer(startPort);
