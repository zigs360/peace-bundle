module.exports = async () => {
  try {
    const { sequelize } = require('../config/db');
    await sequelize.close();
  } catch (e) {
  }
};
