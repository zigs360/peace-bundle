const eventBus = require('../events/eventBus');

// Events
const TransactionCompleted = require('../events/transactionCompleted');
const SimBalanceLow = require('../events/simBalanceLow');
const SimBanned = require('../events/simBanned');
const WalletFunded = require('../events/walletFunded');

// Listeners
const SendTransactionNotification = require('../listeners/sendTransactionNotification');
const AlertSimOwner = require('../listeners/alertSimOwner');
const PauseBannedSim = require('../listeners/pauseBannedSim');
const CalculateAffiliateCommission = require('../listeners/calculateAffiliateCommission');

class EventServiceProvider {
    static boot() {
        // Register mappings
        
        // TransactionCompleted -> SendTransactionNotification
        eventBus.on(TransactionCompleted.name, (event) => {
            SendTransactionNotification.handle(event);
        });

        // SimBalanceLow -> AlertSimOwner
        eventBus.on(SimBalanceLow.name, (event) => {
            AlertSimOwner.handle(event);
        });

        // SimBanned -> PauseBannedSim
        eventBus.on(SimBanned.name, (event) => {
            PauseBannedSim.handle(event);
        });

        // WalletFunded -> CalculateAffiliateCommission
        eventBus.on(WalletFunded.name, (event) => {
            CalculateAffiliateCommission.handle(event);
        });

        console.log('Event listeners registered.');
    }
}

module.exports = EventServiceProvider;
