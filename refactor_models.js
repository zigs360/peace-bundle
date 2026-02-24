const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'backend/models');

if (!fs.existsSync(dir)) {
  console.error('Directory not found:', dir);
  process.exit(1);
}

fs.readdirSync(dir).forEach(file => {
  if (file.endsWith('.js')) {
    const p = path.join(dir, file);
    let c = fs.readFileSync(p, 'utf8');
    let modified = false;

    // Check for single quotes
    if (c.includes("require('../config/db')")) {
      c = c.replace("require('../config/db')", "require('../config/database')");
      modified = true;
    }
    // Check for double quotes
    else if (c.includes('require("../config/db")')) {
      c = c.replace('require("../config/db")', 'require("../config/database")');
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(p, c);
      console.log('Updated ' + file);
    }
  }
});
