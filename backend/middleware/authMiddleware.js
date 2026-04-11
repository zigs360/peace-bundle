const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];
            
            // Decode token to get user ID
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Fetch user from DB (Sequelize)
            req.user = await User.findByPk(decoded.id, {
                attributes: { exclude: ['password'] }
            });

            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
            }
            
            return next();
        } catch (error) {
            logger.error('Auth protect error:', { error: error.message, token: token ? 'provided' : 'none' });
            return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
};

const admin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
        next();
    } else {
        logger.warn('Admin Access Denied:', { userId: req.user?.id, role: req.user?.role });
        res.status(403).json({ success: false, message: 'Not authorized as an admin' });
    }
};

const reseller = (req, res, next) => {
    if (req.user && (req.user.role === 'reseller' || req.user.role === 'admin')) {
        next();
    } else {
        logger.warn('Reseller Access Denied:', { userId: req.user?.id, role: req.user?.role });
        res.status(403).json({ success: false, message: 'Not authorized as a reseller' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            logger.warn('Role Access Denied:', { userId: req.user?.id, role: req.user?.role, required: roles });
            return res.status(403).json({ 
                success: false,
                message: `Role ${req.user ? req.user.role : 'unknown'} is not authorized to access this route` 
            });
        }
        next();
    };
};

module.exports = { protect, admin, reseller, authorize };
