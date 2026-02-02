const genericNotificationTemplate = require('../views/emails/genericNotification');

class GenericNotification {
    constructor(type, data) {
        this.type = type;
        this.data = data;
    }

    build() {
        return {
            subject: this.data.title || 'Notification',
            html: genericNotificationTemplate(this.data)
        };
    }
}

module.exports = GenericNotification;
