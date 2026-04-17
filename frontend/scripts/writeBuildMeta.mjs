import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const outputPath = path.join(publicDir, 'meta.json');

const safeExec = (command) => {
  try {
    return execSync(command, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch (error) {
    return null;
  }
};

const commit =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.RENDER_GIT_COMMIT ||
  process.env.GIT_COMMIT ||
  safeExec('git rev-parse HEAD') ||
  null;

const branch =
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.RENDER_GIT_BRANCH ||
  process.env.GIT_BRANCH ||
  safeExec('git branch --show-current') ||
  null;

const meta = {
  app: 'frontend',
  env: process.env.NODE_ENV || 'production',
  commit,
  branch,
  time: new Date().toISOString(),
};

mkdirSync(publicDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

console.log(`Wrote frontend build metadata to ${outputPath}`);
