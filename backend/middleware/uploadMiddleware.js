const multer = require('multer');
const path = require('path');
const logger = require('../utils/logger');

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_KYC_SIZE_BYTES = 10 * 1024 * 1024;
const AVATAR_FILETYPES = /jpeg|jpg|png|gif|webp/;
const KYC_FILETYPES = /jpeg|jpg|pdf/;

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
    // #region debug-point A:multer-file-filter
    (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='profile-photo-upload';for(const p of ['.dbg/profile-photo-upload.env','../.dbg/profile-photo-upload.env','../../.dbg/profile-photo-upload.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'uploadMiddleware.js:checkFileType',msg:'[DEBUG] Upload fileFilter invoked',data:{field:file?.fieldname||null,mimetype:file?.mimetype||null,originalnameExt:require('path').extname(String(file?.originalname||'')).toLowerCase()},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    
    const filetypes = file.fieldname === 'document' ? KYC_FILETYPES : AVATAR_FILETYPES;

    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);

    // Specific check for PDF mimetype
    if (file.fieldname === 'document' && file.mimetype === 'application/pdf') {
        return cb(null, true);
    }

    if (mimetype && extname) {
        // #region debug-point A:multer-file-filter-accept
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='profile-photo-upload';for(const p of ['.dbg/profile-photo-upload.env','../.dbg/profile-photo-upload.env','../../.dbg/profile-photo-upload.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'uploadMiddleware.js:checkFileType',msg:'[DEBUG] Upload fileFilter accepted file',data:{field:file?.fieldname||null,mimetype:file?.mimetype||null,extOk:extname,mimeOk:mimetype},ts:Date.now()})}).catch(()=>{})})();
        // #endregion
        return cb(null, true);
    } else {
        const errorMsg = file.fieldname === 'document' 
            ? 'Invalid file type. KYC documents must be JPG or PDF.' 
            : 'Invalid file type. Profile photos must be JPG, PNG, GIF, or WebP.';
        // #region debug-point A:multer-file-filter-reject
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='profile-photo-upload';for(const p of ['.dbg/profile-photo-upload.env','../.dbg/profile-photo-upload.env','../../.dbg/profile-photo-upload.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'uploadMiddleware.js:checkFileType',msg:'[DEBUG] Upload fileFilter rejected file',data:{field:file?.fieldname||null,mimetype:file?.mimetype||null,extOk:extname,mimeOk:mimetype,errorMsg},ts:Date.now()})}).catch(()=>{})})();
        // #endregion
        cb(new Error(errorMsg));
    }
}

const avatarUpload = multer({
    storage: storage,
    limits: { fileSize: MAX_AVATAR_SIZE_BYTES },
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

const kycUpload = multer({
    storage: storage,
    limits: { fileSize: MAX_KYC_SIZE_BYTES },
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

module.exports = {
    avatarUpload,
    kycUpload,
    MAX_AVATAR_SIZE_BYTES,
};
