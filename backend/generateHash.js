const bcrypt = require('bcryptjs');

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    console.log(`Password: ${password} -> Hash: ${hash}`);
};

hashPassword('password123');
hashPassword('admin123');
