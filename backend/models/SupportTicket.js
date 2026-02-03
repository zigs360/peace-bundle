const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const crypto = require('crypto');

const SupportTicket = sequelize.define('SupportTicket', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  // user_id added by association
  
  ticket_number: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium',
  },
  status: {
    type: DataTypes.ENUM('open', 'resolved', 'closed'),
    defaultValue: 'open',
  },
  
  // assigned_to (User ID) added by association
  
  admin_response: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  }
}, {
  timestamps: true,
  tableName: 'support_tickets',
  hooks: {
    beforeValidate: (ticket) => {
      if (!ticket.ticket_number) {
        // Generate Ticket Number: TKT-RANDOM8
        ticket.ticket_number = 'TKT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      }
    }
  },
  scopes: {
    open: {
      where: { status: 'open' }
    },
    resolved: {
      where: { status: 'resolved' }
    }
  }
});

// Instance Methods
SupportTicket.prototype.markAsResolved = async function(response) {
  this.status = 'resolved';
  this.admin_response = response;
  this.resolved_at = new Date();
  await this.save();
};

module.exports = SupportTicket;
