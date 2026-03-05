const User = require('../models/User');
const Wallet = require('../models/Wallet'); // Import Wallet
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database'); // For transactions
const VirtualAccountService = require('../services/virtualAccountService');
const BvnVerificationService = require('../services/bvnVerificationService');
const ReferralService = require('../services/referralService');
const fs = require('fs');
const path = require('path');
const { encrypt } = require('../utils/cryptoUtils');
const logger = require('../utils/logger');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '30d',
    });
};

const payvesselService = require('../services/payvesselService');

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
    const { name, fullName, email, phone, password, referralCode } = req.body;
    
    // Support both name and fullName fields from frontend
    const userName = name || fullName;

    // Simple validation
    if (!userName || !email || !phone || !password) {
        return res.status(400).json({ 
            success: false,
            message: 'Please include all fields: Name, Email, Phone, and Password' 
        });
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
            return res.status(400).json({ 
                success: false,
                message: 'A user with this email or phone number already exists' 
            });
        }

        // Handle Referral (Optional)
        let referredBy = null;
        let referrerObj = null;
        if (referralCode) {
            try {
                referrerObj = await ReferralService.validateCode(referralCode);
                if (referrerObj) {
                    referredBy = referrerObj.referral_code;
                }
            } catch (refErr) {
                logger.warn(`Referral validation failed for code ${referralCode}: ${refErr.message}`);
            }
        }

        // Generate Referral Code
        const generatedRefCode = await ReferralService.generateUniqueCode(userName);

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

        await t.commit();

        logger.info(`[Auth] New user registered: ${email} (${user.id})`);

        // Track referral reward if applicable
        if (referrerObj) {
            ReferralService.trackReferral(referrerObj, user).catch(err => {
                logger.error(`[Referral] Failed to track referral reward for user ${user.id}: ${err.message}`);
            });
        }

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                token: generateToken(user.id),
                user: {
                    id: user.id,
                    fullName: user.name,
                    email: user.email,
                    phone: user.phone,
                    balance: 0.00,
                    package: user.package,
                    referralCode: user.referral_code,
                    role: user.role,
                    kycStatus: user.kyc_status
                }
            }
        });
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        logger.error(`[Auth] Registration error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Registration failed. Please try again later.' 
        });
    }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    const { emailOrPhone, password } = req.body;

    if (!emailOrPhone || !password) {
        return res.status(400).json({ 
            success: false,
            message: 'Please provide both email/phone and password' 
        });
    }

    try {
        // Find user by email, phone, or name (username)
        const user = await User.findOne({
            where: {
                [Op.or]: [
                    { email: emailOrPhone }, 
                    { phone: emailOrPhone },
                    { name: emailOrPhone }
                ]
            },
            include: [{ model: Wallet, as: 'wallet' }] // Include Wallet
        });

        if (!user) {
            logger.warn(`[Auth] Failed login attempt: User not found for ${emailOrPhone}`);
            return res.status(401).json({ 
                success: false,
                message: 'Invalid email/phone or password' 
            });
        }

        // Check for lockout
        if (user.lockout_until && user.lockout_until > new Date()) {
            const minutesLeft = Math.ceil((user.lockout_until - new Date()) / 60000);
            return res.status(403).json({ 
                success: false,
                message: `Account is temporarily locked due to multiple failed attempts. Please try again in ${minutesLeft} minute(s).` 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            // Reset login attempts on successful login
            await user.update({
                login_attempts: 0,
                lockout_until: null
            });

            logger.info(`[Auth] User logged in: ${user.email} (${user.id})`);

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    token: generateToken(user.id),
                    user: {
                        id: user.id,
                        fullName: user.name,
                        email: user.email,
                        phone: user.phone,
                        balance: user.wallet ? user.wallet.balance : 0,
                        package: user.package,
                        referralCode: user.referral_code,
                        role: user.role,
                        kycStatus: user.kyc_status,
                        avatar: user.avatar
                    }
                }
            });
        } else {
            // Increment failed attempts
            const newAttempts = (user.login_attempts || 0) + 1;
            const updateData = { login_attempts: newAttempts };

            // Lockout after 5 failed attempts
            if (newAttempts >= 5) {
                updateData.lockout_until = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
                updateData.login_attempts = 0; // Reset attempts after lockout
                logger.warn(`[Auth] Account locked for ${user.email} due to 5 failed attempts`);
            }

            await user.update(updateData);

            if (updateData.lockout_until) {
                return res.status(403).json({ 
                    success: false,
                    message: 'Account locked due to multiple failed attempts. Please try again in 15 minutes.' 
                });
            }

            res.status(401).json({ 
                success: false,
                message: 'Invalid email/phone or password' 
            });
        }
    } catch (error) {
        logger.error(`[Auth] Login error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'An internal server error occurred during login' 
        });
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
            return res.status(404).json({ 
                success: false,
                message: 'User profile not found' 
            });
        }

        // Auto-assign virtual account if missing (for existing users)
        if (!user.virtual_account_number) {
            try {
                const accountDetails = await VirtualAccountService.assignVirtualAccount(user);
                if (accountDetails) {
                    user.virtual_account_number = accountDetails.accountNumber;
                    user.virtual_account_bank = accountDetails.bankName;
                    user.virtual_account_name = accountDetails.accountName;
                }
            } catch (err) {
                logger.warn(`[Auth] Failed to auto-assign virtual account for user ${user.id}: ${err.message}`);
            }
        }
        
        // Transform response to flat structure expected by frontend
        const userResponse = user.toJSON();
        userResponse.balance = user.wallet ? user.wallet.balance : 0;
        
        res.json({
            success: true,
            data: userResponse
        });
    } catch (error) {
        logger.error(`[Auth] Profile fetch error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve user profile' 
        });
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
        
        const formattedUsers = users.map(user => ({
            id: user.id,
            fullName: user.name,
            email: user.email,
            phone: user.phone,
            balance: user.wallet ? user.wallet.balance : 0,
            role: user.role,
            createdAt: user.createdAt,
            kycStatus: user.kyc_status,
            avatar: user.avatar
        }));
        
        res.json({
            success: true,
            data: formattedUsers
        });
    } catch (error) {
        logger.error(`[Auth] Admin fetch users error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve users' 
        });
    }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            include: [{ model: Wallet, as: 'wallet' }]
        });

        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        user.name = req.body.fullName || user.name;
        user.email = req.body.email || user.email;
        user.phone = req.body.phone || user.phone;
        
        if (req.file) {
            user.avatar = `uploads/${req.file.filename}`;
        }
        
        const updatedUser = await user.save();
        logger.info(`[Auth] Profile updated for user ${user.id}`);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                id: updatedUser.id,
                fullName: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone,
                balance: updatedUser.wallet ? updatedUser.wallet.balance : 0,
                package: updatedUser.package,
                referralCode: updatedUser.referral_code,
                role: updatedUser.role,
                kycStatus: updatedUser.kyc_status,
                avatar: updatedUser.avatar,
                token: generateToken(updatedUser.id)
            }
        });
    } catch (error) {
        logger.error(`[Auth] Profile update error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to update profile' 
        });
    }
};

// @desc    Change user password
// @route   PUT /api/auth/password
// @access  Private
const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ 
            success: false,
            message: 'Please provide both current and new passwords' 
        });
    }

    try {
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false,
                message: 'Current password provided is incorrect' 
            });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        logger.info(`[Auth] Password changed for user ${user.id}`);

        res.json({ 
            success: true,
            message: 'Password updated successfully' 
        });
    } catch (error) {
        logger.error(`[Auth] Password change error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to update password' 
        });
    }
};

// @desc    Submit KYC Document and BVN
// @route   POST /api/auth/kyc
// @access  Private
const submitKyc = async (req, res) => {
    try {
        const { bvn } = req.body;
        
        if (!bvn) {
            return res.status(400).json({ 
                success: false,
                message: 'BVN is required for verification' 
            });
        }

        if (bvn.length !== 11) {
            return res.status(400).json({ 
                success: false,
                message: 'BVN must be exactly 11 digits' 
            });
        }

        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                message: 'Please upload a valid document (JPG or PDF)' 
            });
        }

        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        logger.info(`[KYC] Submission for User ${req.user.id}: BVN: ${bvn}, File: ${req.file.filename}`);

        // 1. BVN Verification
        let isBvnVerified = false;
        let bvnMessage = '';

        try {
            // Safer name extraction
            const names = (user.name || '').trim().split(/\s+/);
            const firstName = names[0] || 'Customer';
            const lastName = names.length > 1 ? names.slice(1).join(' ') : 'User';

            isBvnVerified = await BvnVerificationService.verifyBvn(bvn, {
                firstName,
                lastName
            });

            if (isBvnVerified) {
                user.bvn = bvn;
                user.is_bvn_verified = true;
                user.bvn_verified_at = new Date();
                bvnMessage = 'BVN verified successfully.';
                logger.info(`[KYC] BVN verified for user ${user.id}`);
            } else {
                bvnMessage = 'BVN verification failed. Please ensure names on BVN match your profile.';
                logger.warn(`[KYC] BVN verification failed for user ${user.id}`);
            }
        } catch (error) {
            bvnMessage = `BVN verification service unavailable: ${error.message}`;
            logger.error(`[KYC] BVN service error for user ${user.id}: ${error.message}`);
        }

        // 2. Document Handling
        try {
            const filePath = req.file.path;
            const fileBuffer = fs.readFileSync(filePath);
            const encryptedBuffer = encrypt(fileBuffer);
            fs.writeFileSync(filePath, encryptedBuffer);
            logger.info(`[KYC] Document encrypted for user ${user.id}`);
        } catch (encryptError) {
            logger.error(`[KYC] Encryption failed for user ${user.id}: ${encryptError.message}`);
        }

        user.kyc_document = `secure_uploads/${req.file.filename}`;
        user.kyc_status = 'pending';
        user.kyc_submitted_at = new Date();
        
        await user.save();

        // 3. Update External Providers
        if (isBvnVerified && user.metadata && user.metadata.payvessel_tracking_reference) {
            payvesselService.updateAccountBvn(user.metadata.payvessel_tracking_reference, bvn).catch(err => {
                logger.error(`[PayVessel] BVN update failed for user ${user.id}: ${err.message}`);
            });
        }

        // 4. Trigger Virtual Account Assignment
        if (isBvnVerified) {
            VirtualAccountService.assignVirtualAccount(user).catch(err => {
                logger.error(`[VirtualAccount] Assignment failed after KYC for user ${user.id}: ${err.message}`);
            });
        }

        res.json({ 
            success: true,
            message: 'KYC submitted successfully and is now pending review.',
            data: {
                bvnMessage,
                kycStatus: user.kyc_status,
                isBvnVerified: user.is_bvn_verified
            }
        });
    } catch (error) {
        logger.error(`[KYC] Submission error for user ${req.user.id}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'An error occurred while submitting KYC' 
        });
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
