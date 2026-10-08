const { Transaction, SystemSetting } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

class TransactionLimitService {
  /**
   * Check if user can make a transaction
   * @param {User} user
   * @returns {Promise<Object>}
   */
  async canTransact(user) {
    // Check if limits are globally disabled
    try {
      const enabledSetting = await SystemSetting.findOne({ where: { key: 'transaction_limits_enabled' } });
      if (enabledSetting && (enabledSetting.value === 'false' || enabledSetting.value === false)) {
        return { allowed: true };
      }
    } catch (_) {}

    // Determine role (User model has 'role' field)
    const role = user.role || 'user';

    // Get limits for role
    const limits = await this.getLimitsForRole(role);

    // Check daily limit (count)
    let dailyCount = 0;
    if (limits.daily_transactions && limits.daily_transactions > 0) {
      dailyCount = await this.getDailyTransactionCount(user);
      if (dailyCount >= limits.daily_transactions) {
        return {
          allowed: false,
          reason: 'Daily transaction limit reached',
          limit: limits.daily_transactions,
          current: dailyCount,
        };
      }
    }

    // Check hourly limit (count)
    let hourlyCount = 0;
    if (limits.hourly_transactions && limits.hourly_transactions > 0) {
      hourlyCount = await this.getHourlyTransactionCount(user);
      if (hourlyCount >= limits.hourly_transactions) {
        return {
          allowed: false,
          reason: 'Hourly transaction limit reached',
          limit: limits.hourly_transactions,
          current: hourlyCount,
        };
      }
    }

    // Check daily value limit (sum amount)
    let dailyValue = 0;
    if (limits.daily_value_limit && limits.daily_value_limit > 0) {
      dailyValue = await this.getDailyTransactionValue(user);
      if (dailyValue >= limits.daily_value_limit) {
        return {
          allowed: false,
          reason: 'Daily transaction value limit reached',
          limit: limits.daily_value_limit,
          current: dailyValue,
        };
      }
    }

    return {
      allowed: true,
      daily_remaining: limits.daily_transactions ? limits.daily_transactions - dailyCount : null,
      hourly_remaining: limits.hourly_transactions ? limits.hourly_transactions - hourlyCount : null,
    };
  }

  /**
   * Get limits configuration for a role
   * @param {string} role
   * @returns {Promise<Object>}
   */
  async getLimitsForRole(role) {
    // Default limits structure - unlimited by default unless explicitly configured in SystemSetting
    const defaults = {
      user: {
        daily_transactions: null,
        hourly_transactions: null,
        daily_value_limit: null,
      },
      reseller: {
        daily_transactions: null,
        hourly_transactions: null,
        daily_value_limit: null,
      },
      admin: {
        daily_transactions: null, // Unlimited
        hourly_transactions: null,
        daily_value_limit: null,
      }
    };

    // Try to fetch overrides from SystemSetting
    // Keys like: transaction_limits_user_daily_transactions
    const keys = [
      `transaction_limits_${role}_daily_transactions`,
      `transaction_limits_${role}_hourly_transactions`,
      `transaction_limits_${role}_daily_value_limit`
    ];

    const settings = await SystemSetting.findAll({
      where: { key: { [Op.in]: keys } }
    });

    const roleDefaults = defaults[role] || defaults['user'];
    const limits = { ...roleDefaults };

    settings.forEach(s => {
      const val = parseInt(s.value, 10);
      if (s.key.includes('daily_transactions')) limits.daily_transactions = Number.isFinite(val) && val > 0 ? val : null;
      if (s.key.includes('hourly_transactions')) limits.hourly_transactions = Number.isFinite(val) && val > 0 ? val : null;
      if (s.key.includes('daily_value_limit')) {
        const floatVal = parseFloat(s.value);
        limits.daily_value_limit = Number.isFinite(floatVal) && floatVal > 0 ? floatVal : null;
      }
    });

    return limits;
  }

  /**
   * Get daily transaction count for user
   * @param {User} user
   * @returns {Promise<number>}
   */
  async getDailyTransactionCount(user) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return Transaction.count({
      where: {
        userId: user.id,
        createdAt: { [Op.gte]: startOfDay },
        status: { [Op.in]: ['completed', 'processing', 'pending'] }
      }
    });
  }

  /**
   * Get hourly transaction count for user
   * @param {User} user
   * @returns {Promise<number>}
   */
  async getHourlyTransactionCount(user) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    return Transaction.count({
      where: {
        userId: user.id,
        createdAt: { [Op.gte]: oneHourAgo },
        status: { [Op.in]: ['completed', 'processing', 'pending'] }
      }
    });
  }

  /**
   * Get daily transaction value (sum of amounts)
   * @param {User} user
   * @returns {Promise<number>}
   */
  async getDailyTransactionValue(user) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sum = await Transaction.sum('amount', {
      where: {
        userId: user.id,
        type: 'debit', // Only count spending
        status: { [Op.in]: ['completed', 'processing', 'pending'] },
        createdAt: { [Op.gte]: startOfDay }
      }
    });

    return sum || 0;
  }

  /**
   * Legacy checkLimit method (keeping for backward compatibility if needed)
   */
  async checkLimit(user, amount, type) {
    return (await this.canTransact(user)).allowed;
  }
}

module.exports = new TransactionLimitService();