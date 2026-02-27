const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

// FORCE TEST MODE for local testing if requested
if (process.env.FORCE_TEST_DB === 'true') {
  process.env.NODE_ENV = 'test';
}

let sequelize;

if (process.env.NODE_ENV === 'test') {
   sequelize = new Sequelize('sqlite::memory:', {
      logging: false,
      dialect: 'sqlite'
    });
 } else {
  sequelize = new Sequelize(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/peacebundle', {
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      connectTimeout: 60000,
      ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com') ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });
}

module.exports = { sequelize };
