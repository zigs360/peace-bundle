const { User } = require('../models');
const notificationService = require('../services/notificationService');
const GenericNotification = require('../mail/genericNotification');
const winston = require('winston');

class SendNotificationJob {
  constructor(user, type, data = []) {
    this.user = user;
    this.type = type;
    this.data = data;
  }

  async handle() {
    try {
        // Use GenericNotification Mailable logic if applicable
        const mailable = new GenericNotification(this.type, this.data);
        const mailContent = mailable.build();
        
        // Send Email
        if (this.user.email) {
            await notificationService.sendEmail(
                this.user.email, 
                mailContent.subject, 
                this.data.message || 'Notification', // Fallback text
                mailContent.html
            );
        }
        
        // Send SMS (Simple text)
        if (this.user.phone) {
             const smsMessage = this.data.message || `Notification: ${this.type}`;
            await notificationService.sendSMS(this.user.phone, smsMessage);
        }
    } catch (error) {
        console.error('SendNotificationJob failed:', error);
    }
  }

  static dispatch(user, type, data = []) {
    const job = new SendNotificationJob(user, type, data);
    setImmediate(() => job.handle());
  }
}

module.exports = SendNotificationJob;
