const multer = require('multer');
const path = require('path');
const logger = require('../utils/logger');

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Secure KYC documents in a separate folder
        if (file.fieldname === 'document') {
            cb(null, path.join(__dirname, '../secure_uploads/'));
        } else {
            cb(null, path.join(__dirname, '../uploads/'));
        }
    },
    filename: function (req, file, cb) {
        const prefix = file.fieldname === 'document' ? 'kyc-' : '';
        cb(null, prefix + Date.now() + path.extname(file.originalname));
    }
});

// Check file type
function checkFileType(file, cb) {
    logger.info(`Checking file type for field ${file.fieldname}: ${file.originalname} (${file.mimetype})`);
    
    // Default allowed extensions (Images)
    let filetypes = /jpeg|jpg|png|gif/;
    
    // Strict validation for KYC documents: Only JPG and PDF as requested
    if (file.fieldname === 'document') {
        filetypes = /jpeg|jpg|pdf/;
    }

    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);

    // Specific check for PDF mimetype
    if (file.fieldname === 'document' && file.mimetype === 'application/pdf') {
        return cb(null, true);
    }

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        const errorMsg = file.fieldname === 'document' 
            ? 'Error: KYC documents must be JPG or PDF format only!' 
            : 'Error: Invalid file type! Images only.';
        cb(new Error(errorMsg));
    }
}

// Init upload
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Increased to 10MB as requested
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

module.exports = upload;
