const { execSync } = require('child_process');

const patterns = [
  /OGDAMS_API_KEY\s*=\s*.+/i,
  /PAYVESSEL_(API_KEY|SECRET_KEY|BUSINESS_ID)\s*=\s*.+/i,
  /BILLSTACK_(SECRET_KEY|PUBLIC_KEY|WEBHOOK_SECRET)\s*=\s*.+/i,
  /SMEPLUG_(API_KEY|SECRET_KEY|PUBLIC_KEY)\s*=\s*.+/i,
  /JWT_SECRET\s*=\s*.+/i,
  /DATABASE_URL\s*=\s*.+/i,
  /sk_(live|test)_[0-9a-zA-Z]+/,
  /Bearer\s+[0-9a-zA-Z\-_\.]{20,}/
];

const allowlist = [
  /your_/i,
  /test_secret/i,
  /sqlite::memory:/i,
  /postgres:\/\/postgres:password@/i
];

const getStaged = () => {
  const out = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
  if (!out) return [];
  return out.split(/\r?\n/).filter(Boolean);
};

const getFile = (path) => {
  try {
    return execSync(`git show :${path}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

const main = () => {
  const files = getStaged();
  const violations = [];

  for (const f of files) {
    if (f.endsWith('.env.example')) continue;
    const content = getFile(f);
    if (!content) continue;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().startsWith('#')) continue;
      const matches = patterns.some((p) => p.test(line));
      if (!matches) continue;
      const ok = allowlist.some((a) => a.test(line));
      if (!ok) violations.push({ file: f, line: i + 1, text: line.trim().slice(0, 200) });
    }
  }

  if (violations.length) {
    console.error('Commit blocked: potential secrets detected in staged changes.');
    for (const v of violations) {
      console.error(`- ${v.file}:${v.line} ${v.text}`);
    }
    process.exit(1);
  }
};

main();
