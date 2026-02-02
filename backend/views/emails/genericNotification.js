// Template function to mimic resources/views/emails/generic-notification.blade.php
const genericNotificationTemplate = (data) => {
    const title = data.title || 'Notification';
    const message = data.message || 'You have a new notification.';
    const actionButton = data.action_url ? `
    <tr>
        <td align="center">
            <a href="${data.action_url}" style="background-color: #3490dc; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                ${data.action_text || 'View Details'}
            </a>
        </td>
    </tr>
    ` : '';
    const appName = process.env.APP_NAME || 'Peace Bundle';

    return `
<!DOCTYPE html>
<html>
<head>
<style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
    .header { text-align: center; margin-bottom: 20px; }
    .footer { margin-top: 20px; font-size: 0.8em; color: #777; text-align: center; }
</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${title}</h1>
        </div>
        
        <p>${message.replace(/\n/g, '<br>')}</p>
        
        <table width="100%" cellpadding="0" cellspacing="0">
            ${actionButton}
        </table>
        
        <div class="footer">
            <p>Thanks,<br>${appName}</p>
        </div>
    </div>
</body>
</html>
    `;
};

module.exports = genericNotificationTemplate;
