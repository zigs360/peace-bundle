const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

let sequelize;
if (globalThis.__peacebundle_sequelize) {
  sequelize = globalThis.__peacebundle_sequelize;
} else {
  let databaseUrl = process.env.DATABASE_URL;
  const useTestPostgres = String(process.env.USE_TEST_POSTGRES || 'false').toLowerCase() === 'true';
  if (process.env.NODE_ENV === 'test' && !useTestPostgres) {
    sequelize = new Sequelize('sqlite::memory:', {
      logging: false,
      dialect: 'sqlite',
    });
  } else {
    // Render internal hostnames (dpg-*) usually do not require SSL
    // Render external URLs (*.render.com) always require SSL
    const isRenderExternal = databaseUrl && databaseUrl.includes('render.com');
    const isRenderInternal = databaseUrl && databaseUrl.includes('dpg-');
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Only use SSL for external Render URLs or non-local production connections that aren't internal
    const useSSL = isRenderExternal || (isProduction && databaseUrl && !databaseUrl.includes('localhost') && !isRenderInternal);
    
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
        ssl: useSSL
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
