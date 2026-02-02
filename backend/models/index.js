const fs = require('fs');
const path = require('path');
const basename = path.basename(__filename);
const db = {};

// Read all files in current directory
fs
  .readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 && // Ignore hidden files
      file !== basename && // Ignore this file
      file.slice(-3) === '.js' && // Only .js files
      file.indexOf('.test.js') === -1 // Ignore tests
    );
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file));
    // Add to db object using model name
    if (model.name) {
        db[model.name] = model;
    }
  });

module.exports = db;
