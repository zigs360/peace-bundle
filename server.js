const { spawn } = require('child_process');
const path = require('path');

console.log('Starting backend server from root...');

const child = spawn('node', ['server.js'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  console.log(`Backend server exited with code ${code}`);
  process.exit(code);
});

