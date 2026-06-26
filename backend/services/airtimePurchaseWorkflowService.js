const sequelize = require('../config/database');
const Transaction = require('../models/Transaction');
const walletService = require('./walletService');
const pricingService = require('./pricingService');
const transactionIntegrityService = require('./transactionIntegrityService');
const simManagementService = require('./simManagementService');
const logger = require('../utils/logger');

const DEFAULT_MAX_ATTEMPTS = Math.max(1, Number.parseInt(process.env.AIRTIME_WALLET_DEBIT_MAX_ATTEMPTS || '3', 10));
const DEFAULT_BASE_DELAY_MS = Math.max(50, Number.parseInt(process.env.AIRTIME_WALLET_DEBIT_RETRY_BASE_MS || '200', 10));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableDatabaseError(error) {
  const name = String(error?.name || '');
  const code = String(error?.original?.code || error?.parent?.code || error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  if (
    name === 'SequelizeConnectionAcquireTimeoutError' ||
    name === 'SequelizeConnectionError' ||
    name === 'SequelizeHostNotReachableError' ||
    name === 'SequelizeHostNotFoundError' ||
    name === 'SequelizeTimeoutError' ||
    name === 'SequelizeDatabaseError'
  ) {
    return true;
  }

  if (['40P01', '40001', '53300', '57014', '57P03', '08000', '08003', '08006', '08001'].includes(code)) {
    return true;
  }

  return (
    message.includes('timeout') ||
    message.includes('deadlock') ||
    message.includes('connection terminated') ||
    message.includes('could not serialize access') ||
    message.includes('connection acquire timeout')
  );
}

function calculateBackoff(attempt) {
  const jitter = Math.floor(Math.random() * 100);
  return DEFAULT_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1)) + jitter;
}

class AirtimePurchaseWorkflowService {
  async prepareCommittedPurchase(user, { network, faceValue, phone, reference = null, context = {} }) {
    const stableReference = String(reference || walletService.generateReference('AIRTIME')).trim();
    const normalizedNetwork = String(network || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim();
    const numericFaceValue = Number(faceValue);

    let lastError = null;
    for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt += 1) {
      const startedAt = new Date().toISOString();
      logger.info('[Airtime][WalletDebit] Attempt started', {
        userId: user?.id || null,
        reference: stableReference,
        network: normalizedNetwork,
        faceValue: numericFaceValue,
        attempt,
        startedAt,
      });

      try {
        const result = await sequelize.transaction(async (t) => {
          const quote = await pricingService.quoteAirtime({
            user,
            provider: normalizedNetwork,
            faceValue: numericFaceValue,
            transaction: t,
          });
          const chargedAmount = parseFloat(String(quote.charged_amount));

          const transactionFingerprint = transactionIntegrityService.buildFingerprint({
            userId: user.id,
            source: 'airtime_purchase',
            recipientPhone: normalizedPhone,
            amount: chargedAmount,
            network: normalizedNetwork,
            faceValue: numericFaceValue,
          });

          const duplicateCandidate = await transactionIntegrityService.findLikelyDuplicate({
            userId: user.id,
            source: 'airtime_purchase',
            fingerprint: transactionFingerprint,
            clientReference: stableReference,
            dbTransaction: t,
          });

          if (duplicateCandidate) {
            return {
              duplicate: true,
              transaction: duplicateCandidate,
              quote,
              chargedAmount,
              transactionFingerprint,
            };
          }

          const newTransaction = await walletService.debit(
            user,
            chargedAmount,
            'airtime_purchase',
            `${normalizedNetwork.toUpperCase()} Airtime N${numericFaceValue} to ${normalizedPhone}`,
            {
              network: normalizedNetwork,
              phone: normalizedPhone,
              faceValue: numericFaceValue,
              type: 'airtime',
              pricing: quote,
              reference: stableReference,
              client_reference: stableReference,
            },
            t,
          );

          await transactionIntegrityService.annotateDebitTransaction(
            newTransaction,
            {
              recipient_phone: normalizedPhone,
              provider: normalizedNetwork,
              client_reference: stableReference,
              transaction_fingerprint: transactionFingerprint,
            },
            t,
          );

          await newTransaction.update(
            {
              status: 'processing',
              recipient_phone: normalizedPhone,
              provider: normalizedNetwork,
              metadata: {
                ...(newTransaction.metadata || {}),
                vend_amount: numericFaceValue,
                charged_amount: chargedAmount,
                service_type: 'airtime',
                pricing: quote,
                wallet_deduction: {
                  phase: 'committed_pre_provider',
                  committedAt: new Date().toISOString(),
                  retryAttempt: attempt,
                },
              },
            },
            { transaction: t },
          );

          const preferredSim = await simManagementService.getOptimalSim(normalizedNetwork, numericFaceValue);
          const route = transactionIntegrityService.selectAirtimeRoute({ network: normalizedNetwork, preferredSim });
          await transactionIntegrityService.lockRoute(newTransaction, route, t);
          if (route.simId) {
            newTransaction.simId = route.simId;
            await newTransaction.save({ transaction: t });
          }

          return {
            duplicate: false,
            transaction: newTransaction,
            quote,
            chargedAmount,
            route,
            transactionFingerprint,
          };
        });

        logger.info('[Airtime][WalletDebit] Attempt succeeded', {
          userId: user?.id || null,
          reference: stableReference,
          network: normalizedNetwork,
          chargedAmount: Number(result?.chargedAmount || 0),
          attempt,
          duplicate: Boolean(result?.duplicate),
          committedAt: new Date().toISOString(),
        });

        return {
          ...result,
          reference: stableReference,
        };
      } catch (error) {
        lastError = error;
        const retryable = isRetryableDatabaseError(error);

        logger.error('[Airtime][WalletDebit] Attempt failed', {
          userId: user?.id || null,
          reference: stableReference,
          network: normalizedNetwork,
          faceValue: numericFaceValue,
          attempt,
          retryable,
          error: error.message,
          stack: error.stack,
          failedAt: new Date().toISOString(),
        });

        const existing = await Transaction.findOne({ where: { reference: stableReference } });
        if (existing) {
          logger.warn('[Airtime][WalletDebit] Recovered existing transaction after failed attempt', {
            userId: user?.id || null,
            reference: stableReference,
            attempt,
            status: existing.status,
          });

          return {
            duplicate: true,
            transaction: existing,
            quote: existing.metadata?.pricing || null,
            chargedAmount: Number(existing.metadata?.charged_amount || existing.amount || 0),
            route: {
              paymentChannel: existing.payment_channel || null,
              fulfillmentRoute: existing.fulfillment_route || null,
              provider: existing.provider || normalizedNetwork,
              simId: existing.simId || null,
            },
            transactionFingerprint: String(existing.metadata?.transaction_fingerprint || ''),
            reference: stableReference,
          };
        }

        if (!retryable || attempt >= DEFAULT_MAX_ATTEMPTS) {
          throw error;
        }

        const delayMs = calculateBackoff(attempt);
        logger.warn('[Airtime][WalletDebit] Scheduling retry', {
          userId: user?.id || null,
          reference: stableReference,
          attempt,
          delayMs,
        });
        await sleep(delayMs);
      }
    }

    throw lastError || new Error('Failed to prepare airtime purchase');
  }
}

module.exports = new AirtimePurchaseWorkflowService();
