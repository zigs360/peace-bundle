const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly
const crypto = require('crypto');

const TREASURY_SYNC_SOURCES = new Set(['funding', 'data_purchase']);

function hasTreasurySyncMetadata(transaction) {
  return Boolean(transaction?.metadata?.treasury_sync?.syncedAt);
}

function shouldScheduleTreasurySync(transaction) {
  return Boolean(
    transaction &&
    String(transaction.status || '').toLowerCase() === 'completed' &&
    TREASURY_SYNC_SOURCES.has(String(transaction.source || '').toLowerCase()) &&
    !hasTreasurySyncMetadata(transaction)
  );
}

function enqueueTreasurySync(transaction, options = {}, reason) {
  const run = () => {
    try {
      const treasuryService = require('../services/treasuryService');
      treasuryService.scheduleAutoSync({
        reason,
        transactionId: transaction.id,
        source: transaction.source,
        reference: transaction.reference,
      }).catch(() => {});
    } catch (error) {
      void error;
    }
  };

  if (options.transaction && typeof options.transaction.afterCommit === 'function') {
    options.transaction.afterCommit(() => run());
    return;
  }

  run();
}

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: () => crypto.randomUUID(),
    primaryKey: true,
  },
  // user_id will be added by association (from Wallet or direct User)
  // data_plan_id will be added by association
  // sim_id will be added by association

  // Type: keeping for wallet logic (credit/debit)
  type: {
    type: DataTypes.ENUM('credit', 'debit'),
    allowNull: false,
  },
  
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  
  balance_before: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'wallet_balance_before' // Mapping to user schema requirement
  },
  balance_after: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'wallet_balance_after' // Mapping to user schema requirement
  },
  
  source: {
    type: DataTypes.ENUM(
      'funding',          
      'data_purchase',    
      'airtime_purchase', 
      'bill_payment',     
      'exam_payment',     
      'bulk_sms_payment', 
      'refund',           
      'withdrawal',       
      'commission',       
      'bonus',            
      'transfer'          
    ),
    allowNull: false,
  },
  
  provider: {
    type: DataTypes.ENUM('mtn', 'airtel', 'glo', '9mobile'),
    allowNull: true, // Nullable because not all transactions are telco-related (e.g. funding)
  },

  recipient_phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  reference: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'refunded', 'queued'),
    defaultValue: 'pending'
  },

  // Smeplug Integration
  smeplug_reference: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  smeplug_response: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // Failure Handling
  failure_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  retry_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },

  userId: {
    type: DataTypes.UUID,
    allowNull: true,
  },

  walletId: {
    type: DataTypes.UUID,
    allowNull: true,
  },

  dataPlanId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  simId: {
    type: DataTypes.UUID,
    allowNull: true,
  },

}, {
  timestamps: true,
  tableName: 'transactions',
  hooks: {
    afterCreate(transaction, options) {
      if (String(transaction.source || '').toLowerCase() !== 'funding') return;
      if (!shouldScheduleTreasurySync(transaction)) return;
      enqueueTreasurySync(transaction, options, 'funding_created_completed');
    },
    afterUpdate(transaction, options) {
      const previousStatus = String(transaction.previous('status') || '').toLowerCase();
      const currentStatus = String(transaction.status || '').toLowerCase();
      if (previousStatus === currentStatus) return;
      if (currentStatus !== 'completed') return;
      if (!shouldScheduleTreasurySync(transaction)) return;
      enqueueTreasurySync(transaction, options, 'transaction_marked_completed');
    },
  },
  scopes: {
    pending: {
      where: {
        status: 'pending'
      }
    },
    completed: {
      where: {
        status: 'completed'
      }
    },
    failed: {
      where: {
        status: 'failed'
      }
    },
    byProvider(provider) {
      return {
        where: {
          provider: provider
        }
      }
    }
  },
  indexes: [
    { fields: ['userId'] },
    { fields: ['walletId'] },
    { fields: ['status'] },
    { fields: ['type'] },
    { fields: ['source'] },
    { fields: ['createdAt'] },
    { fields: ['status', 'createdAt'] },
    { fields: ['recipient_phone', 'createdAt'] },
    { fields: ['reference'] }
  ]
});

// Instance Methods
Transaction.prototype.markAsCompleted = async function(smeplugResponse = [], transaction = null) {
  this.status = 'completed';
  this.completed_at = new Date();
  this.smeplug_response = smeplugResponse;
  await this.save({ transaction });
};

Transaction.prototype.markAsFailed = async function(reason, transaction = null) {
  this.status = 'failed';
  this.failure_reason = reason;
  await this.save({ transaction });
};

module.exports = Transaction;
