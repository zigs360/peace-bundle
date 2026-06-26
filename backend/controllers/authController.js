const User = require('../models/User');
const Wallet = require('../models/Wallet'); // Import Wallet
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db'); // Use config/db.js instead of database.js to ensure associations are loaded
const VirtualAccountService = require('../services/virtualAccountService');
const BvnVerificationService = require('../services/bvnVerificationService');
const ReferralService = require('../services/referralService');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { encrypt } = require('../utils/cryptoUtils');
const logger = require('../utils/logger');
const walletService = require('../services/walletService');
const passwordResetService = require('../services/passwordResetService');
const welcomeEmailService = require('../services/welcomeEmailService');
const {
    setAuthCookies,
    clearAuthCookies,
    getRefreshTokenFromRequest,
} = require('../utils/authCookies');

const SENSITIVE_USER_FIELDS = [
    'password',
    'two_factor_secret',
    'transaction_pin_hash',
    'transaction_pin_failed_attempts',
    'transaction_pin_locked_until',
    'transaction_pin_last_changed_at',
    'transaction_pin_last_verified_at',
    'transaction_pin_recovery_otp_hash',
    'transaction_pin_recovery_otp_expires_at',
    'transaction_pin_recovery_otp_sent_at',
];

const mapUserForClient = (user) => ({
    id: user.id,
    fullName: user.name,
    email: user.email,
    phone: user.phone,
    balance: user.wallet ? user.wallet.balance : 0,
    package: user.package,
    referralCode: user.referral_code,
    role: user.role,
    kycStatus: user.kyc_status,
    avatar: user.avatar || null,
    hasTransactionPin: Boolean(user.transaction_pin_hash),
});

const hashRefreshToken = (token) => (
    crypto.createHash('sha256').update(String(token || '')).digest('hex')
);

const getStoredRefreshTokens = (metadata) => {
    const refreshTokens = Array.isArray(metadata?.refreshTokens) ? metadata.refreshTokens : [];
    return refreshTokens
        .map((token) => String(token || '').trim())
        .filter(Boolean);
};

const refreshTokenMatches = (storedToken, candidateToken) => {
    const normalizedStored = String(storedToken || '').trim();
    const normalizedCandidate = String(candidateToken || '').trim();
    if (!normalizedStored || !normalizedCandidate) return false;
    const candidateHash = hashRefreshToken(normalizedCandidate);
    return normalizedStored === normalizedCandidate || normalizedStored === candidateHash;
};

const storeHashedRefreshToken = (metadata, refreshToken) => {
    const existing = getStoredRefreshTokens(metadata).filter((token) => !refreshTokenMatches(token, refreshToken));
    return [...existing.slice(-9), hashRefreshToken(refreshToken)];
};

const removeRefreshTokenFromStore = (metadata, refreshToken) => (
    getStoredRefreshTokens(metadata).filter((token) => !refreshTokenMatches(token, refreshToken))
);

const buildVirtualAccountProfileState = async (user) => {
    const hasDisplayableVirtualAccount = VirtualAccountService.isDisplayableVirtualAccount(user);
    if (hasDisplayableVirtualAccount) {
        return {
            hasDisplayableVirtualAccount: true,
            virtualAccountStatus: {
                code: 'ALREADY_ASSIGNED',
                message: 'Virtual account is assigned.',
            },
        };
    }

    const readiness = await VirtualAccountService.getProvisioningReadiness(user);
    return {
        hasDisplayableVirtualAccount: false,
        virtualAccountStatus: {
            code: readiness.code,
            message: readiness.message,
        },
    };
};

const attachRecoveredWallet = async (user) => {
    if (!user) return null;
    if (user.wallet) return user.wallet;

    const wallet = await walletService.ensureWallet(user);
    user.wallet = wallet;
    return wallet;
};

// Generate JWT Access Token (short-lived)
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '15m',
    });
};

// Generate JWT Refresh Token (long-lived)
const generateRefreshToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

const payvesselService = require('../services/payvesselService');

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
    const { name, fullName, email, phone, password, referralCode, referralClickToken } = req.body;
    // #region debug-point A:register-entry
    (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='referral-workflow';for(const p of ['.dbg/referral-workflow.env','../.dbg/referral-workflow.env','../../.dbg/referral-workflow.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'authController.js:registerUser',msg:'[DEBUG] Registration entered with referral context',data:{hasReferralCode:Boolean(referralCode),referralCode:referralCode||null,email:String(email||'').trim().toLowerCase()||null,phone:phone||null},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    
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
                // #region debug-point A:referral-validation
                (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='referral-workflow';for(const p of ['.dbg/referral-workflow.env','../.dbg/referral-workflow.env','../../.dbg/referral-workflow.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'authController.js:registerUser',msg:'[DEBUG] Referral code validation completed',data:{inputReferralCode:referralCode||null,referrerFound:Boolean(referrerObj),referrerId:referrerObj?.id||null,referredBy:referredBy||null},ts:Date.now()})}).catch(()=>{})})();
                // #endregion
            } catch (refErr) {
                logger.warn(`Referral validation failed for code ${referralCode}: ${refErr.message}`);
            }
        }

        // Generate Referral Code
        const generatedRefCode = await ReferralService.generateUniqueCode(userName);

        // Hash password
        const saltRounds = process.env.NODE_ENV === 'test' ? 4 : 10;
        const salt = await bcrypt.genSalt(saltRounds);
        const hashedPassword = await bcrypt.hash(password, salt);

        const tokenPayloadEmail = String(email || '').trim().toLowerCase();

        // Create user
        const user = await User.create({
            name: userName,
            email: tokenPayloadEmail,
            phone,
            password: hashedPassword,
            referral_code: generatedRefCode,
            referred_by: referredBy,
            role: 'user', // Default
            package: 'Standard',
            kyc_status: 'none'
        }, { transaction: t });
        // #region debug-point B:user-created-with-referral
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='referral-workflow';for(const p of ['.dbg/referral-workflow.env','../.dbg/referral-workflow.env','../../.dbg/referral-workflow.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'B',location:'authController.js:registerUser',msg:'[DEBUG] User created with referral fields',data:{userId:user?.id||null,referralCode:user?.referral_code||null,referredBy:user?.referred_by||null,referrerId:referrerObj?.id||null},ts:Date.now()})}).catch(()=>{})})();
        // #endregion

        const token = generateToken(user.id);
        const refreshToken = generateRefreshToken(user.id);

        // Persist hashed refresh tokens so a DB leak does not expose active sessions.
        const userMeta = user.metadata || {};
        const refreshTokens = storeHashedRefreshToken(userMeta, refreshToken);
        await user.update({
            metadata: {
                ...userMeta,
                refreshTokens,
            }
        }, { transaction: t });

        await t.commit();

        logger.info(`[Auth] New user registered: ${tokenPayloadEmail} (${user.id})`);

        const emailValidationPassed = welcomeEmailService.isValidEmail(tokenPayloadEmail);

        // Track referral reward if applicable
        if (referrerObj) {
            ReferralService.trackReferral(referrerObj, user, { referralClickToken: referralClickToken || null }).catch(err => {
                logger.error(`[Referral] Failed to track referral reward for user ${user.id}: ${err.message}`);
            });
        }

        if (emailValidationPassed) {
            welcomeEmailService.sendWelcomeEmailForUser(user, {
                ip: req.ip || null,
                userAgent: req.get('user-agent') || null,
            }).catch((err) => {
                logger.error('[Auth] Welcome email dispatch error', {
                    userId: user.id,
                    message: err.message,
                });
            });
        } else {
            logger.warn('[Auth] Skipping welcome email due to invalid email format', {
                userId: user.id,
                email: tokenPayloadEmail,
            });
        }

        setAuthCookies(res, { accessToken: token, refreshToken });
        res.status(201).json({
            success: true,
            user: mapUserForClient({ ...user.toJSON(), wallet: { balance: 0.00 } }),
            message: 'Registration successful'
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

// @desc    Track referral link click
// @route   POST /api/auth/referral/click
// @access  Public
const trackReferralClick = async (req, res) => {
    try {
        const referralCode = String(req.body?.referralCode || '').trim();
        const clickToken = String(req.body?.clickToken || '').trim();
        const landingPath = String(req.body?.landingPath || '').trim() || null;
        const source = String(req.body?.source || '').trim() || null;

        const result = await ReferralService.trackClick({
            referralCode,
            clickToken,
            landingPath,
            source,
            ip: req.ip || null,
            userAgent: req.get('user-agent') || null,
        });

        return res.status(202).json({
            success: true,
            tracked: Boolean(result.tracked),
        });
    } catch (error) {
        logger.error('[Referral] Failed to track click', {
            message: error.message,
        });
        return res.status(202).json({
            success: true,
            tracked: false,
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

        await attachRecoveredWallet(user);

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

            const token = generateToken(user.id);
            const refreshToken = generateRefreshToken(user.id);

            const userMeta = user.metadata || {};
            const refreshTokens = storeHashedRefreshToken(userMeta, refreshToken);
            await user.update({
                metadata: {
                    ...userMeta,
                    refreshTokens,
                }
            });

            setAuthCookies(res, { accessToken: token, refreshToken });
            res.json({
                success: true,
                user: mapUserForClient(user),
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
            attributes: { exclude: SENSITIVE_USER_FIELDS },
            include: [{ model: Wallet, as: 'wallet' }]
        });
        
        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User profile not found' 
            });
        }

        await attachRecoveredWallet(user);

        // Transform response to flat structure expected by frontend
        const userResponse = user.toJSON();
        userResponse.balance = user.wallet ? user.wallet.balance : 0;
        const userFull = await User.findByPk(req.user.id, { attributes: ['transaction_pin_hash'] });
        userResponse.hasTransactionPin = Boolean(userFull && userFull.transaction_pin_hash);
        Object.assign(userResponse, await buildVirtualAccountProfileState(user));
        
        res.json(userResponse);
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
            attributes: { exclude: SENSITIVE_USER_FIELDS },
            include: [{ model: Wallet, as: 'wallet' }],
            order: [['createdAt', 'DESC']]
        });
        await Promise.all(users.map((user) => attachRecoveredWallet(user)));
        
        const formattedUsers = users.map(user => ({
            id: user.id,
            fullName: user.name,
            email: user.email,
            phone: user.phone,
            balance: user.wallet ? user.wallet.balance : 0,
            role: user.role,
            createdAt: user.createdAt,
            kycStatus: user.kyc_status,
            avatar: user.avatar,
            account_status: user.account_status,
            virtual_account_number: user.virtual_account_number,
            virtual_account_bank: user.virtual_account_bank
        }));
        
        res.json(formattedUsers);
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
        // #region debug-point B:profile-upload-entry
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='profile-photo-upload';for(const p of ['.dbg/profile-photo-upload.env','../.dbg/profile-photo-upload.env','../../.dbg/profile-photo-upload.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'B',location:'authController.js:updateProfile',msg:'[DEBUG] Profile update handler entered',data:{userId:req?.user?.id||null,contentType:req?.headers?.['content-type']||null,hasFile:Boolean(req?.file),fileField:req?.file?.fieldname||null,fileMimetype:req?.file?.mimetype||null,fileSize:req?.file?.size||null,bodyKeys:Object.keys(req?.body||{}),avatarBodyPresent:Boolean(req?.body?.avatar)},ts:Date.now()})}).catch(()=>{})})();
        // #endregion
        const user = await User.findByPk(req.user.id, {
            include: [{ model: Wallet, as: 'wallet' }]
        });

        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        await attachRecoveredWallet(user);

        user.name = req.body.fullName || user.name;
        user.email = req.body.email || user.email;
        user.phone = req.body.phone || user.phone;
        
        if (req.file) {
            user.avatar = `uploads/${req.file.filename}`;
        }
        // #region debug-point B:profile-upload-before-save
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='profile-photo-upload';for(const p of ['.dbg/profile-photo-upload.env','../.dbg/profile-photo-upload.env','../../.dbg/profile-photo-upload.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'E',location:'authController.js:updateProfile',msg:'[DEBUG] Profile update before DB save',data:{userId:user?.id||null,nextAvatar:user?.avatar||null,hasFile:Boolean(req?.file)},ts:Date.now()})}).catch(()=>{})})();
        // #endregion
        
        const updatedUser = await user.save();
        await attachRecoveredWallet(updatedUser);
        logger.info(`[Auth] Profile updated for user ${user.id}`);

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
            avatar: updatedUser.avatar,
            hasTransactionPin: Boolean(updatedUser.transaction_pin_hash)
        });
    } catch (error) {
        // #region debug-point C:profile-upload-error
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='profile-photo-upload';for(const p of ['.dbg/profile-photo-upload.env','../.dbg/profile-photo-upload.env','../../.dbg/profile-photo-upload.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'authController.js:updateProfile',msg:'[DEBUG] Profile update failed',data:{userId:req?.user?.id||null,message:error?.message||null,name:error?.name||null,code:error?.code||null,stack:String(error?.stack||'').slice(0,1200)},ts:Date.now()})}).catch(()=>{})})();
        // #endregion
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

        logger.info('[KYC] Submission received', {
            userId: req.user.id,
            bvn: `***${String(bvn).slice(-4)}`,
            file: req.file.filename,
        });

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
        if (isBvnVerified && user.virtual_account_number) {
            payvesselService.updateAccountBvn(user.virtual_account_number, bvn).catch(err => {
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

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public
const refreshUserToken = async (req, res) => {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!refreshToken) {
        return res.status(400).json({
            success: false,
            message: 'Refresh token is required',
        });
    }

    try {
        // Verify refresh token signature
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        
        // Find user
        const user = await User.findByPk(decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token - User not found',
            });
        }

        const userMeta = user.metadata || {};
        const refreshTokens = getStoredRefreshTokens(userMeta);

        // Check if token exists in user's active list
        if (!refreshTokens.some((token) => refreshTokenMatches(token, refreshToken))) {
            // Potential token reuse / theft attack!
            // Clear all refresh tokens for security
            await user.update({
                metadata: {
                    ...userMeta,
                    refreshTokens: [],
                }
            });
            clearAuthCookies(res);
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token - Potential reuse detected',
            });
        }

        // Generate new tokens
        const newToken = generateToken(user.id);
        const newRefreshToken = generateRefreshToken(user.id);

        // Rotate token (replace old refresh token with new one)
        const updatedTokens = [
            ...removeRefreshTokenFromStore(userMeta, refreshToken).slice(-9),
            hashRefreshToken(newRefreshToken),
        ];

        await user.update({
            metadata: {
                ...userMeta,
                refreshTokens: updatedTokens,
            }
        });

        setAuthCookies(res, { accessToken: newToken, refreshToken: newRefreshToken });
        res.json({
            success: true,
            message: 'Session refreshed',
        });
    } catch (error) {
        logger.error(`[Auth] Token refresh error: ${error.message}`);
        clearAuthCookies(res);
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired refresh token',
        });
    }
};

// @desc    Logout and invalidate refresh token
// @route   POST /api/auth/logout
// @access  Private
const logoutUser = async (req, res) => {
    const refreshToken = getRefreshTokenFromRequest(req);

    try {
        let userId = req.user?.id || null;
        if (!userId && refreshToken) {
            try {
                const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
                userId = decoded?.id || null;
            } catch (_error) {
                userId = null;
            }
        }

        if (userId) {
            const user = await User.findByPk(userId);
            if (user) {
                const userMeta = user.metadata || {};
                let refreshTokens = getStoredRefreshTokens(userMeta);
                if (refreshToken) {
                    refreshTokens = removeRefreshTokenFromStore(userMeta, refreshToken);
                } else {
                    refreshTokens = [];
                }
                await user.update({
                    metadata: {
                        ...userMeta,
                        refreshTokens,
                    }
                });
            }
        }
        clearAuthCookies(res);
        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        logger.error(`[Auth] Logout error: ${error.message}`);
        res.status(500).json({
            success: false,
            message: 'Logout failed',
        });
    }
};

// @desc    Request a password reset email
// @route   POST /api/auth/password-reset/request
// @access  Public
const requestPasswordReset = async (req, res) => {
    try {
        const response = await passwordResetService.requestPasswordReset(req.body.email, req);
        return res.status(200).json(response);
    } catch (error) {
        logger.error('[Auth] Password reset request error', { message: error.message, ip: req.ip || null });
        return res.status(500).json({
            success: false,
            message: 'Unable to process password reset right now. Please try again later.',
        });
    }
};

// @desc    Validate a password reset token
// @route   GET /api/auth/password-reset/validate
// @access  Public
const validatePasswordResetToken = async (req, res) => {
    try {
        const response = await passwordResetService.validateResetToken(req.query.token, req);
        return res.status(200).json(response);
    } catch (error) {
        return res.status(error.status || 400).json({
            success: false,
            code: error.code || 'PASSWORD_RESET_TOKEN_INVALID',
            message: error.message || 'This password reset link is invalid.',
        });
    }
};

// @desc    Complete a password reset
// @route   POST /api/auth/password-reset/complete
// @access  Public
const completePasswordReset = async (req, res) => {
    const { token, newPassword, confirmPassword } = req.body;

    try {
        const response = await passwordResetService.completePasswordReset(token, newPassword, confirmPassword, req);
        return res.status(200).json(response);
    } catch (error) {
        return res.status(error.status || 400).json({
            success: false,
            code: error.code || 'PASSWORD_RESET_FAILED',
            message: error.message || 'Unable to reset password.',
            passwordChecks: error.code === 'PASSWORD_TOO_WEAK'
                ? passwordResetService.getPasswordRuleChecks(newPassword)
                : undefined,
        });
    }
};

module.exports = {
    registerUser,
    trackReferralClick,
    loginUser,
    getMe,
    getAllUsers,
    updateProfile,
    changePassword,
    submitKyc,
    refreshUserToken,
    logoutUser,
    requestPasswordReset,
    validatePasswordResetToken,
    completePasswordReset,
};
