const { User, Wallet, Transaction, Referral, ReferralClick, Commission } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const logger = require('../utils/logger');

const QUALIFYING_SERVICE_SOURCES = [
    'data_purchase',
    'airtime_purchase',
    'bill_payment',
    'exam_payment',
    'bulk_sms_payment',
    'transfer'
];

/**
 * Classify referral activity and engagement status
 * Rules:
 * - Suspended: Account banned/suspended
 * - New: Registered within the last 7 days and has 0 successful qualifying transactions
 * - Active: Has at least 1 successful qualifying transaction within inactivityDays
 * - Inactive: Has completed a qualifying transaction before OR registered > 7 days ago, but no transaction within inactivityDays
 * - Registered Only: Registered > 7 days ago and has 0 successful transactions all-time
 */
function classifyReferralActivity(user, lastTxDate, inactivityDays = 30) {
    const accountStatus = String(user.account_status || 'active').toLowerCase();
    if (accountStatus === 'banned' || accountStatus === 'suspended') {
        return 'suspended';
    }

    const now = Date.now();
    const registeredAt = new Date(user.createdAt || user.registered_at || now).getTime();
    const daysSinceRegistration = (now - registeredAt) / (1000 * 60 * 60 * 24);

    if (!lastTxDate) {
        if (daysSinceRegistration <= 7) {
            return 'new';
        }
        return 'registered_only';
    }

    const lastTxTime = new Date(lastTxDate).getTime();
    const daysSinceLastTx = (now - lastTxTime) / (1000 * 60 * 60 * 24);

    if (daysSinceLastTx <= inactivityDays) {
        return 'active';
    }

    return 'inactive';
}

/**
 * Get comprehensive referral leaderboard for administrators
 */
async function getReferralLeaderboard({
    period = 'all_time',
    limit = 50,
    inactivityDays = 30,
    sortBy = 'total_referrals',
    sortOrder = 'DESC'
} = {}) {
    const inactivityNum = Math.max(1, parseInt(inactivityDays, 10) || 30);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 5), 100);

    let startDate = null;
    const now = new Date();
    if (period === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Find all distinct referrers
    const whereReferral = {};
    if (startDate) {
        whereReferral.createdAt = { [Op.gte]: startDate };
    }

    const referralAgg = await Referral.findAll({
        attributes: [
            'referrerId',
            [sequelize.fn('COUNT', sequelize.col('id')), 'totalReferrals'],
            [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('referrer_signup_bonus_amount')), 0), 'totalBonusAmount'],
            [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_commissions_earned')), 0), 'totalCommissions']
        ],
        where: whereReferral,
        group: ['referrerId'],
        raw: true
    });

    const referrerIds = referralAgg.map(r => r.referrerId).filter(Boolean);
    if (referrerIds.length === 0) {
        return {
            totalRankedUsers: 0,
            summary: {
                totalRankedUsers: 0,
                totalReferrals: 0,
                totalActiveReferrals: 0,
                totalTransactingReferrals: 0,
                overallConversionRate: 0,
                totalReferralVolume: 0,
                totalBonusPaid: 0,
                topPerformer: null
            },
            leaderboard: []
        };
    }

    // Fetch referrer user details
    const referrers = await User.findAll({
        where: { id: { [Op.in]: referrerIds } },
        attributes: ['id', 'name', 'email', 'phone', 'role', 'avatar', 'account_status', 'referral_code', 'createdAt'],
        include: [{
            model: Wallet,
            as: 'wallet',
            attributes: ['balance']
        }]
    });
    const referrerMap = new Map(referrers.map(u => [String(u.id), u]));

    // Fetch all referrals made by these referrers to evaluate referees
    const allReferrals = await Referral.findAll({
        where: { referrerId: { [Op.in]: referrerIds } },
        attributes: ['id', 'referrerId', 'referredUserId', 'registered_at', 'referrer_signup_bonus_amount', 'total_commissions_earned', 'status'],
        raw: true
    });

    const refereeIds = [...new Set(allReferrals.map(r => r.referredUserId).filter(Boolean))];

    // Fetch referee users for account_status & registration date
    const refereeUsers = await User.findAll({
        where: { id: { [Op.in]: refereeIds } },
        attributes: ['id', 'account_status', 'createdAt'],
        raw: true
    });
    const refereeUserMap = new Map(refereeUsers.map(u => [String(u.id), u]));

    // Aggregate transactions for all referees
    const transactions = await Transaction.findAll({
        where: {
            userId: { [Op.in]: refereeIds },
            status: 'completed',
            source: { [Op.ne]: 'refund' }
        },
        attributes: [
            'userId',
            'source',
            'amount',
            'createdAt'
        ],
        raw: true
    });

    // Group transactions by refereeId
    const refereeTxMap = new Map();
    for (const tx of transactions) {
        const uid = String(tx.userId);
        if (!refereeTxMap.has(uid)) {
            refereeTxMap.set(uid, {
                serviceTxCount: 0,
                serviceVolume: 0,
                fundingTxCount: 0,
                fundingVolume: 0,
                lastTxDate: null
            });
        }
        const data = refereeTxMap.get(uid);
        const amount = parseFloat(tx.amount) || 0;
        const txDate = new Date(tx.createdAt);

        if (!data.lastTxDate || txDate > data.lastTxDate) {
            data.lastTxDate = txDate;
        }

        if (tx.source === 'funding') {
            data.fundingTxCount++;
            data.fundingVolume += amount;
        } else {
            data.serviceTxCount++;
            data.serviceVolume += amount;
        }
    }

    // Group referrals by referrerId and compute metrics
    const referrerReferralsMap = new Map();
    for (const ref of allReferrals) {
        const rid = String(ref.referrerId);
        if (!referrerReferralsMap.has(rid)) {
            referrerReferralsMap.set(rid, []);
        }
        referrerReferralsMap.get(rid).push(ref);
    }

    const leaderboardItems = [];
    let globalActiveReferrals = 0;
    let globalTransactingReferrals = 0;
    let globalReferralVolume = 0;
    let globalBonusPaid = 0;
    let globalTotalReferrals = 0;

    for (const item of referralAgg) {
        const rid = String(item.referrerId);
        const user = referrerMap.get(rid);
        if (!user) continue;

        const referralsForUser = referrerReferralsMap.get(rid) || [];
        const totalReferrals = referralsForUser.length;
        globalTotalReferrals += totalReferrals;

        let activeReferrals = 0;
        let inactiveReferrals = 0;
        let transactingReferrals = 0;
        let totalReferralTxCount = 0;
        let totalReferralVolume = 0;
        let totalReferralFunding = 0;
        let lastReferralActivity = null;
        let bonusEarned = 0;

        for (const ref of referralsForUser) {
            const refereeId = String(ref.referredUserId);
            const refUser = refereeUserMap.get(refereeId) || { account_status: 'active', createdAt: ref.registered_at };
            const txSummary = refereeTxMap.get(refereeId);

            const lastTxDate = txSummary?.lastTxDate || null;
            if (lastTxDate && (!lastReferralActivity || lastTxDate > lastReferralActivity)) {
                lastReferralActivity = lastTxDate;
            }

            const activityStatus = classifyReferralActivity(refUser, lastTxDate, inactivityNum);
            if (activityStatus === 'active') {
                activeReferrals++;
                globalActiveReferrals++;
            } else {
                inactiveReferrals++;
            }

            if (txSummary && (txSummary.serviceTxCount > 0 || txSummary.fundingTxCount > 0)) {
                transactingReferrals++;
                globalTransactingReferrals++;
                totalReferralTxCount += (txSummary.serviceTxCount + txSummary.fundingTxCount);
                totalReferralVolume += txSummary.serviceVolume;
                totalReferralFunding += txSummary.fundingVolume;
            }

            const refBonus = (parseFloat(ref.referrer_signup_bonus_amount) || 0) + (parseFloat(ref.total_commissions_earned) || 0);
            bonusEarned += refBonus;
        }

        globalReferralVolume += totalReferralVolume;
        globalBonusPaid += bonusEarned;

        const conversionRate = totalReferrals > 0
            ? Number(((transactingReferrals / totalReferrals) * 100).toFixed(1))
            : 0;

        const activeRate = totalReferrals > 0
            ? Number(((activeReferrals / totalReferrals) * 100).toFixed(1))
            : 0;

        leaderboardItems.push({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            avatar: user.avatar || null,
            referralCode: user.referral_code,
            accountStatus: user.account_status || 'active',
            walletBalance: parseFloat(user.wallet?.balance || 0),
            createdAt: user.createdAt,
            totalReferrals,
            activeReferrals,
            inactiveReferrals,
            transactingReferrals,
            conversionRate,
            activeRate,
            totalReferralTransactions: totalReferralTxCount,
            totalReferralVolume: Number(totalReferralVolume.toFixed(2)),
            totalReferralFunding: Number(totalReferralFunding.toFixed(2)),
            totalBonusEarned: Number(bonusEarned.toFixed(2)),
            lastReferralActivity: lastReferralActivity ? lastReferralActivity.toISOString() : null,
            inactivityDays: inactivityNum
        });
    }

    // Sort leaderboard based on admin requested metric
    const orderMultiplier = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;
    leaderboardItems.sort((a, b) => {
        let valA = 0;
        let valB = 0;

        switch (sortBy) {
            case 'active_referrals':
                valA = a.activeReferrals;
                valB = b.activeReferrals;
                break;
            case 'conversion_rate':
                valA = a.conversionRate;
                valB = b.conversionRate;
                break;
            case 'transactions':
                valA = a.totalReferralTransactions;
                valB = b.totalReferralTransactions;
                break;
            case 'volume':
            case 'value':
                valA = a.totalReferralVolume;
                valB = b.totalReferralVolume;
                break;
            case 'bonus':
                valA = a.totalBonusEarned;
                valB = b.totalBonusEarned;
                break;
            case 'total_referrals':
            default:
                valA = a.totalReferrals;
                valB = b.totalReferrals;
                break;
        }

        if (valA !== valB) {
            return (valA > valB ? 1 : -1) * orderMultiplier;
        }
        // Secondary sort: volume
        return (a.totalReferralVolume > b.totalReferralVolume ? 1 : -1) * orderMultiplier;
    });

    // Assign 1-indexed ranks
    const rankedLeaderboard = leaderboardItems.slice(0, limitNum).map((item, idx) => ({
        rank: idx + 1,
        ...item,
        score: sortBy === 'conversion_rate'
            ? item.conversionRate
            : sortBy === 'active_referrals'
            ? item.activeReferrals
            : sortBy === 'volume'
            ? item.totalReferralVolume
            : sortBy === 'transactions'
            ? item.totalReferralTransactions
            : sortBy === 'bonus'
            ? item.totalBonusEarned
            : item.totalReferrals
    }));

    const overallConversionRate = globalTotalReferrals > 0
        ? Number(((globalTransactingReferrals / globalTotalReferrals) * 100).toFixed(1))
        : 0;

    return {
        totalRankedUsers: rankedLeaderboard.length,
        period,
        sortBy,
        inactivityDays: inactivityNum,
        summary: {
            totalRankedUsers: rankedLeaderboard.length,
            totalReferrals: globalTotalReferrals,
            totalActiveReferrals: globalActiveReferrals,
            totalTransactingReferrals: globalTransactingReferrals,
            overallConversionRate,
            totalReferralVolume: Number(globalReferralVolume.toFixed(2)),
            totalBonusPaid: Number(globalBonusPaid.toFixed(2)),
            topPerformer: rankedLeaderboard[0] || null
        },
        leaderboard: rankedLeaderboard
    };
}

/**
 * Get comprehensive referral performance summary for a single referring user
 */
async function getUserReferralSummary(userId, { inactivityDays = 30 } = {}) {
    const inactivityNum = Math.max(1, parseInt(inactivityDays, 10) || 30);

    const user = await User.findByPk(userId, {
        attributes: ['id', 'name', 'email', 'phone', 'role', 'avatar', 'account_status', 'referral_code', 'createdAt'],
        include: [{
            model: Wallet,
            as: 'wallet',
            attributes: ['balance']
        }]
    });

    if (!user) {
        throw new Error('User not found');
    }

    // Fetch all referrals directly made by this user
    const referrals = await Referral.findAll({
        where: { referrerId: user.id },
        attributes: [
            'id',
            'referredUserId',
            'registered_at',
            'status',
            'referrer_signup_bonus_amount',
            'total_commissions_earned',
            'qualifying_deposit_amount',
            'qualifying_deposit_at'
        ],
        raw: true
    });

    const refereeIds = referrals.map(r => r.referredUserId).filter(Boolean);
    const totalReferrals = referrals.length;

    if (totalReferrals === 0) {
        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatar: user.avatar,
                referralCode: user.referral_code,
                accountStatus: user.account_status,
                walletBalance: parseFloat(user.wallet?.balance || 0),
                createdAt: user.createdAt
            },
            metrics: {
                totalReferrals: 0,
                activeReferrals: 0,
                inactiveReferrals: 0,
                transactingReferrals: 0,
                conversionRate: 0,
                activeRate: 0,
                totalTransactions: 0,
                totalVolume: 0,
                totalFunding: 0,
                totalBonusEarned: 0,
                lastActivity: null,
                activityBreakdown: {
                    active: 0,
                    inactive: 0,
                    new: 0,
                    registered_only: 0,
                    suspended: 0
                },
                serviceBreakdown: {
                    data: { count: 0, amount: 0 },
                    airtime: { count: 0, amount: 0 },
                    bills: { count: 0, amount: 0 },
                    other: { count: 0, amount: 0 }
                },
                integrity: {
                    flag: 'clean',
                    message: 'No referrals recorded yet.'
                }
            }
        };
    }

    // Fetch referee accounts
    const refereeUsers = await User.findAll({
        where: { id: { [Op.in]: refereeIds } },
        attributes: ['id', 'name', 'account_status', 'createdAt'],
        raw: true
    });
    const refereeMap = new Map(refereeUsers.map(u => [String(u.id), u]));

    // Fetch all transactions performed by these referees
    const transactions = await Transaction.findAll({
        where: {
            userId: { [Op.in]: refereeIds }
        },
        attributes: ['id', 'userId', 'amount', 'type', 'source', 'status', 'createdAt'],
        raw: true
    });

    // Group transactions by referee
    const txByReferee = new Map();
    let totalServiceTx = 0;
    let totalServiceVolume = 0;
    let totalFundingTx = 0;
    let totalFundingVolume = 0;
    let lastActivityDate = null;

    const serviceBreakdown = {
        data: { count: 0, amount: 0 },
        airtime: { count: 0, amount: 0 },
        bills: { count: 0, amount: 0 },
        other: { count: 0, amount: 0 }
    };

    for (const tx of transactions) {
        const uid = String(tx.userId);
        if (!txByReferee.has(uid)) {
            txByReferee.set(uid, []);
        }
        txByReferee.get(uid).push(tx);

        const isCompleted = String(tx.status).toLowerCase() === 'completed';
        const amount = parseFloat(tx.amount) || 0;
        const source = String(tx.source || '').toLowerCase();

        if (isCompleted && source !== 'refund') {
            const txDate = new Date(tx.createdAt);
            if (!lastActivityDate || txDate > lastActivityDate) {
                lastActivityDate = txDate;
            }

            if (source === 'funding') {
                totalFundingTx++;
                totalFundingVolume += amount;
            } else {
                totalServiceTx++;
                totalServiceVolume += amount;

                if (source === 'data_purchase') {
                    serviceBreakdown.data.count++;
                    serviceBreakdown.data.amount += amount;
                } else if (source === 'airtime_purchase') {
                    serviceBreakdown.airtime.count++;
                    serviceBreakdown.airtime.amount += amount;
                } else if (['bill_payment', 'exam_payment', 'bulk_sms_payment'].includes(source)) {
                    serviceBreakdown.bills.count++;
                    serviceBreakdown.bills.amount += amount;
                } else {
                    serviceBreakdown.other.count++;
                    serviceBreakdown.other.amount += amount;
                }
            }
        }
    }

    const activityCounts = {
        active: 0,
        inactive: 0,
        new: 0,
        registered_only: 0,
        suspended: 0
    };

    let transactingCount = 0;
    let totalBonusEarned = 0;

    for (const ref of referrals) {
        const refUser = refereeMap.get(String(ref.referredUserId)) || { account_status: 'active', createdAt: ref.registered_at };
        const userTxs = txByReferee.get(String(ref.referredUserId)) || [];
        const completedTxs = userTxs.filter(t => String(t.status).toLowerCase() === 'completed' && t.source !== 'refund');

        let lastTx = null;
        if (completedTxs.length > 0) {
            transactingCount++;
            lastTx = completedTxs.reduce((latest, current) => {
                const curDate = new Date(current.createdAt);
                return !latest || curDate > latest ? curDate : latest;
            }, null);
        }

        const actStatus = classifyReferralActivity(refUser, lastTx, inactivityNum);
        activityCounts[actStatus] = (activityCounts[actStatus] || 0) + 1;

        const bonus = (parseFloat(ref.referrer_signup_bonus_amount) || 0) + (parseFloat(ref.total_commissions_earned) || 0);
        totalBonusEarned += bonus;
    }

    const activeReferrals = activityCounts.active || 0;
    const inactiveReferrals = totalReferrals - activeReferrals;
    const conversionRate = totalReferrals > 0 ? Number(((transactingCount / totalReferrals) * 100).toFixed(1)) : 0;
    const activeRate = totalReferrals > 0 ? Number(((activeReferrals / totalReferrals) * 100).toFixed(1)) : 0;

    // Fraud & Integrity checks
    let integrityFlag = 'clean';
    let integrityMessage = 'Referrals show standard engagement patterns.';
    if (totalReferrals >= 10 && conversionRate === 0) {
        integrityFlag = 'suspicious_inactive';
        integrityMessage = 'High volume of registered referrals with 0% qualifying transaction conversion rate.';
    } else if (conversionRate >= 50) {
        integrityFlag = 'high_quality';
        integrityMessage = 'High-quality referral network with strong transaction engagement.';
    }

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            avatar: user.avatar,
            referralCode: user.referral_code,
            accountStatus: user.account_status,
            walletBalance: parseFloat(user.wallet?.balance || 0),
            createdAt: user.createdAt
        },
        metrics: {
            totalReferrals,
            activeReferrals,
            inactiveReferrals,
            transactingReferrals: transactingCount,
            conversionRate,
            activeRate,
            totalSuccessfulTransactions: totalServiceTx + totalFundingTx,
            totalServiceTransactions: totalServiceTx,
            totalQualifyingVolume: Number(totalServiceVolume.toFixed(2)),
            totalFundingVolume: Number(totalFundingVolume.toFixed(2)),
            totalBonusEarned: Number(totalBonusEarned.toFixed(2)),
            lastReferralActivity: lastActivityDate ? lastActivityDate.toISOString() : null,
            inactivityDays: inactivityNum,
            activityBreakdown: activityCounts,
            serviceBreakdown: {
                data: { count: serviceBreakdown.data.count, amount: Number(serviceBreakdown.data.amount.toFixed(2)) },
                airtime: { count: serviceBreakdown.airtime.count, amount: Number(serviceBreakdown.airtime.amount.toFixed(2)) },
                bills: { count: serviceBreakdown.bills.count, amount: Number(serviceBreakdown.bills.amount.toFixed(2)) },
                other: { count: serviceBreakdown.other.count, amount: Number(serviceBreakdown.other.amount.toFixed(2)) }
            },
            integrity: {
                flag: integrityFlag,
                message: integrityMessage
            }
        }
    };
}

/**
 * Get paginated list of all direct referrals for a user with engagement statuses and per-referee stats
 */
async function getUserReferralsList(userId, {
    page = 1,
    limit = 10,
    search = '',
    status = 'all',
    inactivityDays = 30,
    sortBy = 'registered_at',
    sortOrder = 'DESC'
} = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const inactivityNum = Math.max(1, parseInt(inactivityDays, 10) || 30);

    const user = await User.findByPk(userId);
    if (!user) {
        throw new Error('User not found');
    }

    // Fetch all referrals made by this user
    const referrals = await Referral.findAll({
        where: { referrerId: user.id },
        attributes: [
            'id',
            'referredUserId',
            'registered_at',
            'status',
            'referrer_signup_bonus_amount',
            'total_commissions_earned',
            'qualifying_deposit_amount',
            'qualifying_deposit_at'
        ],
        raw: true
    });

    const refereeIds = referrals.map(r => r.referredUserId).filter(Boolean);
    if (refereeIds.length === 0) {
        return {
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0,
            referrals: []
        };
    }

    // Fetch referee user profiles
    const whereUser = {
        id: { [Op.in]: refereeIds }
    };

    if (search && String(search).trim()) {
        const q = String(search).trim();
        whereUser[Op.or] = [
            { name: { [Op.like]: `%${q}%` } },
            { email: { [Op.like]: `%${q}%` } },
            { phone: { [Op.like]: `%${q}%` } },
            { id: { [Op.like]: `%${q}%` } }
        ];
    }

    const matchedReferees = await User.findAll({
        where: whereUser,
        attributes: ['id', 'name', 'email', 'phone', 'role', 'avatar', 'account_status', 'createdAt'],
        include: [{
            model: Wallet,
            as: 'wallet',
            attributes: ['balance']
        }]
    });

    const matchedIds = matchedReferees.map(u => u.id);
    if (matchedIds.length === 0) {
        return {
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0,
            referrals: []
        };
    }

    // Fetch all transactions for matched referees
    const transactions = await Transaction.findAll({
        where: {
            userId: { [Op.in]: matchedIds }
        },
        attributes: ['id', 'userId', 'amount', 'type', 'source', 'status', 'createdAt'],
        raw: true
    });

    // Group transactions by referee
    const txByReferee = new Map();
    for (const tx of transactions) {
        const uid = String(tx.userId);
        if (!txByReferee.has(uid)) {
            txByReferee.set(uid, []);
        }
        txByReferee.get(uid).push(tx);
    }

    const referralByRefereeId = new Map(referrals.map(r => [String(r.referredUserId), r]));

    // Build computed referral records
    const records = [];
    for (const referee of matchedReferees) {
        const rid = String(referee.id);
        const refRecord = referralByRefereeId.get(rid) || {};
        const userTxs = txByReferee.get(rid) || [];

        let successfulCount = 0;
        let successfulVolume = 0;
        let failedCount = 0;
        let reversedCount = 0;
        let fundingVolume = 0;
        let fundingCount = 0;
        let lastTxDate = null;

        const breakdown = {
            data: { count: 0, amount: 0 },
            airtime: { count: 0, amount: 0 },
            bills: { count: 0, amount: 0 }
        };

        for (const tx of userTxs) {
            const st = String(tx.status || '').toLowerCase();
            const src = String(tx.source || '').toLowerCase();
            const amt = parseFloat(tx.amount) || 0;

            if (st === 'completed' && src !== 'refund') {
                successfulCount++;
                const txDate = new Date(tx.createdAt);
                if (!lastTxDate || txDate > lastTxDate) {
                    lastTxDate = txDate;
                }

                if (src === 'funding') {
                    fundingCount++;
                    fundingVolume += amt;
                } else {
                    successfulVolume += amt;
                    if (src === 'data_purchase') {
                        breakdown.data.count++;
                        breakdown.data.amount += amt;
                    } else if (src === 'airtime_purchase') {
                        breakdown.airtime.count++;
                        breakdown.airtime.amount += amt;
                    } else if (['bill_payment', 'exam_payment', 'bulk_sms_payment'].includes(src)) {
                        breakdown.bills.count++;
                        breakdown.bills.amount += amt;
                    }
                }
            } else if (st === 'failed') {
                failedCount++;
            } else if (st === 'refunded' || src === 'refund') {
                reversedCount++;
            }
        }

        const activityStatus = classifyReferralActivity(referee, lastTxDate, inactivityNum);

        // Filter by activity status if requested
        if (status && status !== 'all' && activityStatus !== String(status).toLowerCase().trim()) {
            continue;
        }

        const bonusGenerated = (parseFloat(refRecord.referrer_signup_bonus_amount) || 0) + (parseFloat(refRecord.total_commissions_earned) || 0);

        records.push({
            id: referee.id,
            name: referee.name,
            email: referee.email,
            phone: referee.phone,
            role: referee.role,
            avatar: referee.avatar,
            accountStatus: referee.account_status || 'active',
            walletBalance: parseFloat(referee.wallet?.balance || 0),
            registeredAt: refRecord.registered_at || referee.createdAt,
            activityStatus,
            lastSuccessfulTxDate: lastTxDate ? lastTxDate.toISOString() : null,
            funding: {
                count: fundingCount,
                amount: Number(fundingVolume.toFixed(2)),
                hasFunded: fundingVolume > 0 || refRecord.qualifying_deposit_amount > 0
            },
            transactions: {
                totalSuccessful: successfulCount,
                successfulVolume: Number(successfulVolume.toFixed(2)),
                failedCount,
                reversedCount,
                breakdown: {
                    data: { count: breakdown.data.count, amount: Number(breakdown.data.amount.toFixed(2)) },
                    airtime: { count: breakdown.airtime.count, amount: Number(breakdown.airtime.amount.toFixed(2)) },
                    bills: { count: breakdown.bills.count, amount: Number(breakdown.bills.amount.toFixed(2)) }
                }
            },
            bonusGenerated: Number(bonusGenerated.toFixed(2))
        });
    }

    // Sort records
    const orderMult = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;
    records.sort((a, b) => {
        let valA = 0;
        let valB = 0;
        switch (sortBy) {
            case 'last_activity':
                valA = a.lastSuccessfulTxDate ? new Date(a.lastSuccessfulTxDate).getTime() : 0;
                valB = b.lastSuccessfulTxDate ? new Date(b.lastSuccessfulTxDate).getTime() : 0;
                break;
            case 'transactions':
                valA = a.transactions.totalSuccessful;
                valB = b.transactions.totalSuccessful;
                break;
            case 'volume':
                valA = a.transactions.successfulVolume;
                valB = b.transactions.successfulVolume;
                break;
            case 'bonus':
                valA = a.bonusGenerated;
                valB = b.bonusGenerated;
                break;
            case 'registered_at':
            default:
                valA = new Date(a.registeredAt).getTime();
                valB = new Date(b.registeredAt).getTime();
                break;
        }

        if (valA !== valB) {
            return (valA > valB ? 1 : -1) * orderMult;
        }
        return 0;
    });

    const total = records.length;
    const offset = (pageNum - 1) * limitNum;
    const paginated = records.slice(offset, offset + limitNum);

    return {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        inactivityDays: inactivityNum,
        referrals: paginated
    };
}

/**
 * Export referrals to CSV format
 */
async function exportUserReferralsCsv(userId, options = {}) {
    const data = await getUserReferralsList(userId, {
        ...options,
        page: 1,
        limit: 10000 // Export all matching
    });

    const headers = [
        'Referral ID',
        'Full Name',
        'Email',
        'Phone',
        'Registration Date',
        'Account Status',
        'Activity Status',
        'Last Transaction Date',
        'Wallet Funding (NGN)',
        'Successful Service Txns',
        'Service Spend (NGN)',
        'Failed Txns',
        'Reversed Txns',
        'Data Spend (NGN)',
        'Airtime Spend (NGN)',
        'Bills Spend (NGN)',
        'Bonus Generated (NGN)'
    ];

    const rows = (data.referrals || []).map(r => [
        `"${r.id}"`,
        `"${String(r.name || '').replace(/"/g, '""')}"`,
        `"${String(r.email || '').replace(/"/g, '""')}"`,
        `"${String(r.phone || '').replace(/"/g, '""')}"`,
        `"${r.registeredAt ? new Date(r.registeredAt).toISOString().split('T')[0] : 'N/A'}"`,
        `"${r.accountStatus}"`,
        `"${r.activityStatus}"`,
        `"${r.lastSuccessfulTxDate ? new Date(r.lastSuccessfulTxDate).toISOString().split('T')[0] : 'None'}"`,
        r.funding.amount,
        r.transactions.totalSuccessful,
        r.transactions.successfulVolume,
        r.transactions.failedCount,
        r.transactions.reversedCount,
        r.transactions.breakdown.data.amount,
        r.transactions.breakdown.airtime.amount,
        r.transactions.breakdown.bills.amount,
        r.bonusGenerated
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
}

module.exports = {
    classifyReferralActivity,
    getReferralLeaderboard,
    getUserReferralSummary,
    getUserReferralsList,
    exportUserReferralsCsv
};
