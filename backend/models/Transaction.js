const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
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

  // Virtual field for frontend compatibility
  date: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('createdAt');
    }
  },
}, {
  timestamps: true,
  tableName: 'transactions',
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
      {
          fields: ['status', 'createdAt'] // Indexing status + created_at
      },
      {
          fields: ['recipient_phone', 'createdAt'] // Indexing recipient + created_at
      }
  ]
});

// Instance Methods
Transaction.prototype.markAsCompleted = async function(smeplugResponse = []) {
  this.status = 'completed';
  this.completed_at = new Date();
  this.smeplug_response = smeplugResponse;
  await this.save();
};

Transaction.prototype.markAsFailed = async function(reason) {
  this.status = 'failed';
  this.failure_reason = reason;
  await this.save();
};

module.exports = Transaction;
