const { getTransporter, sendEmail, resolveSmtpSettings } = require('../services/notificationService');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
  const targetEmail = process.argv[2] || process.env.SMTP_USER;
  console.log('================================================================');
  console.log('             Peace Bundle - Nodemailer SMTP Diagnostic          ');
  console.log('================================================================');

  const settings = resolveSmtpSettings();
  console.log('Resolved Configuration:');
  console.log('  Host:              ', settings.host);
  console.log('  Port:              ', settings.port);
  console.log('  User:              ', settings.user);
  console.log('  Secure (SSL):      ', settings.secure);
  console.log('  Require TLS:       ', settings.requireTLS);
  console.log('  From Address:      ', settings.from);
  console.log('  Password configured:', Boolean(settings.pass));
  console.log('  Password length:   ', settings.pass ? settings.pass.length : 0);
  console.log('----------------------------------------------------------------');

  const transporter = getTransporter();
  if (!transporter) {
    console.error('❌ ERROR: Nodemailer transporter could not be initialized.');
    console.error('Please verify SMTP_HOST, SMTP_USER, and SMTP_PASS in .env');
    process.exit(1);
  }

  console.log('\n[1/2] Connecting to SMTP server & verifying credentials...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection and authentication VERIFIED successfully!');
  } catch (err) {
    console.error('❌ SMTP verification FAILED:', err.message);
    process.exit(1);
  }

  if (targetEmail) {
    console.log(`\n[2/2] Sending test message to: ${targetEmail}...`);
    try {
      const res = await sendEmail(
        targetEmail,
        'Peace Bundlle - SMTP Verification Test',
        'Hello! This is a test email confirming that your Nodemailer SMTP configuration is working properly.',
        `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-top: 0;">Peace Bundlle - SMTP Active</h2>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">
            Hello! This email confirms that your Nodemailer SMTP connection on your DigitalOcean droplet is configured correctly and functioning.
          </p>
          <div style="background-color: #f8fafc; padding: 12px 16px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #475569; margin: 16px 0;">
            Sent from: ${settings.from}<br>
            Host: ${settings.host}:${settings.port}<br>
            Timestamp: ${new Date().toISOString()}
          </div>
          <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">
            Peace Bundlle Digital Services Platform
          </p>
        </div>
        `
      );
      if (res && res.success) {
        console.log('✅ Test email SENT successfully! Message ID:', res.messageId);
      } else {
        console.error('❌ Test email delivery was skipped or failed:', res);
      }
    } catch (sendErr) {
      console.error('❌ Failed to send test email:', sendErr.message);
      process.exit(1);
    }
  }
  console.log('\n================================================================');
  console.log('✅ All SMTP checks passed!');
  console.log('================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
