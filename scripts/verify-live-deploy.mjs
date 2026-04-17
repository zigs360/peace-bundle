import { execSync } from 'node:child_process';

const siteRoot = process.env.SITE_ROOT || 'https://www.peacebundlle.com';

const safeExec = (command) => {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch (error) {
    return null;
  }
};

const fetchJson = async (url) => {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, error: `${url} -> HTTP ${res.status}` };
    }
    return { ok: true, data: await res.json() };
  } catch (error) {
    return { ok: false, error: `${url} -> ${error.message}` };
  }
};

const short = (value) => (value ? String(value).slice(0, 12) : 'null');

const localHead = safeExec('git rev-parse HEAD');
const localBranch = safeExec('git branch --show-current');
const remoteMain = safeExec('git rev-parse origin/main');
const dirty = safeExec('git status --porcelain');

const frontendMetaUrl = `${siteRoot.replace(/\/$/, '')}/meta.json`;
const backendMetaUrl = `${siteRoot.replace(/\/$/, '')}/api/meta`;

const frontendFetch = await fetchJson(frontendMetaUrl);
const backendFetch = await fetchJson(backendMetaUrl);
const frontendMeta = frontendFetch.ok ? frontendFetch.data : { commit: null, error: frontendFetch.error };
const backendMeta = backendFetch.ok ? backendFetch.data : { commit: null, error: backendFetch.error };

const checks = [
  {
    label: 'Backend matches origin/main',
    ok: Boolean(backendMeta.commit && remoteMain && backendMeta.commit === remoteMain),
    details: `${short(backendMeta.commit)} vs ${short(remoteMain)}`,
  },
  {
    label: 'Frontend matches origin/main',
    ok: Boolean(frontendMeta.commit && remoteMain && frontendMeta.commit === remoteMain),
    details: `${short(frontendMeta.commit)} vs ${short(remoteMain)}`,
  },
  {
    label: 'Backend matches local HEAD',
    ok: Boolean(backendMeta.commit && localHead && backendMeta.commit === localHead),
    details: `${short(backendMeta.commit)} vs ${short(localHead)}`,
  },
  {
    label: 'Frontend matches local HEAD',
    ok: Boolean(frontendMeta.commit && localHead && frontendMeta.commit === localHead),
    details: `${short(frontendMeta.commit)} vs ${short(localHead)}`,
  },
  {
    label: 'Working tree clean',
    ok: !dirty,
    details: dirty ? 'uncommitted changes present' : 'clean',
  },
  {
    label: 'Frontend metadata reachable',
    ok: frontendFetch.ok,
    details: frontendFetch.ok ? short(frontendMeta.commit) : frontendFetch.error,
  },
  {
    label: 'Backend metadata reachable',
    ok: backendFetch.ok,
    details: backendFetch.ok ? short(backendMeta.commit) : backendFetch.error,
  },
];

console.log(`Site root: ${siteRoot}`);
console.log(`Local branch: ${localBranch || 'unknown'}`);
console.log(`Local HEAD: ${localHead || 'unknown'}`);
console.log(`Origin/main: ${remoteMain || 'unknown'}`);
console.log(`Frontend meta: ${frontendMetaUrl}`);
console.log(`Backend meta: ${backendMetaUrl}`);
console.log('');

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label} (${check.details})`);
}

console.log('');
console.log('Frontend build:', frontendMeta);
console.log('Backend build:', backendMeta);

if (checks.some((check) => !check.ok)) {
  process.exitCode = 1;
}
