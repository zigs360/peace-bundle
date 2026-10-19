const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

let admin = null;
let getMessaging = null;

try {
    admin = require('firebase-admin');
    getMessaging = require('firebase-admin/messaging').getMessaging;
} catch (loadErr) {
    logger.warn(`[Firebase] firebase-admin package not loaded: ${loadErr.message}`);
}

class FirebaseManager {
    constructor() {
        this.app = null;
        this.messaging = null;
        this.isInitialized = false;
        this.mode = 'unconfigured'; // 'real', 'simulation', 'unavailable'
        this.projectId = null;
        this.clientEmail = null;
        this.source = null;
        this.lastInitError = null;
        this.lastDeliveryAt = null;
        this.stats = {
            sent: 0,
            failed: 0,
            simulated: 0
        };

        this._initialize();
    }

    /**
     * Sanitizes private key string from env variables or JSON
     * Handles escaped newlines, quote wrapping, and carriage returns
     */
    sanitizePrivateKey(key) {
        if (!key || typeof key !== 'string') return null;
        let cleaned = key.trim();

        // Strip surrounding double or single quotes
        if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
            (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
            cleaned = cleaned.slice(1, -1).trim();
        }

        // Convert literal escaped newlines \n or \r\n to actual newlines
        cleaned = cleaned.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');

        // Normalize carriage returns
        cleaned = cleaned.replace(/\r\n/g, '\n');

        return cleaned.trim();
    }

    /**
     * Attempts to parse JSON or base64 encoded JSON
     */
    parseJsonOrBase64(str) {
        if (!str || typeof str !== 'string') return null;
        const trimmed = str.trim();

        // 1. Try direct JSON parse
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                return JSON.parse(trimmed);
            } catch (err) {
                // fall through to base64
            }
        }

        // 2. Try base64 decoding
        try {
            const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
            if (decoded.trim().startsWith('{') && decoded.trim().endsWith('}')) {
                return JSON.parse(decoded.trim());
            }
        } catch {
            // Not valid base64 JSON
        }

        return null;
    }

    /**
     * Resolves Firebase service account credentials across all standard sources
     */
    resolveCredentials() {
        // --- SOURCE 1: Individual Environment Variables ---
        const envProjectId = process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECTID;
        const envClientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENTEMAIL;
        const envPrivateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATEKEY;

        if (envProjectId && envClientEmail && envPrivateKey) {
            const sanitizedKey = this.sanitizePrivateKey(envPrivateKey);
            if (sanitizedKey && sanitizedKey.includes('BEGIN PRIVATE KEY')) {
                return {
                    credentials: {
                        projectId: envProjectId.trim(),
                        clientEmail: envClientEmail.trim(),
                        privateKey: sanitizedKey
                    },
                    source: 'env_vars',
                    projectId: envProjectId.trim(),
                    clientEmail: envClientEmail.trim()
                };
            } else {
                logger.warn('[Firebase] FIREBASE_PRIVATE_KEY is present in env but lacks a valid PEM private key format.');
            }
        }

        // --- SOURCE 2: Base64 or Raw JSON in Environment Variables ---
        const jsonEnvVars = [
            { key: 'FIREBASE_SERVICE_ACCOUNT_BASE64', isBase64Only: true },
            { key: 'FIREBASE_SERVICE_ACCOUNT', isBase64Only: false },
            { key: 'FIREBASE_CREDENTIALS', isBase64Only: false },
            { key: 'FIREBASE_SERVICE_ACCOUNT_KEY', isBase64Only: false }
        ];

        for (const { key, isBase64Only } of jsonEnvVars) {
            const val = process.env[key];
            if (!val || typeof val !== 'string' || !val.trim()) continue;

            let parsed = null;
            if (isBase64Only) {
                try {
                    const dec = Buffer.from(val.trim(), 'base64').toString('utf8');
                    parsed = JSON.parse(dec);
                } catch (e) {
                    logger.warn(`[Firebase] Failed to decode base64 in ${key}: ${e.message}`);
                }
            } else {
                parsed = this.parseJsonOrBase64(val);
            }

            if (parsed && (parsed.project_id || parsed.projectId)) {
                const pId = parsed.project_id || parsed.projectId;
                const cEmail = parsed.client_email || parsed.clientEmail;
                const rawKey = parsed.private_key || parsed.privateKey;
                const sanitizedKey = this.sanitizePrivateKey(rawKey);

                if (pId && cEmail && sanitizedKey && sanitizedKey.includes('BEGIN PRIVATE KEY')) {
                    parsed.private_key = sanitizedKey;
                    return {
                        credentials: parsed,
                        source: key.toLowerCase(),
                        projectId: pId,
                        clientEmail: cEmail
                    };
                }
            }
        }

        // --- SOURCE 3: GOOGLE_APPLICATION_CREDENTIALS ---
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            const gPath = process.env.GOOGLE_APPLICATION_CREDENTIALS.trim();
            const candidates = [
                gPath,
                path.resolve(process.cwd(), gPath),
                path.resolve(__dirname, '..', gPath)
            ];
            for (const cand of candidates) {
                if (fs.existsSync(cand)) {
                    try {
                        const fileContent = fs.readFileSync(cand, 'utf8');
                        const parsed = JSON.parse(fileContent);
                        if (parsed.project_id && parsed.client_email && parsed.private_key) {
                            parsed.private_key = this.sanitizePrivateKey(parsed.private_key);
                            return {
                                credentials: parsed,
                                source: 'google_application_credentials_file',
                                projectId: parsed.project_id,
                                clientEmail: parsed.client_email,
                                filePath: cand
                            };
                        }
                    } catch (readErr) {
                        logger.warn(`[Firebase] Failed reading GOOGLE_APPLICATION_CREDENTIALS at ${cand}: ${readErr.message}`);
                    }
                }
            }
        }

        // --- SOURCE 4: Candidate Service Account Files on Disk ---
        const candidateFiles = [];
        if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
            candidateFiles.push(process.env.FIREBASE_SERVICE_ACCOUNT_PATH.trim());
        }
        if (process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.FIREBASE_SERVICE_ACCOUNT.trim().startsWith('{')) {
            candidateFiles.push(process.env.FIREBASE_SERVICE_ACCOUNT.trim());
        }

        // Default local config paths
        candidateFiles.push(
            path.join(__dirname, 'firebase-service-account.json'),
            path.join(__dirname, '..', 'config', 'firebase-service-account.json'),
            path.resolve(process.cwd(), 'config', 'firebase-service-account.json'),
            path.resolve(process.cwd(), 'backend', 'config', 'firebase-service-account.json'),
            '/app/config/firebase-service-account.json'
        );

        for (const filePath of candidateFiles) {
            try {
                const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
                if (fs.existsSync(resolved)) {
                    const stats = fs.statSync(resolved);
                    if (stats.isFile()) {
                        const content = fs.readFileSync(resolved, 'utf8');
                        const parsed = JSON.parse(content);
                        if (parsed.project_id && parsed.client_email && parsed.private_key) {
                            parsed.private_key = this.sanitizePrivateKey(parsed.private_key);
                            return {
                                credentials: parsed,
                                source: 'service_account_file',
                                projectId: parsed.project_id,
                                clientEmail: parsed.client_email,
                                filePath: resolved
                            };
                        }
                    }
                }
            } catch {
                // Continue checking next candidate path
            }
        }

        return null;
    }

    /**
     * Initializes the Firebase Admin SDK once per process
     */
    _initialize() {
        try {
            if (!admin) {
                this.isInitialized = false;
                this.mode = 'unavailable';
                this.lastInitError = 'firebase-admin package is not installed or available.';
                logger.warn(`[Firebase] ${this.lastInitError} Operating in simulation mode.`);
                return;
            }

            // Reuse existing default app if already initialized
            const existingApps = admin.getApps ? admin.getApps() : (admin.apps || []);
            if (existingApps.length > 0) {
                this.app = existingApps[0];
                this.messaging = getMessaging ? getMessaging(this.app) : null;
                this.isInitialized = true;
                this.mode = 'real';
                this.projectId = this.app.options?.projectId || 'configured_app';
                this.source = 'existing_instance';
                logger.info(`[Firebase] Reusing existing initialized Firebase App for project: ${this.projectId}`);
                return;
            }

            const resolved = this.resolveCredentials();

            if (resolved && resolved.credentials) {
                const certFn = admin.cert || (admin.credential && admin.credential.cert);
                this.app = admin.initializeApp({
                    credential: certFn(resolved.credentials)
                });
                this.messaging = getMessaging ? getMessaging(this.app) : null;
                this.isInitialized = true;
                this.mode = 'real';
                this.projectId = resolved.projectId;
                this.clientEmail = resolved.clientEmail;
                this.source = resolved.source;
                this.lastInitError = null;

                logger.info(`[Firebase] Admin SDK initialized successfully via ${this.source} for project: ${this.projectId}`);
            } else {
                this.isInitialized = false;
                const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
                this.lastInitError = 'No valid Firebase credentials found across environment variables or service account files.';

                if (isProd) {
                    this.mode = 'unavailable';
                    logger.error(
                        `[Firebase] CONFIGURATION ERROR in production: ${this.lastInitError}\n` +
                        'Real push notifications are DISABLED. To enable, configure one of the following:\n' +
                        '  1. FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env\n' +
                        '  2. FIREBASE_SERVICE_ACCOUNT (single line JSON string or base64) in .env\n' +
                        '  3. config/firebase-service-account.json in the backend directory.'
                    );
                } else {
                    this.mode = 'simulation';
                    logger.info(`[Firebase] ${this.lastInitError} Operating in simulation mode for ${process.env.NODE_ENV || 'development'}.`);
                }
            }
        } catch (error) {
            this.isInitialized = false;
            this.mode = 'unavailable';
            this.lastInitError = error.message;
            logger.error(`[Firebase] Initialization failed with error: ${error.message}`);
        }
    }

    /**
     * Get sanitized diagnostic status for admin health checks
     */
    getDiagnostics() {
        return {
            isInitialized: this.isInitialized,
            mode: this.mode,
            projectId: this.projectId,
            clientEmail: this.clientEmail,
            source: this.source,
            lastInitError: this.lastInitError,
            lastDeliveryAt: this.lastDeliveryAt ? this.lastDeliveryAt.toISOString() : null,
            stats: { ...this.stats },
            env: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Record push delivery metrics
     */
    recordDelivery(type) {
        if (type === 'sent') {
            this.stats.sent++;
            this.lastDeliveryAt = new Date();
        } else if (type === 'failed') {
            this.stats.failed++;
        } else if (type === 'simulated') {
            this.stats.simulated++;
        }
    }
}

const firebaseManager = new FirebaseManager();

module.exports = firebaseManager;
