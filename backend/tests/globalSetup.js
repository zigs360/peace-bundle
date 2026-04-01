module.exports = async () => {
  const { connectDB } = require('../config/db');
  await connectDB();
};

