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

        // Handle Referral (Optional)
        let referredBy = null;
        let referrerObj = null;
        if (referralCode) {
            referrerObj = await ReferralService.validateCode(referralCode);
            if (referrerObj) {
                referredBy = referrerObj.referral_code;
            }
            // If invalid, we just proceed without linking a referrer
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

        // Track referral reward if applicable
        if (referrerObj) {
            ReferralService.trackReferral(referrerObj, user).catch(err => {
                console.error('Failed to track referral reward:', err);
            });
        }

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
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check for lockout
        if (user.lockout_until && user.lockout_until > new Date()) {
            const minutesLeft = Math.ceil((user.lockout_until - new Date()) / 60000);
            return res.status(403).json({ 
                message: `Account is locked due to multiple failed attempts. Please try again in ${minutesLeft} minute(s).` 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            // Reset login attempts on successful login
            await user.update({
                login_attempts: 0,
                lockout_until: null
            });

            // Log activity for admins
            if (user.role === 'admin') {
                console.log(`[AUDIT] Admin Login: ${user.email} (${user.id}) at ${new Date().toISOString()}`);
            }

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
            // Increment failed attempts
            const newAttempts = (user.login_attempts || 0) + 1;
            const updateData = { login_attempts: newAttempts };

            // Lockout after 5 failed attempts
            if (newAttempts >= 5) {
                updateData.lockout_until = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
                updateData.login_attempts = 0; // Reset attempts after lockout
            }

            await user.update(updateData);

            if (updateData.lockout_until) {
                return res.status(403).json({ 
                    message: 'Account locked due to 5 failed attempts. Please try again in 15 minutes.' 
                });
            }

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
            balance: user.wallet ? user.wallet.balance : 0,
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
            include: [{ model: Wallet, as: 'wallet' }]
        });

        if (user) {
            user.name = req.body.fullName || user.name;
            user.email = req.body.email || user.email;
            user.phone = req.body.phone || user.phone;
            
            // Handle avatar upload
            if (req.file) {
                // We want to store a relative path that can be served
                // multer diskStorage 'path' is the full path. 
                // We just need the filename since we serve the whole uploads folder at /uploads
                user.avatar = `uploads/${req.file.filename}`;
            }
            
            // NOTE: Password update removed from here, use changePassword instead

            const updatedUser = await user.save();

            res.json({
                id: updatedUser.id,
                fullName: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone,
                balance: updatedUser.wallet ? updatedUser.wallet.balance : 0,
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

// @desc    Submit KYC Document and BVN
// @route   POST /api/auth/kyc
// @access  Private
const submitKyc = async (req, res) => {
    try {
        const { bvn } = req.body;
        
        logger.info(`KYC Submission for User ${req.user.id}: BVN: ${bvn}, File: ${req.file ? req.file.filename : 'No File'}`);

        if (!bvn) {
            return res.status(400).json({ message: 'BVN is required' });
        }

        if (bvn.length !== 11) {
            return res.status(400).json({ message: 'BVN must be 11 digits' });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'Please upload a document (JPG or PDF only)' });
        }

        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // 1. Non-blocking BVN Verification
        let isBvnVerified = false;
        let bvnMessage = 'BVN not provided or verification skipped.';

        if (bvn) {
            try {
                const names = user.name ? user.name.split(' ') : ['User', ''];
                const firstName = names[0];
                const lastName = names.length > 1 ? names.slice(1).join(' ') : (user.fullName ? user.fullName.split(' ').slice(1).join(' ') : 'Customer');

                isBvnVerified = await BvnVerificationService.verifyBvn(bvn, {
                    firstName,
                    lastName
                });

                if (isBvnVerified) {
                    user.bvn = bvn;
                    user.is_bvn_verified = true;
                    user.bvn_verified_at = new Date();
                    bvnMessage = 'BVN successfully verified.';
                } else {
                    bvnMessage = 'BVN verification failed. Please check the number and try again.';
                }
            } catch (error) {
                bvnMessage = `BVN verification could not be completed: ${error.message}`;
                logger.warn(`BVN verification failed for user ${user.id}: ${error.message}`);
            }
        }

        // 2. Update user KYC status
        // Secure Document Handling: Encrypt the file for sensitivity
        try {
            const filePath = req.file.path;
            const fileBuffer = fs.readFileSync(filePath);
            const encryptedBuffer = encrypt(fileBuffer);
            
            // Overwrite original file with encrypted data
            fs.writeFileSync(filePath, encryptedBuffer);
            
            logger.info(`KYC Document encrypted and stored: ${req.file.filename}`);
        } catch (encryptError) {
            logger.error('Failed to encrypt KYC document:', encryptError);
            // We continue even if encryption fails for now, but in strict production we might throw
        }

        user.kyc_document = `secure_uploads/${req.file.filename}`;
        user.kyc_status = 'pending';
        user.kyc_submitted_at = new Date();
        
        await user.save();

        // 3. Update PayVessel with BVN if it was successfully verified
        if (isBvnVerified && user.metadata && user.metadata.payvessel_tracking_reference) {
            try {
                await payvesselService.updateAccountBvn(user.metadata.payvessel_tracking_reference, bvn);
                logger.info(`PayVessel BVN updated for user ${user.id}`);
            } catch (err) {
                logger.error(`PayVessel BVN update failed for user ${user.id}:`, err.message);
            }
        }

        // 4. Trigger Virtual Account Assignment if BVN is verified
        if (isBvnVerified) {
            VirtualAccountService.assignVirtualAccount(user).catch(err => {
                console.error(`Automatic Virtual Account Assignment Failed for User ${user.id}:`, err.message);
            });
        }

        res.json({ 
            message: 'KYC document submitted successfully. Your document is now pending review.',
            bvnMessage,
            kycStatus: user.kyc_status,
            kycDocument: user.kyc_document,
            isBvnVerified: user.is_bvn_verified
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
