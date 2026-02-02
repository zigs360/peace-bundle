const affiliateService = require('../services/affiliateService');

class CalculateAffiliateCommission {
    async handle(event) {
        try {
            await affiliateService.processFundingCommission(
                event.user,
                event.transaction
            );
        } catch (error) {
            console.error('CalculateAffiliateCommission Error:', error);
        }
    }
}

module.exports = new CalculateAffiliateCommission();
