const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

let sequelize;

const normalizeDatabaseUrl = (databaseUrl) => {
  if (!databaseUrl) return databaseUrl;
  try {
    const url = new URL(databaseUrl);
    if (url.hostname && !url.hostname.includes('.')) {
      const renderRegion = process.env.RENDER_REGION;
      if (renderRegion) {
        url.hostname = `${url.hostname}.${renderRegion}-postgres.render.com`;
        return url.toString();
      }
    }
    return databaseUrl;
  } catch (e) {
    void e;
    return databaseUrl;
  }
};

if (process.env.NODE_ENV === 'test') {
   sequelize = new Sequelize('sqlite::memory:', {
      logging: false,
      dialect: 'sqlite'
    });
 } else {
  const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  sequelize = new Sequelize(databaseUrl || 'postgres://postgres:postgres@localhost:5432/peacebundle', {
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
      ssl: databaseUrl && databaseUrl.includes('render.com') ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });
}

module.exports = sequelize; // Export the instance directly
