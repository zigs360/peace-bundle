const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

let sequelize;
if (globalThis.__peacebundle_sequelize) {
  sequelize = globalThis.__peacebundle_sequelize;
} else {
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

  const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  const useTestPostgres = String(process.env.USE_TEST_POSTGRES || 'false').toLowerCase() === 'true';
  if (process.env.NODE_ENV === 'test' && !useTestPostgres) {
    sequelize = new Sequelize('sqlite::memory:', {
      logging: false,
      dialect: 'sqlite',
    });
  } else {
    sequelize = new Sequelize(databaseUrl || 'postgres://postgres:postgres@localhost:5432/peacebundle', {
      dialect: 'postgres',
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      dialectOptions: {
        connectTimeout: 60000,
        ssl:
          databaseUrl && databaseUrl.includes('render.com')
            ? {
                require: true,
                rejectUnauthorized: false,
              }
            : false,
      },
    });
  }

  globalThis.__peacebundle_sequelize = sequelize;
}

module.exports = sequelize; // Export the instance directly
