const User = require('../models/User');
const Wallet = require('../models/Wallet'); // Import Wallet
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db'); // For transactions
const VirtualAccountService = require('../services/virtualAccountService');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '30d',
    });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
    const { name, fullName, email, phone, password, referralCode } = req.body;
    
    // Support both name and fullName fields from frontend
    const userName = name || fullName;

    // Simple validation
    if (!userName || !email || !phone || !password) {
        return res.status(400).json({ message: 'Please include all fields' });
    }

    const t = await sequelize.transaction();

    try {
        // Check if user exists
        const userExists = await User.findOne({
            where: {
                [Op.or]: [{ email }, { phone }]
            }
        });

        if (userExists) {
            await t.rollback();
            return res.status(400).json({ message: 'User already exists' });
        }

        // Handle Referral
        let referredBy = null;
        if (referralCode) {
            const referrer = await User.findOne({ where: { referral_code: referralCode } });
            if (referrer) {
                referredBy = referrer.referral_code;
            }
        }

        // Generate Referral Code
        const generatedRefCode = (userName.substring(0, 3).toUpperCase() + Math.floor(100 + Math.random() * 900)).replace(/\s/g, '');

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = await User.create({
            name: userName,
            email,
            phone,
            password: hashedPassword,
            referral_code: generatedRefCode,
            referred_by: referredBy,
            role: 'user', // Default
            package: 'Standard',
            kyc_status: 'none'
        }, { transaction: t });

        // Wallet is now created automatically via User.afterCreate hook
        // However, since we are inside a transaction, the hook might run outside of it or need special handling.
        // The safest way with hooks + transactions is to either pass the transaction to the hook or
        // since we just need to return the balance (0), we can just fetch it or assume 0.
        // For simplicity and to avoid race conditions with the hook, we can rely on the hook 
        // but since we need to return the wallet balance, we might need to wait or just return 0.
        
        // Wait for wallet creation to ensure it exists if we need to query it immediately
        // Note: Hooks run after the query. If the hook fails, the user is still created unless the hook is part of the transaction.
        // Sequelize hooks don't automatically inherit the transaction unless configured.
        
        // To ensure consistency, we'll manually check/create if hook didn't (or just return 0)
        // But to respect the "auto-create" requirement, we'll assume the hook works.
        // However, to return the balance in the response, we assume 0.

        await t.commit();

        // Attempt to assign virtual account asynchronously (don't block response)
        VirtualAccountService.assignVirtualAccount(user).catch(err => {
            console.error(`Background Virtual Account Assignment Failed for User ${user.id}:`, err.message);
        });

        res.status(201).json({
            token: generateToken(user.id),
            user: {
                id: user.id,
                fullName: user.name,
                email: user.email,
                phone: user.phone,
                balance: 0.00, // Initial balance
                package: user.package,
                referralCode: user.referral_code,
                role: user.role,
                kycStatus: user.kyc_status
            },
            message: 'Registration successful'
        });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    const { emailOrPhone, password } = req.body;

    try {
        // Find user
        const user = await User.findOne({
            where: {
                [Op.or]: [{ email: emailOrPhone }, { phone: emailOrPhone }]
            },
            include: [{ model: Wallet, as: 'wallet' }] // Include Wallet
        });

        if (user && (await bcrypt.compare(password, user.password))) {
            res.json({
                token: generateToken(user.id),
                user: {
                    id: user.id,
                    fullName: user.name,
                    email: user.email,
                    phone: user.phone,
                    balance: user.wallet ? user.wallet.balance : 0, // Access balance from Wallet
                    package: user.package,
                    referralCode: user.referral_code,
                    role: user.role,
                    kycStatus: user.kyc_status,
                    avatar: user.avatar
                },
                message: 'Login successful'
            });
        } else {
            res.status(400).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password'] },
            include: [{ model: Wallet, as: 'wallet' }]
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Auto-assign virtual account if missing (for existing users)
        if (!user.virtual_account_number) {
            try {
                const accountDetails = await VirtualAccountService.assignVirtualAccount(user);
                if (accountDetails) {
                    // Update user object in memory to return latest data
                    user.virtual_account_number = accountDetails.accountNumber;
                    user.virtual_account_bank = accountDetails.bankName;
                    user.virtual_account_name = accountDetails.accountName;
                }
            } catch (err) {
                console.error(`Failed to auto-assign virtual account for user ${user.id}:`, err.message);
                // Continue without it, don't block profile load
            }
        }
        
        // Transform response to flat structure expected by frontend
        const userResponse = user.toJSON();
        userResponse.balance = user.wallet ? user.wallet.balance : 0;
        
        res.json(userResponse);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get all users (Admin)
// @route   GET /api/auth/users
// @access  Private/Admin
const getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: { exclude: ['password'] },
            include: [{ model: Wallet, as: 'wallet' }],
            order: [['createdAt', 'DESC']]
        });
        
        // Format for frontend
        const formattedUsers = users.map(user => ({
            id: user.id,
            fullName: user.name,
            email: user.email,
            phone: user.phone,
            balance: user.Wallet ? user.Wallet.balance : 0,
            role: user.role,
            createdAt: user.createdAt,
            kycStatus: user.kyc_status,
            avatar: user.avatar
        }));
        
        res.json(formattedUsers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            include: [{ model: Wallet }]
        });

        if (user) {
            user.name = req.body.fullName || user.name;
            user.email = req.body.email || user.email;
            user.phone = req.body.phone || user.phone;
            
            // Handle avatar upload
            if (req.file) {
                // If using local storage, path will be 'uploads/filename'
                // We want to store relative path or full URL.
                // Storing relative path is more flexible.
                // Windows uses backslashes, replace with forward slashes for URL
                user.avatar = req.file.path.replace(/\\/g, '/');
            }
            
            // NOTE: Password update removed from here, use changePassword instead

            const updatedUser = await user.save();

            res.json({
                id: updatedUser.id,
                fullName: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone,
                balance: updatedUser.Wallet ? updatedUser.Wallet.balance : 0,
                package: updatedUser.package,
                referralCode: updatedUser.referral_code,
                role: updatedUser.role,
                kycStatus: updatedUser.kyc_status,
                avatar: updatedUser.avatar, // Include avatar in response
                token: generateToken(updatedUser.id)
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Change user password
// @route   PUT /api/auth/password
// @access  Private
const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Please provide current and new password' });
    }

    try {
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid current password' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Submit KYC Document
// @route   POST /api/auth/kyc
// @access  Private
const submitKyc = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Please upload a document' });
        }

        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update user KYC status
        user.kyc_document = req.file.path.replace(/\\/g, '/');
        user.kyc_status = 'pending';
        user.kyc_submitted_at = new Date();
        
        await user.save();

        res.json({ 
            message: 'KYC document submitted successfully. Pending review.',
            kycStatus: user.kyc_status,
            kycDocument: user.kyc_document
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
    getAllUsers,
    updateProfile,
    changePassword,
    submitKyc
};
