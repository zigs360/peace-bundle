const { execSync } = require('child_process');

execSync('git config core.hooksPath githooks', { stdio: 'inherit' });
console.log('Git hooks enabled (core.hooksPath=githooks)');

