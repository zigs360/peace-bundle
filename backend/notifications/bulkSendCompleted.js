class BulkSendCompleted {
    constructor(results) {
        this.results = results;
    }

    via(notifiable) {
        return ['mail', 'database'];
    }

    toMail(notifiable) {
        // Return object structure similar to Laravel's MailMessage for consumption by NotificationService
        return {
            subject: 'Bulk Data Send Completed',
            lines: [
                "Your bulk data send has been processed.",
                `Successful: ${this.results.success}`,
                `Failed: ${this.results.failed}`
            ],
            action: {
                text: 'View Transactions',
                url: process.env.SITE_URL ? `${process.env.SITE_URL}/user/transactions` : '/user/transactions'
            }
        };
    }

    toArray(notifiable) {
        return this.results;
    }
}

module.exports = BulkSendCompleted;
