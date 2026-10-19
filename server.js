const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Starting backend server from root...');

// Attempt to load .env from repository root before spawning child process
try {
  let dotenv = null;
  try {
    dotenv = require('dotenv');
  } catch {
    const backendDotenv = path.join(__dirname, 'backend', 'node_modules', 'dotenv');
    if (fs.existsSync(backendDotenv)) {
      dotenv = require(backendDotenv);
    }
  }

  const rootEnvPath = path.join(__dirname, '.env');
  if (dotenv && fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
    console.log('[Root Server] Environment variables loaded from root .env');
  }
} catch (envErr) {
  console.warn(`[Root Server] Note: .env pre-load skipped: ${envErr.message}`);
}

const child = spawn('node', ['server.js'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  console.log(`Backend server exited with code ${code}`);
  process.exit(code);
});

