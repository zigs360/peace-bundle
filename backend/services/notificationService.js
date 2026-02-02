const nodemailer = require('nodemailer');
const axios = require('axios');

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
        if (!to) return;
        
        // If credentials are still placeholders, log and return to prevent timeout/errors
        if (process.env.SMTP_USER && process.env.SMTP_USER.includes('your_email')) {
            console.log(`[Mock Email] (Credentials not set) To: ${to} | Subject: ${subject}`);
            return;
        }

        const info = await transporter.sendMail({
            from: '"Peace Bundle" <noreply@peacebundle.com>', // sender address
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
                from: process.env.SMS_SENDER_ID || 'PeaceBundle',
                sms: message,
                type: 'plain',
                channel: 'generic',
                api_key: process.env.SMS_API_KEY,
            };

            const response = await axios.post(process.env.SMS_BASE_URL, payload);
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

    const subject = `Transaction Notification: ${transaction.type}`;
    const message = `
        Dear ${user.fullName},
        
        Your transaction was successful.
        
        Type: ${transaction.type}
        Amount: ₦${transaction.amount}
        Status: ${transaction.status}
        Reference: ${transaction.reference}
        Date: ${new Date().toLocaleString()}
        
        Current Balance: ₦${user.balance}
        
        Thank you for using Peace Bundle.
    `;
    
    const htmlMessage = `
        <h3>Transaction Notification</h3>
        <p>Dear ${user.name},</p>
        <p>Your transaction was successful.</p>
        <ul>
            <li><strong>Type:</strong> ${transaction.type}</li>
            <li><strong>Amount:</strong> ₦${transaction.amount}</li>
            <li><strong>Status:</strong> ${transaction.status}</li>
            <li><strong>Reference:</strong> ${transaction.reference}</li>
            <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p><strong>Current Balance:</strong> ₦${user.balance}</p>
        <p>Thank you for using Peace Bundle.</p>
    `;

    // Send Email
    await sendEmail(user.email, subject, message, htmlMessage);

    // Send SMS (Short version)
    const smsMessage = `PeaceBundle: ${transaction.type} of N${transaction.amount} successful. Ref: ${transaction.reference}. Bal: N${user.balance}.`;
    await sendSMS(user.phone, smsMessage);
};

module.exports = {
    sendEmail,
    sendSMS,
    sendTransactionNotification
};
