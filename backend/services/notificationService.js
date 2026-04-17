const nodemailer = require('nodemailer');
const axios = require('axios');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

const isPlaceholder = (value) => {
    const str = String(value || '').toLowerCase();
    return !str || str.includes('your_') || str.includes('example') || str.includes('ethereal_');
};

const getErrorText = (error) => {
    const parts = [
        error?.message,
        error?.response?.data?.message,
        error?.response?.data?.error,
        error?.response?.statusText,
    ].filter(Boolean);
    return parts.join(' ').toLowerCase();
};

const isSmsProviderBalanceError = (error) => {
    const status = Number(error?.response?.status || 0);
    const text = getErrorText(error);
    return status === 400 && text.includes('insufficient balance');
};

const resolveSmtpSettings = () => {
    const host = isPlaceholder(process.env.SMTP_HOST) ? process.env.gmail_host : (process.env.SMTP_HOST || process.env.gmail_host);
    const portRaw = isPlaceholder(process.env.SMTP_PORT) ? process.env.gmail_port : (process.env.SMTP_PORT || process.env.gmail_port);
    const user = isPlaceholder(process.env.SMTP_USER) ? process.env.gmail_user : (process.env.SMTP_USER || process.env.gmail_user);
    const pass = isPlaceholder(process.env.SMTP_PASS) ? process.env.gmail_pass : (process.env.SMTP_PASS || process.env.gmail_pass);
    const from = process.env.SMTP_FROM || process.env.smtp_from || `"Peace Bundlle" <noreply@peacebundlle.com>`;

    const port = Number.parseInt(String(portRaw || ''), 10);
    const encryptionRaw = process.env.SMTP_ENCRYPTION || process.env.encryption || '';
    const encryption = String(encryptionRaw).trim().toLowerCase();

    const secureExplicit = String(process.env.SMTP_SECURE || '').trim().toLowerCase();
    const secure =
        secureExplicit === 'true'
            ? true
            : secureExplicit === 'false'
                ? false
                : Number.isFinite(port) && port === 465
                    ? true
                    : encryption === 'ssl' || encryption === 'smtps';

    const requireTLS = encryption === 'tls' || encryption === 'starttls';

    return {
        host,
        port: Number.isFinite(port) ? port : 587,
        user,
        pass,
        from,
        secure,
        requireTLS,
    };
};

let cachedTransporter = null;
let cachedTransportKey = null;

const getTransporter = () => {
    const settings = resolveSmtpSettings();
    const key = JSON.stringify({
        host: settings.host,
        port: settings.port,
        user: settings.user,
        secure: settings.secure,
        requireTLS: settings.requireTLS,
    });

    if (cachedTransporter && cachedTransportKey === key) return cachedTransporter;

    if (!settings.host || !settings.user || !settings.pass) return null;
    if (isPlaceholder(settings.user) || isPlaceholder(settings.pass)) return null;

    cachedTransporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: { user: settings.user, pass: settings.pass },
        requireTLS: settings.requireTLS,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    });
    cachedTransportKey = key;

    return cachedTransporter;
};

const sendEmail = async (to, subject, text, html) => {
    try {
        if (process.env.NODE_ENV === 'test') return;
        if (!to) return;

        const transporter = getTransporter();
        if (!transporter) {
            logger.info('[Mock Email] SMTP not configured', { to, subject });
            return;
        }

        const { from } = resolveSmtpSettings();
        const info = await transporter.sendMail({
            from,
            to, // list of receivers
            subject, // Subject line
            text, // plain text body
            html: html || undefined, // html body
        });

        logger.info('Email sent', { messageId: info.messageId, to });
    } catch (error) {
        logger.error('Error sending email', { error: error.message });
    }
};

const sendSMS = async (phone, message, options = {}) => {
    try {
        if (process.env.NODE_ENV === 'test') return;
        if (!phone) return { success: false, skipped: true, reason: 'missing_phone' };

        const digitsOnly = String(phone || '').replace(/[^\d+]/g, '');
        let formattedPhone = digitsOnly.startsWith('+') ? digitsOnly.slice(1) : digitsOnly;
        if (formattedPhone.startsWith('0')) {
            formattedPhone = `234${formattedPhone.slice(1)}`;
        }
        if (formattedPhone.startsWith('2340')) {
            formattedPhone = `234${formattedPhone.slice(4)}`;
        }

        // Check for Termii configuration
        const smsProvider = String(process.env.SMS_PROVIDER || '').trim().toLowerCase();
        const apiKey = String(process.env.SMS_API_KEY || '').trim();
        if (smsProvider === 'termii' && apiKey && !apiKey.includes('your_')) {
            const senderId = String(options.senderId || process.env.SMS_SENDER_ID || 'PeaceBundlle').trim();
            const channel = String(options.channel || process.env.SMS_CHANNEL || 'generic').trim();
            const payload = {
                to: formattedPhone,
                from: senderId,
                sms: message,
                type: 'plain',
                channel,
                api_key: process.env.SMS_API_KEY,
            };

            const baseUrl = String(process.env.SMS_BASE_URL || 'https://v3.api.termii.com').trim().replace(/\/+$/, '');
            const url = `${baseUrl}/api/sms/send`;
            const response = await axios.post(url, payload, { timeout: 10_000 });
            const ok =
                String(response.data?.code || '').toLowerCase() === 'ok' ||
                String(response.data?.message || '').toLowerCase().includes('success');
            if (ok) {
                logger.info('[Termii SMS] Sent', { to: formattedPhone });
                return { success: true, provider: 'termii', to: formattedPhone, response: response.data };
            } else {
                logger.warn('[Termii SMS] Non-success response', { to: formattedPhone, response: response.data });
                return { success: false, provider: 'termii', to: formattedPhone, response: response.data };
            }
        } else {
            logger.info('[Mock SMS] Missing credentials', { to: formattedPhone });
            return { success: false, skipped: true, reason: 'provider_not_configured', to: formattedPhone };
        }
    } catch (error) {
        if (isSmsProviderBalanceError(error)) {
            logger.warn('[SMS] Provider balance exhausted', {
                to: String(phone || ''),
                status: error.response?.status,
                response: error.response?.data,
            });
            return {
                success: false,
                provider: 'termii',
                retryable: false,
                reason: 'provider_insufficient_balance',
                status: error.response?.status,
            };
        }

        logger.error('Error sending SMS', {
            error: error.message,
            status: error.response?.status,
            response: error.response?.data,
        });
        return {
            success: false,
            provider: String(process.env.SMS_PROVIDER || '').trim().toLowerCase() || 'unknown',
            retryable: true,
            reason: 'provider_request_failed',
            status: error.response?.status,
        };
    }
};

const sendTransactionNotification = async (user, transaction) => {
    if (!user) return;

    if (transaction?.type === 'virtual_account_activation') {
        const subject = 'Your virtual account is now active';
        const details = transaction?.details || {};
        const message = transaction?.message || `Hello ${user.name || 'User'}, your virtual account is now active.`;
        const htmlMessage = `
            <h3>Virtual Account Activated</h3>
            <p>Hello ${user.name || 'User'},</p>
            <p>${message}</p>
            <ul>
                <li><strong>Bank:</strong> ${details.bank || ''}</li>
                <li><strong>Account Number:</strong> ${details.accountNumber || ''}</li>
                <li><strong>Account Name:</strong> ${details.accountName || ''}</li>
            </ul>
            <p>You can now fund your wallet via bank transfer.</p>
        `;

        await Notification.create({
            userId: user.id,
            title: 'Virtual account activated',
            message,
            type: 'success',
            priority: 'medium',
            link: '/dashboard/fund',
            metadata: { kind: 'virtual_account_activation', details: { ...details, accountNumber: undefined } }
        });

        await sendEmail(user.email, subject, message, htmlMessage);
        if (user.phone) {
            const smsMessage = `PeaceBundlle: Your virtual account is active. Bank: ${details.bank || ''}. Account: ${details.accountNumber || ''}.`;
            await sendSMS(user.phone, smsMessage);
        }
        return;
    }

    const subject = `Transaction Notification: ${transaction?.type || 'update'}`;
    const message = `
        Hello ${user.name || 'User'},
        
        Your transaction update:
        
        Type: ${transaction?.type || ''}
        Amount: ₦${transaction?.amount || ''}
        Status: ${transaction?.status || ''}
        Reference: ${transaction?.reference || ''}
        Date: ${new Date().toLocaleString()}
        
        Thank you for using Peace Bundlle.
    `;

    const htmlMessage = `
        <h3>Transaction Notification</h3>
        <p>Hello ${user.name || 'User'},</p>
        <p>Your transaction update:</p>
        <ul>
            <li><strong>Type:</strong> ${transaction?.type || ''}</li>
            <li><strong>Amount:</strong> ₦${transaction?.amount || ''}</li>
            <li><strong>Status:</strong> ${transaction?.status || ''}</li>
            <li><strong>Reference:</strong> ${transaction?.reference || ''}</li>
            <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p>Thank you for using Peace Bundlle.</p>
    `;

    await sendEmail(user.email, subject, message, htmlMessage);
    if (user.phone) {
        const smsMessage = `PeaceBundlle: ${transaction?.type || 'Transaction'} update. Ref: ${transaction?.reference || ''}.`;
        await sendSMS(user.phone, smsMessage);
    }
};

module.exports = {
    sendEmail,
    sendSMS,
    sendTransactionNotification
};
