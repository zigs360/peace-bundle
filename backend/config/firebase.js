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

const EXPECTED_PROJECT_ID = (process.env.EXPECTED_FIREBASE_PROJECT_ID || 'peace-bundle').trim();

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
        this._checkedEnvFiles = [];
        this._checkedServiceAccountFiles = [];
        this._isInitializing = false;
        this.stats = {
            sent: 0,
            failed: 0,
            simulated: 0
        };

        this._initialize();
    }

    /**
     * Sanitizes private key string from env variables or JSON
     * Handles escaped newlines, quote wrapping, backslash escaped quotes, and carriage returns
     */
    sanitizePrivateKey(key) {
        if (!key || typeof key !== 'string') return null;
        let cleaned = key.trim();

        // Strip surrounding escaped double or single quotes e.g. \"...\"
        if ((cleaned.startsWith('\\"') && cleaned.endsWith('\\"')) ||
            (cleaned.startsWith("\\'") && cleaned.endsWith("\\'"))) {
            cleaned = cleaned.slice(2, -2).trim();
        }

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
     * Attempts to parse JSON or base64 encoded JSON safely
     */
    parseJsonOrBase64(str) {
        if (!str || typeof str !== 'string') return null;
        let trimmed = str.trim();

        // Strip surrounding quotes if present
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            trimmed = trimmed.slice(1, -1).trim();
        }

        // 1. Try direct JSON parse
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                return JSON.parse(trimmed);
            } catch {
                // fall through to base64
            }
        }

        // 2. Try base64 decoding
        try {
            const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
            const decTrimmed = decoded.trim();
            if (decTrimmed.startsWith('{') && decTrimmed.endsWith('}')) {
                return JSON.parse(decTrimmed);
            }
        } catch {
            // Not valid base64 JSON
        }

        return null;
    }

    /**
     * Multi-path .env loader and empty string sanitizer
     * Ensures environment variables are populated regardless of cwd, PM2 directory, or Docker layout
     */
    _ensureEnvLoaded() {
        const keysToCheck = [
            'FIREBASE_PROJECT_ID',
            'FIREBASE_PROJECTID',
            'FIREBASE_CLIENT_EMAIL',
            'FIREBASE_CLIENTEMAIL',
            'FIREBASE_PRIVATE_KEY',
            'FIREBASE_PRIVATEKEY',
            'FIREBASE_SERVICE_ACCOUNT',
            'FIREBASE_SERVICE_ACCOUNT_BASE64',
            'FIREBASE_CREDENTIALS',
            'FIREBASE_SERVICE_ACCOUNT_KEY',
            'FIREBASE_SERVICE_ACCOUNT_PATH',
            'GOOGLE_APPLICATION_CREDENTIALS'
        ];

        // Clean empty string placeholders (e.g. injected by Docker Compose interpolation)
        for (const k of keysToCheck) {
            if (typeof process.env[k] === 'string' && process.env[k].trim() === '') {
                delete process.env[k];
            }
        }

        const candidateEnvPaths = [
            path.resolve(process.cwd(), '.env'),
            path.resolve(__dirname, '.env'),
            path.resolve(__dirname, '..', '.env'),
            path.resolve(__dirname, '..', '..', '.env'),
            path.resolve(process.cwd(), '..', '.env'),
            path.resolve(process.cwd(), 'backend', '.env'),
            '/app/.env',
            '/root/peace-bundle/.env'
        ];

        this._checkedEnvFiles = [];
        let dotenv = null;
        try {
            dotenv = require('dotenv');
        } catch {
            // dotenv unavailable
        }

        for (const envPath of candidateEnvPaths) {
            try {
                if (fs.existsSync(envPath)) {
                    const stats = fs.statSync(envPath);
                    if (stats.isFile()) {
                        this._checkedEnvFiles.push({ path: envPath, found: true });
                        if (dotenv) {
                            dotenv.config({ path: envPath, override: false });
                            if (dotenv.parse) {
                                const raw = fs.readFileSync(envPath, 'utf8');
                                const parsed = dotenv.parse(raw);
                                for (const k of keysToCheck) {
                                    if (!process.env[k] && parsed[k] && parsed[k].trim().length > 0) {
                                        process.env[k] = parsed[k].trim();
                                    }
                                }
                            }
                        }
                    }
                } else {
                    this._checkedEnvFiles.push({ path: envPath, found: false });
                }
            } catch {
                // Ignore candidate read error
            }
        }
    }

    /**
     * Resolves Firebase service account credentials across all standard sources
     */
    resolveCredentials() {
        this._ensureEnvLoaded();

        const expectedProject = (process.env.EXPECTED_FIREBASE_PROJECT_ID || 'peace-bundle').trim();

        // --- SOURCE 1: Individual Environment Variables ---
        const envProjectId = (process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECTID || '').trim();
        const envClientEmail = (process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENTEMAIL || '').trim();
        const envPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATEKEY || '').trim();

        if (envProjectId && envClientEmail && envPrivateKey) {
            if (envProjectId !== expectedProject) {
                logger.warn(`[Firebase] env_vars project ID mismatch: expected "${expectedProject}", got "${envProjectId}". Rejecting.`);
                this.lastInitError = `Project ID mismatch: expected "${expectedProject}", got "${envProjectId}"`;
            } else {
                const sanitizedKey = this.sanitizePrivateKey(envPrivateKey);
                if (sanitizedKey && sanitizedKey.includes('BEGIN PRIVATE KEY')) {
                    return {
                        credentials: {
                            projectId: envProjectId,
                            clientEmail: envClientEmail,
                            privateKey: sanitizedKey
                        },
                        source: 'env_vars',
                        projectId: envProjectId,
                        clientEmail: envClientEmail
                    };
                } else {
                    logger.warn('[Firebase] FIREBASE_PRIVATE_KEY is present in env but lacks a valid PEM private key format.');
                }
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

            let cleanVal = val.trim();
            // Strip surrounding wrapping quotes
            if ((cleanVal.startsWith('"') && cleanVal.endsWith('"')) ||
                (cleanVal.startsWith("'") && cleanVal.endsWith("'"))) {
                cleanVal = cleanVal.slice(1, -1).trim();
            }

            let parsed = null;
            if (isBase64Only) {
                try {
                    const dec = Buffer.from(cleanVal, 'base64').toString('utf8');
                    parsed = JSON.parse(dec);
                } catch (e) {
                    logger.warn(`[Firebase] Malformed Base64 or invalid JSON in ${key}: ${e.message}`);
                }
            } else {
                parsed = this.parseJsonOrBase64(cleanVal);
            }

            if (parsed) {
                const pId = (parsed.project_id || parsed.projectId || '').trim();
                const cEmail = (parsed.client_email || parsed.clientEmail || '').trim();
                const rawKey = parsed.private_key || parsed.privateKey;
                const sanitizedKey = this.sanitizePrivateKey(rawKey);

                if (!pId || !cEmail || !sanitizedKey) {
                    logger.warn(`[Firebase] ${key} is missing required fields (project_id, client_email, or private_key).`);
                    continue;
                }

                if (pId !== expectedProject) {
                    logger.warn(`[Firebase] ${key} project ID mismatch: expected "${expectedProject}", got "${pId}". Rejecting.`);
                    this.lastInitError = `Project ID mismatch: expected "${expectedProject}", got "${pId}"`;
                    continue;
                }

                if (sanitizedKey.includes('BEGIN PRIVATE KEY')) {
                    parsed.private_key = sanitizedKey;
                    parsed.project_id = pId;
                    parsed.client_email = cEmail;
                    return {
                        credentials: parsed,
                        source: key.toLowerCase(),
                        projectId: pId,
                        clientEmail: cEmail
                    };
                } else {
                    logger.warn(`[Firebase] ${key} private_key lacks a valid PEM private key format.`);
                }
            }
        }

        // --- SOURCE 3: GOOGLE_APPLICATION_CREDENTIALS ---
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_APPLICATION_CREDENTIALS.trim()) {
            const gPath = process.env.GOOGLE_APPLICATION_CREDENTIALS.trim();
            const candidates = [
                gPath,
                path.resolve(process.cwd(), gPath),
                path.resolve(__dirname, '..', gPath),
                path.resolve(__dirname, '..', '..', gPath),
                path.resolve('/app', gPath)
            ];
            for (const cand of candidates) {
                try {
                    if (fs.existsSync(cand)) {
                        const stats = fs.statSync(cand);
                        if (stats.isFile()) {
                            const fileContent = fs.readFileSync(cand, 'utf8');
                            const parsed = JSON.parse(fileContent);
                            const pId = (parsed.project_id || '').trim();
                            if (pId && pId !== expectedProject) {
                                logger.warn(`[Firebase] GOOGLE_APPLICATION_CREDENTIALS at ${cand} project ID mismatch: expected "${expectedProject}", got "${pId}". Rejecting.`);
                                this.lastInitError = `Project ID mismatch: expected "${expectedProject}", got "${pId}"`;
                                continue;
                            }
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
                        }
                    }
                } catch (readErr) {
                    logger.warn(`[Firebase] Failed reading GOOGLE_APPLICATION_CREDENTIALS at ${cand}: ${readErr.message}`);
                }
            }
        }

        // --- SOURCE 4: Candidate Service Account Files on Disk ---
        const candidateFiles = new Set();

        if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && process.env.FIREBASE_SERVICE_ACCOUNT_PATH.trim()) {
            candidateFiles.add(process.env.FIREBASE_SERVICE_ACCOUNT_PATH.trim());
        }
        if (process.env.FIREBASE_SERVICE_ACCOUNT && typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string') {
            const trimmed = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
            if (trimmed && !trimmed.startsWith('{')) {
                candidateFiles.add(trimmed);
            }
        }

        const candidateFileNames = [
            'firebase-service-account.json',
            'firebase-adminsdk.json',
            'serviceAccountKey.json',
            'service-account.json',
            'service-account-key.json',
            'google-credentials.json',
            'firebase.json'
        ];

        const candidateDirs = [
            __dirname, // backend/config
            path.resolve(__dirname, '..'), // backend
            path.resolve(__dirname, '..', 'config'), // backend/config
            path.resolve(__dirname, '..', '..'), // root
            path.resolve(__dirname, '..', '..', 'config'), // root/config
            process.cwd(),
            path.resolve(process.cwd(), 'config'),
            path.resolve(process.cwd(), 'backend'),
            path.resolve(process.cwd(), 'backend', 'config'),
            path.resolve(process.cwd(), '..'),
            path.resolve(process.cwd(), '..', 'config'),
            '/app',
            '/app/config',
            '/root/peace-bundle',
            '/root/peace-bundle/config',
            '/root/peace-bundle/backend/config'
        ];

        for (const dir of candidateDirs) {
            for (const fName of candidateFileNames) {
                candidateFiles.add(path.join(dir, fName));
            }
        }

        this._checkedServiceAccountFiles = [];

        for (const filePath of candidateFiles) {
            try {
                const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
                if (fs.existsSync(resolved)) {
                    const stats = fs.statSync(resolved);
                    if (stats.isFile()) {
                        this._checkedServiceAccountFiles.push({ path: resolved, found: true });
                        const content = fs.readFileSync(resolved, 'utf8');
                        const parsed = JSON.parse(content);
                        const pId = (parsed.project_id || '').trim();
                        if (pId && pId !== expectedProject) {
                            logger.warn(`[Firebase] Service account file at ${resolved} project ID mismatch: expected "${expectedProject}", got "${pId}". Rejecting.`);
                            this.lastInitError = `Project ID mismatch: expected "${expectedProject}", got "${pId}"`;
                            continue;
                        }
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
                } else {
                    this._checkedServiceAccountFiles.push({ path: resolved, found: false });
                }
            } catch {
                // Continue checking next candidate path
            }
        }

        return null;
    }

    /**
     * Initializes the Firebase Admin SDK once per process
     * Guards against duplicate and concurrent initialization
     */
    _initialize() {
        if (this._isInitializing) {
            return;
        }
        this._isInitializing = true;

        try {
            if (!admin) {
                this.isInitialized = false;
                this.mode = 'unavailable';
                this.lastInitError = 'firebase-admin package is not installed or available.';
                logger.warn(`[Firebase] ${this.lastInitError} Operating in simulation mode.`);
                return;
            }

            const expectedProject = (process.env.EXPECTED_FIREBASE_PROJECT_ID || 'peace-bundle').trim();

            // Reuse existing default app if already initialized
            const existingApps = admin.getApps ? admin.getApps() : (admin.apps || []);
            if (existingApps.length > 0) {
                this.app = existingApps[0];
                this.messaging = getMessaging ? getMessaging(this.app) : null;
                this.isInitialized = true;
                this.mode = 'real';
                this.projectId = this.app.options?.projectId || expectedProject;
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

                logger.info(`[Firebase] Admin SDK initialized successfully via ${this.source} for project: ${this.projectId} (client_email: ${this.clientEmail})`);
            } else {
                this.isInitialized = false;
                const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
                this.lastInitError = this.lastInitError || 'No valid Firebase credentials found across environment variables or service account files.';

                if (isProd) {
                    this.mode = 'unavailable';
                    const foundEnvFiles = (this._checkedEnvFiles || []).filter(f => f.found).map(f => f.path);
                    const foundKeyFiles = (this._checkedServiceAccountFiles || []).filter(f => f.found).map(f => f.path);

                    logger.error(
                        `[Firebase] CONFIGURATION ERROR in production: ${this.lastInitError}\n` +
                        `  Current Working Directory: ${process.cwd()}\n` +
                        `  Expected Project ID: ${expectedProject}\n` +
                        `  Environment Variables Status:\n` +
                        `    FIREBASE_SERVICE_ACCOUNT_BASE64: ${process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ? 'SET' : (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 === '' ? 'EMPTY' : 'NOT SET')}\n` +
                        `    FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID ? 'SET' : (process.env.FIREBASE_PROJECT_ID === '' ? 'EMPTY' : 'NOT SET')}\n` +
                        `    FIREBASE_CLIENT_EMAIL: ${process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : (process.env.FIREBASE_CLIENT_EMAIL === '' ? 'EMPTY' : 'NOT SET')}\n` +
                        `    FIREBASE_PRIVATE_KEY: ${process.env.FIREBASE_PRIVATE_KEY ? `SET (${process.env.FIREBASE_PRIVATE_KEY.length} chars)` : (process.env.FIREBASE_PRIVATE_KEY === '' ? 'EMPTY' : 'NOT SET')}\n` +
                        `    FIREBASE_SERVICE_ACCOUNT: ${process.env.FIREBASE_SERVICE_ACCOUNT ? `SET (${process.env.FIREBASE_SERVICE_ACCOUNT.length} chars)` : (process.env.FIREBASE_SERVICE_ACCOUNT === '' ? 'EMPTY' : 'NOT SET')}\n` +
                        `    GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ? `SET (${process.env.GOOGLE_APPLICATION_CREDENTIALS})` : 'NOT SET'}\n` +
                        `  .env files found on disk: ${foundEnvFiles.length ? foundEnvFiles.join(', ') : 'None'}\n` +
                        `  Service account JSON files found on disk: ${foundKeyFiles.length ? foundKeyFiles.join(', ') : 'None'}\n` +
                        `Real push notifications are DISABLED. To enable in DigitalOcean / Docker, set:\n` +
                        `  FIREBASE_SERVICE_ACCOUNT_BASE64 in DigitalOcean environment settings or .env`
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
        } finally {
            this._isInitializing = false;
        }
    }

    /**
     * Reinitializes Firebase Admin SDK at runtime
     * Allows live reloading credentials without restarting the entire server
     */
    async reload() {
        if (this.app) {
            try {
                if (typeof this.app.delete === 'function') {
                    await this.app.delete();
                }
            } catch {
                // Ignore app delete failure
            }
            this.app = null;
            this.messaging = null;
        }

        this.isInitialized = false;
        this.mode = 'unconfigured';
        this.projectId = null;
        this.clientEmail = null;
        this.source = null;
        this.lastInitError = null;

        this._initialize();
        return this.getDiagnostics();
    }

    /**
     * Get sanitized diagnostic status for admin health checks
     */
    getDiagnostics() {
        const foundEnvFiles = (this._checkedEnvFiles || []).filter(f => f.found).map(f => f.path);
        const foundKeyFiles = (this._checkedServiceAccountFiles || []).filter(f => f.found).map(f => f.path);
        const expectedProject = (process.env.EXPECTED_FIREBASE_PROJECT_ID || 'peace-bundle').trim();

        return {
            isInitialized: this.isInitialized,
            mode: this.mode,
            projectId: this.projectId,
            expectedProjectId: expectedProject,
            clientEmail: this.clientEmail,
            source: this.source,
            lastInitError: this.lastInitError,
            lastDeliveryAt: this.lastDeliveryAt ? this.lastDeliveryAt.toISOString() : null,
            stats: { ...this.stats },
            env: process.env.NODE_ENV || 'development',
            cwd: process.cwd(),
            detectedEnvFiles: foundEnvFiles,
            detectedKeyFiles: foundKeyFiles,
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
