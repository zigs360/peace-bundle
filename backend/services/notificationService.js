const nodemailer = require('nodemailer');
const axios = require('axios');
const Notification = require('../models/Notification');

// Create reusable transporter object using the default SMTP transport
// In production, use real credentials from .env
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || 'ethereal_user', // generated ethereal user
        pass: process.env.SMTP_PASS || 'ethereal_pass', // generated ethereal password
    },
});

const sendEmail = async (to, subject, text, html) => {
    try {
        if (process.env.NODE_ENV === 'test') return;
        if (!to) return;
        
        // If credentials are still placeholders, log and return to prevent timeout/errors
        if (process.env.SMTP_USER && process.env.SMTP_USER.includes('your_email')) {
            console.log(`[Mock Email] (Credentials not set) To: ${to} | Subject: ${subject}`);
            return;
        }

        const info = await transporter.sendMail({
            from: '"Peace Bundlle" <noreply@peacebundlle.com>', // sender address
            to, // list of receivers
            subject, // Subject line
            text, // plain text body
            html, // html body
        });

        console.log('Message sent: %s', info.messageId);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

const sendSMS = async (phone, message) => {
    try {
        if (process.env.NODE_ENV === 'test') return;
        if (!phone) return;

        // Normalize phone number to international format (234...)
        let formattedPhone = phone;
        if (phone.startsWith('0')) {
            formattedPhone = '234' + phone.substring(1);
        }

        // Check for Termii configuration
        if (process.env.SMS_PROVIDER === 'termii' && process.env.SMS_API_KEY && !process.env.SMS_API_KEY.includes('your_')) {
            const payload = {
                to: formattedPhone,
                from: process.env.SMS_SENDER_ID || 'PeaceBundlle',
                sms: message,
                type: 'plain',
                channel: 'generic',
                api_key: process.env.SMS_API_KEY,
            };

            const url = `${process.env.SMS_BASE_URL}/api/sms/send`;
            const response = await axios.post(url, payload);
            console.log(`[Termii SMS] Sent to ${formattedPhone}. Status: ${response.data.message}`);
        } else {
            // Fallback to mock log if credentials are missing
            console.log(`[Mock SMS] To: ${formattedPhone} | Message: ${message}`);
        }
    } catch (error) {
        console.error('Error sending SMS:', error.response ? error.response.data : error.message);
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
