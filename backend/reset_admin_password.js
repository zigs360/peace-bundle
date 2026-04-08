
const { sequelize, connectDB } = require('./config/db');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

const resetPassword = async () => {
    try {
        await connectDB();
        
        const email = 'admin@peacebundle.com';
        const newPassword = 'admin123';
        
        const user = await User.findOne({ where: { email } });
        
        if (user) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);
            
            user.password = hashedPassword;
            await user.save();
            console.log(`Password for ${email} has been reset to: ${newPassword}`);
        } else {
            console.log(`User ${email} not found.`);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error resetting password:', error);
        process.exit(1);
    }
};

resetPassword();
