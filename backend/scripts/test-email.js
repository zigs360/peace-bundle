const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
  const targetEmail = process.argv[2] || process.env.SMTP_USER;
  console.log('================================================================');
  console.log('             Peace Bundle - Nodemailer SMTP Diagnostic          ');
  console.log('================================================================');

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  let pass = process.env.SMTP_PASS;
  if (pass && typeof pass === 'string' && (host.includes('gmail') || (user && user.includes('@gmail.com')))) {
    pass = pass.replace(/\s+/g, '');
  }
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const from = process.env.SMTP_FROM || `"Peace Bundlle" <${user}>`;

  console.log('Configuration:');
  console.log('  Host:              ', host);
  console.log('  Port:              ', port);
  console.log('  User:              ', user);
  console.log('  Secure (SSL):      ', secure);
  console.log('  From:              ', from);
  console.log('  Password length:   ', pass ? pass.length : 0);
  console.log('----------------------------------------------------------------');

  if (!user || !pass) {
    console.error('❌ ERROR: Missing SMTP_USER or SMTP_PASS in environment.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 15000,
  });

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
      const info = await transporter.sendMail({
        from,
        to: targetEmail,
        subject: 'Peace Bundlle - SMTP Verification Test',
        text: 'Hello! Your Nodemailer SMTP configuration is working properly on DigitalOcean.',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563eb; margin-top: 0;">Peace Bundlle - SMTP Active</h2>
            <p style="color: #334155; font-size: 15px; line-height: 1.6;">
              Hello! This email confirms that your Nodemailer SMTP connection on your DigitalOcean droplet is configured correctly and functioning.
            </p>
            <div style="background-color: #f8fafc; padding: 12px 16px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #475569; margin: 16px 0;">
              Sent from: ${from}<br>
              Host: ${host}:${port}<br>
              Timestamp: ${new Date().toISOString()}
            </div>
            <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">
              Peace Bundlle Digital Services Platform
            </p>
          </div>
        `,
      });
      console.log('✅ Test email SENT successfully! Message ID:', info.messageId);
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
