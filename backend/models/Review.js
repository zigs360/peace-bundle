const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly

const Review = sequelize.define('Review', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 5,
    },
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
  },
  helpfulCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  rejectionReason: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['userId'],
    },
    {
      fields: ['status'],
    },
    {
      fields: ['rating'],
    },
    {
      fields: ['createdAt'],
    },
  ],
});

module.exports = Review;
