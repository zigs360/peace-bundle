const { User } = require('../models');
const dataPurchaseService = require('../services/dataPurchaseService');
const notificationService = require('../services/notificationService');
const BulkSendCompleted = require('../notifications/bulkSendCompleted');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { job: 'ProcessBulkDataSend' },
  transports: [
    new winston.transports.File({ filename: 'jobs.log' })
  ]
});

class ProcessBulkDataSend {
  constructor(user, purchases) {
    this.user = user;
    this.purchases = purchases;
  }

  async handle() {
    try {
      const results = await dataPurchaseService.bulkPurchase(this.user, this.purchases);
      
      logger.info("Bulk data send completed", {
        user_id: this.user.id,
        success: results.success,
        failed: results.failed
      });
      
      // Use BulkSendCompleted Notification
      const notification = new BulkSendCompleted(results);
      const mailData = notification.toMail(this.user);
      
      // Send Email
      if (this.user.email) {
          const message = mailData.lines.join('\n');
          const html = `
            <h3>${mailData.subject}</h3>
            ${mailData.lines.map(line => `<p>${line}</p>`).join('')}
            <p><a href="${mailData.action.url}">${mailData.action.text}</a></p>
          `;
          
          await notificationService.sendEmail(this.user.email, mailData.subject, message, html);
      }
      
    } catch (error) {
      logger.error("Bulk data send failed", {
        user_id: this.user.id,
        error: error.message
      });
    }
  }

  static dispatch(user, purchases) {
    const job = new ProcessBulkDataSend(user, purchases);
    setImmediate(() => job.handle());
  }
}

module.exports = ProcessBulkDataSend;
