const multer = require('multer');
const path = require('path');

// Set storage engine
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // Distinguish between avatar and kyc document
        // file.fieldname matches the name attribute in the form data ('avatar' or 'document')
        const prefix = file.fieldname === 'document' ? 'kyc' : 'avatar';
        // Add timestamp to ensure uniqueness and bust cache
        cb(null, `${prefix}-${req.user.id}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// Check file type
function checkFileType(file, cb) {
    // Default allowed extensions (Images)
    let filetypes = /jpeg|jpg|png|gif/;
    
    // Allow PDF for KYC documents
    if (file.fieldname === 'document') {
        filetypes = /jpeg|jpg|png|gif|pdf/;
    }

    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);

    // Common PDF mime types: application/pdf
    if (file.fieldname === 'document' && file.mimetype === 'application/pdf') {
        return cb(null, true);
    }

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Invalid file type! Images (and PDF for KYC) only.');
    }
}

// Init upload
const upload = multer({
    storage: storage,
    limits: { fileSize: 5000000 }, // Increased to 5MB to accommodate high-res IDs or PDFs
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

module.exports = upload;
