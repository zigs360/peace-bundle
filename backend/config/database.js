const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

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
      connectTimeout: 60000
    }
  });
}

module.exports = { sequelize };
