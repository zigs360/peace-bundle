const SendNotificationJob = require('../jobs/sendNotificationJob');

class SendTransactionNotification {
  async handle(event) {
    try {
        const transaction = event.transaction;
        // Assuming transaction.user is populated, otherwise we might need to fetch it
        // However, in the event we usually pass loaded models
        const user = transaction.user || await transaction.getUser(); 
        const dataPlan = transaction.dataPlan || (transaction.dataPlanId ? await transaction.getDataPlan() : { name: 'Unknown Plan' });
        
        const data = {
            title: 'Transaction Completed',
            message: `Your data purchase of ${dataPlan.name} to ${transaction.recipient_phone} was successful!`,
            amount: transaction.amount,
            reference: transaction.reference,
        };
        
        SendNotificationJob.dispatch(user, 'transaction_completed', data);
    } catch (error) {
        console.error('SendTransactionNotification Error:', error);
    }
  }
}

module.exports = new SendTransactionNotification();
