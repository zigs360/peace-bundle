const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const parseArgs = (argv) => {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[name] = true;
    } else {
      args[name] = next;
      i++;
    }
  }
  return args;
};

const nowMs = () => Date.now();

const safeMkdir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const writeEnvFile = (outdir, sessionId, apiUrl) => {
  const envPath = path.join(outdir, `${sessionId}.env`);
  fs.writeFileSync(envPath, `DEBUG_SERVER_URL=${apiUrl}\nDEBUG_SESSION_ID=${sessionId}\n`, 'utf8');
  return envPath;
};

const appendNdjson = (filePath, obj) => {
  fs.appendFileSync(filePath, `${JSON.stringify(obj)}\n`, 'utf8');
};

const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface && iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
};

const main = () => {
  const args = parseArgs(process.argv);
  const sessionId = String(args.session || '').trim();
  if (!sessionId) {
    process.stderr.write('Missing --session\n');
    process.exit(2);
  }

  const outdir = path.resolve(process.cwd(), String(args.outdir || '.dbg'));
  const clean = Boolean(args.clean);
  const idleSeconds = Number.isFinite(Number(args.idle)) ? Number(args.idle) : 0;
  const remote = Boolean(args.remote);
  const host = remote ? '0.0.0.0' : '127.0.0.1';
  const basePort = Number.isFinite(Number(args.port)) ? Number(args.port) : 7777;

  safeMkdir(outdir);
  const logFile = path.join(outdir, `trae-debug-log-${sessionId}.ndjson`);
  if (clean && fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, '', 'utf8');
  }

  let lastEventAt = nowMs();
  let idleTimer = null;
  const resetIdle = () => {
    lastEventAt = nowMs();
  };
  const scheduleIdle = () => {
    if (!idleSeconds || idleSeconds <= 0) return;
    if (idleTimer) clearInterval(idleTimer);
    idleTimer = setInterval(() => {
      if (nowMs() - lastEventAt > idleSeconds * 1000) {
        process.exit(0);
      }
    }, 1000);
  };

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const startServer = (port, attempt = 0) => {
    if (attempt > 10) {
      process.stderr.write('Failed to bind debug server port\n');
      process.exit(3);
    }

    const server = http.createServer((req, res) => {
      if (req.method === 'OPTIONS' && req.url === '/event') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      if (req.method !== 'POST' || req.url !== '/event') {
        res.writeHead(404, corsHeaders);
        res.end('not found');
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          res.writeHead(413, corsHeaders);
          res.end('payload too large');
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const event = {
            sessionId,
            ts: typeof parsed.ts === 'number' ? parsed.ts : nowMs(),
            runId: String(parsed.runId || 'unknown'),
            hypothesisId: String(parsed.hypothesisId || 'unknown'),
            msg: String(parsed.msg || ''),
            data: parsed.data ?? null,
          };
          appendNdjson(logFile, event);
          resetIdle();
          res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
        }
      });
    });

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        startServer(port + 1, attempt + 1);
        return;
      }
      process.stderr.write(`${String(err?.message || err)}\n`);
      process.exit(4);
    });

    server.listen(port, host, () => {
      const actualHost = remote ? getLocalIp() : '127.0.0.1';
      const apiUrl = `http://${actualHost}:${port}/event`;
      const envFile = writeEnvFile(outdir, sessionId, apiUrl);

      process.stdout.write('@@DEBUG_SERVER_INFO\n');
      process.stdout.write(JSON.stringify({
        api_url: apiUrl,
        session_id: sessionId,
        log_dir: outdir,
        log_file: logFile,
        env_file: envFile,
      }, null, 2));
      process.stdout.write('\n@@END_DEBUG_SERVER_INFO\n');

      scheduleIdle();
    });
  };

  startServer(basePort, 0);
};

main();

