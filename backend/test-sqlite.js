const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize('sqlite::memory:', {
  logging: console.log
});

const User = sequelize.define('User', {
  name: DataTypes.STRING
});

async function test() {
  try {
    await sequelize.authenticate();
    console.log('Connected');
    await sequelize.sync({ force: true });
    console.log('Synced');
    await User.create({ name: 'Test' });
    console.log('Created');
  } catch (err) {
    console.error(err);
  }
}

test();