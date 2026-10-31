const { QueryTypes } = require('sequelize');

/**
 * Fast, lightweight column inspector for PostgreSQL.
 * Replaces Sequelize's heavy `describeTable` (which joins multiple information_schema and pg_catalog views,
 * taking ~2.5s on remote databases) with a sub-millisecond query against pg_attribute.
 * Falls back to queryInterface.describeTable for SQLite or other dialects.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {string} tableName
 * @returns {Promise<Record<string, boolean|object>>}
 */
const getTableColumnsFast = async (sequelize, tableName) => {
  if (!sequelize) return {};
  const dialect = typeof sequelize.getDialect === 'function' ? sequelize.getDialect() : null;

  if (dialect === 'postgres') {
    try {
      const cleanName = String(tableName || '').replace(/["']/g, '').trim();
      const rows = await sequelize.query(
        `SELECT attname AS column_name 
         FROM pg_attribute 
         WHERE attrelid = (
           SELECT oid FROM pg_class 
           WHERE (relname = :table OR relname = lower(:table))
             AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
           LIMIT 1
         )
         AND attnum > 0 
         AND NOT attisdropped;`,
        {
          replacements: { table: cleanName },
          type: QueryTypes.SELECT,
        }
      );

      if (Array.isArray(rows) && rows.length > 0) {
        const desc = {};
        for (const r of rows) {
          desc[r.column_name] = true;
        }
        return desc;
      }
      return {};
    } catch (_) {
      // Fall through to standard describeTable if catalog query encounters error
    }
  }

  try {
    const qi = sequelize.getQueryInterface();
    return (await qi.describeTable(tableName)) || {};
  } catch (error) {
    return {};
  }
};

/**
 * Fast table existence check for PostgreSQL.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {string} tableName
 * @returns {Promise<boolean>}
 */
const hasTableFast = async (sequelize, tableName) => {
  if (!sequelize) return false;
  const dialect = typeof sequelize.getDialect === 'function' ? sequelize.getDialect() : null;

  if (dialect === 'postgres') {
    try {
      const cleanName = String(tableName || '').replace(/["']/g, '').trim();
      const rows = await sequelize.query(
        `SELECT 1 FROM pg_class 
         WHERE (relname = :table OR relname = lower(:table))
           AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
         LIMIT 1;`,
        {
          replacements: { table: cleanName },
          type: QueryTypes.SELECT,
        }
      );
      return Array.isArray(rows) && rows.length > 0;
    } catch (_) {}
  }

  try {
    const qi = sequelize.getQueryInterface();
    await qi.describeTable(tableName);
    return true;
  } catch (_) {
    return false;
  }
};

module.exports = {
  getTableColumnsFast,
  hasTableFast,
};
