const { sequelize } = require('./config/db');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

const updatePassword = async () => {
  try {
    await sequelize.authenticate();
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    await User.update(
      { password: hashedPassword },
      { where: { email: 'admin@peacebundle.com' } }
    );

    console.log('✅ Admin password updated to: admin123');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
};

updatePassword();
