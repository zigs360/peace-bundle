const { sequelize } = require('./config/db');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

const debugLogin = async () => {
  try {
    await sequelize.authenticate();
    console.log('DB Connected');

    const email = 'admin@peacebundle.com';
    const password = 'password123';

    const user = await User.findOne({ where: { email } });

    if (!user) {
      console.log('❌ User not found:', email);
      return;
    }

    console.log('✅ User found:', user.email);
    console.log('🔑 Stored Hash:', user.password);

    const isMatch = await bcrypt.compare(password, user.password);
    console.log('❓ Password Match Result:', isMatch);

    if (isMatch) {
      console.log('✅ Login Logic Verification Passed');
    } else {
      console.log('❌ Password Mismatch');
      
      // Test generation again to compare
      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(password, salt);
      console.log('🆕 New Hash for same password:', newHash);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
};

debugLogin();
