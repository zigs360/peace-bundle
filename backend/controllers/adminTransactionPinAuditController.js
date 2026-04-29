const { Op } = require('sequelize');
const TransactionPinSecurityEvent = require('../models/TransactionPinSecurityEvent');
const User = require('../models/User');
const logger = require('../utils/logger');

const listTransactionPinSecurityEvents = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', eventType = '', status = '' } = req.query;
    const take = Math.min(200, Math.max(1, Number(limit) || 50));
    const offset = (Math.max(1, Number(page) || 1) - 1) * take;

    const where = {};
    if (eventType) where.eventType = String(eventType).trim();
    if (status) where.status = String(status).trim();

    const trimmedSearch = String(search || '').trim();
    const userWhere = trimmedSearch
      ? {
          [Op.or]: [
            { name: { [Op.like]: `%${trimmedSearch}%` } },
            { email: { [Op.like]: `%${trimmedSearch}%` } },
            { phone: { [Op.like]: `%${trimmedSearch}%` } },
          ],
        }
      : undefined;

    const { count, rows } = await TransactionPinSecurityEvent.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone'],
          required: Boolean(userWhere),
          where: userWhere,
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: take,
      offset,
    });

    return res.json({
      success: true,
      count,
      rows,
      page: Math.max(1, Number(page) || 1),
      limit: take,
    });
  } catch (error) {
    logger.error('[PIN][ADMIN] Failed to list security events', {
      adminId: req.user?.id,
      message: error.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction PIN security events',
    });
  }
};

module.exports = {
  listTransactionPinSecurityEvents,
};
