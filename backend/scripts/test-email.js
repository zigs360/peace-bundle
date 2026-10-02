const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

const sanitizePassword = (pass, host, user) => {
  if (typeof pass !== 'string') return pass;
  let clean = pass.trim();
  if ((host && host.includes('gmail')) || (user && user.includes('@gmail.com'))) {
    clean = clean.replace(/\s+/g, '');
  }
  return clean;
};

async function testConnection(config, label) {
  console.log(`\nTesting connection for: ${label}`);
  console.log(`  Host: ${config.host}, Port: ${config.port}, Secure: ${config.secure}, RequireTLS: ${Boolean(config.requireTLS)}`);
  
  const transporter = nodemailer.createTransport({
    ...config,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });

  try {
    await transporter.verify();
    console.log(`  ✅ ${label}: Connection & Authentication verified successfully!`);
    return { ok: true, transporter };
  } catch (err) {
    console.log(`  ❌ ${label} Failed: [${err.code || 'ERROR'}] ${err.message}`);
    if (String(err.message).includes('535') || String(err.message).includes('Username and Password not accepted')) {
      console.log('     ⚠️  NOTE: Google rejected credentials (535). Please verify:');
      console.log('        1. Google Account has 2-Step Verification turned ON.');
      console.log('        2. App Password was generated specifically for "Mail" in Google Security settings.');
      console.log('        3. App Password has 16 characters.');
    } else if (['ETIMEDOUT', 'ECONNREFUSED', 'ESOCKETTIMEDOUT', 'EHOSTUNREACH'].includes(err.code) || String(err.message).toLowerCase().includes('timeout')) {
      console.log(`     ⚠️  NOTE: Port ${config.port} timed out or was refused. The hosting provider/firewall may block this port.`);
    }
    return { ok: false, error: err };
  }
}

async function main() {
  const targetEmail = process.argv[2] || process.env.SMTP_USER || 'peacebundlle@gmail.com';
  console.log('================================================================');
  console.log('          Peace Bundle - Advanced Nodemailer SMTP Diagnostic     ');
  console.log('================================================================');

  const rawHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const rawPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const rawUser = process.env.SMTP_USER || process.env.gmail_user;
  const rawPass = process.env.SMTP_PASS || process.env.gmail_pass;
  const pass = sanitizePassword(rawPass, rawHost, rawUser);
  const from = process.env.SMTP_FROM || `"Peace Bundlle" <${rawUser || 'noreply@peacebundlle.com'}>`;

  console.log('Active Environment Settings:');
  console.log('  SMTP_HOST:         ', rawHost);
  console.log('  SMTP_PORT:         ', rawPort);
  console.log('  SMTP_USER:         ', rawUser || '(MISSING)');
  console.log('  SMTP_PASS length:  ', pass ? pass.length : 0);
  console.log('  SMTP_FROM:         ', from);
  console.log('----------------------------------------------------------------');

  if (!rawUser || !pass) {
    console.error('\n❌ ERROR: Missing SMTP_USER or SMTP_PASS.');
    console.error('Please ensure your .env file contains:');
    console.error('SMTP_USER=peacebundlle@gmail.com');
    console.error('SMTP_PASS=tmrsxwqfawuttfsc');
    process.exit(1);
  }

  // 1. Test primary configuration from env
  const isEnvSecure = process.env.SMTP_SECURE === 'true' || rawPort === 465;
  const primaryConfig = {
    host: rawHost,
    port: rawPort,
    secure: isEnvSecure,
    requireTLS: rawPort === 587,
    auth: { user: rawUser, pass },
  };

  let workingTransporter = null;
  let workingPort = null;

  const primaryResult = await testConnection(primaryConfig, `Configured Port (${rawPort})`);
  if (primaryResult.ok) {
    workingTransporter = primaryResult.transporter;
    workingPort = rawPort;
  } else {
    // If primary failed, test alternate port
    const altPort = rawPort === 465 ? 587 : 465;
    const altConfig = {
      host: rawHost,
      port: altPort,
      secure: altPort === 465,
      requireTLS: altPort === 587,
      auth: { user: rawUser, pass },
    };

    console.log(`\nAttempting alternate fallback port ${altPort}...`);
    const altResult = await testConnection(altConfig, `Fallback Port (${altPort})`);
    if (altResult.ok) {
      workingTransporter = altResult.transporter;
      workingPort = altPort;
      console.log(`\n💡 RECOMMENDATION: Port ${altPort} works on your server! Consider setting SMTP_PORT=${altPort} and SMTP_SECURE=${altPort === 465 ? 'true' : 'false'} in .env`);
    }
  }

  if (!workingTransporter) {
    console.error('\n❌ Both primary and alternate SMTP connection attempts failed.');
    console.error('Please check the logs above to identify if this is a credential error (535) or a network/port block.');
    process.exit(1);
  }

  // 2. Send test email
  if (targetEmail) {
    console.log(`\n[Sending Test Email via Port ${workingPort}] to: ${targetEmail}...`);
    try {
      const info = await workingTransporter.sendMail({
        from,
        to: targetEmail,
        subject: 'Peace Bundlle - SMTP Email Delivery Confirmed',
        text: `Hello! This is an automated email confirming that SMTP email delivery is operational on your server.\n\nSent from: ${from}\nHost: ${rawHost}:${workingPort}\nTimestamp: ${new Date().toISOString()}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
            <h2 style="color: #0f766e; margin-top: 0;">Peace Bundlle - SMTP Operational</h2>
            <p style="color: #334155; font-size: 15px; line-height: 1.6;">
              Hello! This test confirms that your transactional email service on your server is now connected and delivering messages successfully.
            </p>
            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px 16px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #166534; margin: 16px 0;">
              Status: <strong>DELIVERED</strong><br>
              Host: ${rawHost}:${workingPort}<br>
              From: ${from}<br>
              To: ${targetEmail}<br>
              Timestamp: ${new Date().toISOString()}
            </div>
            <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">
              Peace Bundlle Platform - Automated Notification
            </p>
          </div>
        `,
      });

      console.log('✅ Test email SENT successfully!');
      console.log('   Message ID:    ', info.messageId);
      console.log('   Accepted by:   ', info.accepted?.join(', ') || targetEmail);
      console.log('   Delivery Port: ', workingPort);
    } catch (sendErr) {
      console.error('❌ Failed to send email message:', sendErr.message);
      process.exit(1);
    }
  }

  console.log('\n================================================================');
  console.log('✅ All SMTP checks completed successfully!');
  console.log('================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal diagnostic error:', err);
  process.exit(1);
});
