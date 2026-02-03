const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Commission = require('../models/Commission');
const Referral = require('../models/Referral');
const SystemSetting = require('../models/SystemSetting');
const DataPlan = require('../models/DataPlan');
const { sendTransactionNotification, sendSMS } = require('../services/notificationService');
const walletService = require('../services/walletService');
const smeplugService = require('../services/smeplugService');
const simManagementService = require('../services/simManagementService');
const transactionLimitService = require('../services/transactionLimitService');
const affiliateService = require('../services/affiliateService');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// Helper for Affiliate Commission
const processAffiliateCommission = async (user, amount, transaction, t) => {
    // Basic implementation: check referrer, calculate %, credit wallet
    try {
        const referral = await Referral.findOne({ 
            where: { referredUserId: user.id },
            include: [{ model: User, as: 'Referrer' }]
        });

        if (referral && referral.Referrer) {
            // Fetch commission rate from SystemSetting or use default
            // For now, simple fixed amount or %
            const rate = 0.01; // 1%
            const commissionAmount = parseFloat(amount) * rate;
            
            if (commissionAmount > 0) {
                await walletService.creditCommission(referral.Referrer, commissionAmount, `Commission from ${user.name || user.email}`, t);
                
                // Record commission log
                await Commission.create({
                    referrerId: referral.referrerId,
                    referredUserId: user.id,
                    amount: commissionAmount,
                    commissionableId: transaction.id,
                    commissionable_type: 'transaction',
                    status: 'paid'
                }, { transaction: t });
            }
        }
    } catch (error) {
        console.error('Affiliate Commission Error:', error);
        // Don't fail the main transaction if commission fails
    }
};

// @desc    Fund Wallet
// @route   POST /api/transactions/fund
// @access  Private
const fundWallet = async (req, res) => {
    const { amount, reference } = req.body;
    const userId = req.user.id;

    const t = await sequelize.transaction();

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            await t.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            await t.rollback();
            return res.status(400).json({ message: 'Invalid amount' });
        }

        // Use WalletService
        const newTransaction = await walletService.credit(
            user, 
            value, 
            'funding', 
            'Wallet Funding', 
            { reference }, 
            t
        );

        // Process Affiliate Commission
        await affiliateService.processFundingCommission(user, newTransaction, t);

        await t.commit();

        // Send Notification
        await sendTransactionNotification(user, newTransaction);

        // Fetch updated wallet for response
        const updatedWallet = await walletService.getBalance(user);

        res.json({
            message: 'Wallet funded successfully',
            balance: updatedWallet,
            transaction: newTransaction
        });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Buy Data
// @route   POST /api/transactions/data
// @access  Private
const buyData = async (req, res) => {
    const { network, planId, phone, amount, planName } = req.body;
    const userId = req.user.id;

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check Transaction Limits
        const limitCheck = await transactionLimitService.canTransact(user);
        if (!limitCheck.allowed) {
            return res.status(403).json({ 
                message: limitCheck.reason,
                details: limitCheck 
            });
        }

        const t = await sequelize.transaction();

        // Fetch Data Plan
        const plan = await DataPlan.findByPk(planId);
        if (!plan || !plan.is_active) {
            await t.rollback();
            return res.status(404).json({ message: 'Data plan not found or inactive' });
        }

        const cost = parseFloat(await plan.getPriceForUser(user));

        // 1. Debit Wallet
        const newTransaction = await walletService.debit(
            user, 
            cost, 
            'data_purchase', 
            `${plan.provider.toUpperCase()} ${plan.name} to ${phone}`, 
            { network: plan.provider, planId, phone, planName: plan.name }, 
            t
        );

        // 2. Process Purchase (Local SIM or API)
        try {
            const networkId = smeplugService.getNetworkId(plan.provider);
            
            // Determine routing: Local SIM or API (Smeplug)
            let processedViaSim = false;
            let simReference = null;
            let simResponse = null;

            // Try to find a local SIM first (if enabled/applicable)
            // Passing plan.api_cost to check if SIM has enough balance
            const optimalSim = await simManagementService.getOptimalSim(plan.provider, plan.api_cost || 0);
            
            if (optimalSim) {
                try {
                    const simResult = await simManagementService.processTransaction(optimalSim, plan, phone);
                    if (simResult.success) {
                        processedViaSim = true;
                        simReference = simResult.reference;
                        simResponse = simResult;
                    }
                } catch (simError) {
                    console.error('Local SIM transaction failed, falling back to API:', simError);
                    // Continue to API fallback
                }
            }

            if (processedViaSim) {
                newTransaction.smeplug_reference = simReference;
                newTransaction.smeplug_response = simResponse;
                await newTransaction.save({ transaction: t });
            } else {
                // Use plan.smeplug_plan_id if available, otherwise assume mapping exists
                const smeplugPlanId = plan.smeplug_plan_id || planId;

                const purchaseResult = await smeplugService.purchaseData({
                    network_id: networkId,
                    plan_id: smeplugPlanId,
                    phone: phone,
                    mode: 'wallet' 
                });

                if (!purchaseResult.success) {
                    throw new Error(purchaseResult.error || 'Data purchase failed at provider');
                }

                // Update transaction with provider reference
                newTransaction.smeplug_reference = purchaseResult.data?.reference;
                newTransaction.smeplug_response = purchaseResult.data;
                await newTransaction.save({ transaction: t });
            }

        } catch (apiError) {
            throw apiError; // Trigger rollback
        }

        await t.commit();
        await sendTransactionNotification(user, newTransaction);
        
        const updatedWallet = await walletService.getBalance(user);

        res.json({
            message: 'Data purchase successful',
            balance: updatedWallet,
            transaction: newTransaction
        });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
};

// @desc    Buy Airtime
// @route   POST /api/transactions/airtime
// @access  Private
const buyAirtime = async (req, res) => {
    const { network, phone, amount } = req.body;
    const userId = req.user.id;

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check Transaction Limits
        const limitCheck = await transactionLimitService.canTransact(user);
        if (!limitCheck.allowed) {
            return res.status(403).json({ 
                message: limitCheck.reason,
                details: limitCheck 
            });
        }

        const t = await sequelize.transaction();

        const faceValue = parseFloat(amount);
        const discount = 0.02; // 2%
        const toPay = faceValue * (1 - discount);

        // Debit Wallet
        const newTransaction = await walletService.debit(
            user,
            toPay,
            'airtime_purchase',
            `${network.toUpperCase()} Airtime ₦${faceValue} to ${phone}`,
            { network, phone, faceValue, type: 'airtime' },
            t
        );

        // Call Provider (Smeplug or other)
        // Assuming Smeplug doesn't support airtime in this version, we mock it or use generic handler
        // If Smeplug supports it, add call here.
        // For now, we assume successful processing if wallet debit works.

        await t.commit();
        await sendTransactionNotification(user, newTransaction);
        
        const updatedWallet = await walletService.getBalance(user);

        res.json({
            message: 'Airtime purchase successful',
            balance: updatedWallet,
            transaction: newTransaction
        });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
};

// @desc    Pay Bill
// @route   POST /api/transactions/bill
// @access  Private
const payBill = async (req, res) => {
    const { billType, provider, smartCardNumber, amount, phone, meterType, plan } = req.body;
    const userId = req.user.id;

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check Transaction Limits
        const limitCheck = await transactionLimitService.canTransact(user);
        if (!limitCheck.allowed) {
            return res.status(403).json({ 
                message: limitCheck.reason,
                details: limitCheck 
            });
        }

        const t = await sequelize.transaction();

        const cost = parseFloat(amount);

        let description = '';
        if (billType === 'power') {
            description = `${provider.toUpperCase()} ${meterType} (${smartCardNumber})`;
        } else {
            description = `${provider.toUpperCase()} ${plan || 'Subscription'} (${smartCardNumber})`;
        }

        const newTransaction = await walletService.debit(
            user,
            cost,
            'bill_payment',
            description,
            { billType, provider, smartCardNumber, phone, meterType, plan },
            t
        );

        // Call Provider API here
        
        await t.commit();
        await sendTransactionNotification(user, newTransaction);
        
        const updatedWallet = await walletService.getBalance(user);

        res.json({
            message: 'Bill payment successful',
            balance: updatedWallet,
            transaction: newTransaction
        });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
};

// @desc    Withdraw Funds
// @route   POST /api/transactions/withdraw
// @access  Private
const withdrawFunds = async (req, res) => {
    const { amount, accountNumber, bankName, accountName } = req.body;
    const userId = req.user.id;
    
    const t = await sequelize.transaction();

    try {
        const user = await User.findByPk(userId);
        const withdrawAmount = parseFloat(amount);
        
        // Debit Wallet
        const newTransaction = await walletService.debit(
            user,
            withdrawAmount,
            'withdrawal',
            `Withdrawal to ${bankName} - ${accountNumber}`,
            { bankName, accountNumber, accountName },
            t
        );

        // Update status to pending as it requires manual approval usually
        // But walletService.debit sets to completed. 
        // We should update it to pending.
        await newTransaction.update({ status: 'pending' }, { transaction: t });

        await t.commit();
        await sendTransactionNotification(user, newTransaction);

        res.json({ message: 'Withdrawal request submitted', transaction: newTransaction });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
};

// @desc    Airtime to Cash
// @route   POST /api/transactions/airtime-cash
// @access  Private
const airtimeToCash = async (req, res) => {
    const { network, amount, phoneNumber, sharePin } = req.body;
    const userId = req.user.id;
    // Implementation: Verify transfer manually or via API, then credit wallet (after taking percentage)
    // For now, simple mock
    
    // We don't update balance immediately for airtime to cash, usually it's pending verification
    try {
        const user = await User.findByPk(userId, { include: [{ model: Wallet }] });
        
        const newTransaction = await Transaction.create({
            walletId: user.Wallet.id,
            type: 'credit',
            amount: parseFloat(amount) * 0.8, // 80% payout
            balance_before: user.Wallet.balance,
            balance_after: user.Wallet.balance, // No change yet
            source: 'funding',
            status: 'pending',
            reference: `A2C-${Date.now()}`,
            description: `Airtime to Cash: ${network} ${amount}`,
            metadata: { network, phoneNumber, sharePin }
        });

        res.json({ message: 'Request submitted successfully', transaction: newTransaction });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Print Recharge Card
// @route   POST /api/transactions/recharge-card
// @access  Private
const printRechargeCard = async (req, res) => {
    // Similar to buyAirtime but returns PIN
    // Mock implementation
    const { network, amount, quantity } = req.body;
    const userId = req.user.id;
    
    const t = await sequelize.transaction();
    try {
        const user = await User.findByPk(userId);
        const totalCost = parseFloat(amount) * parseInt(quantity);
        
        const newTransaction = await walletService.debit(
            user,
            totalCost,
            'bill_payment',
            `Printed ${quantity} ${network} ${amount} cards`,
            { network, amount, quantity },
            t
        );

        await t.commit();
        
        // Generate Mock Cards
        const cards = [];
        for(let i=0; i<parseInt(quantity); i++) {
            cards.push({
                pin: Math.floor(1000000000000000 + Math.random() * 9000000000000000).toString(),
                serial: `SN${Math.floor(100000000 + Math.random() * 900000000)}`,
                amount: amount,
                network: network
            });
        }
        
        res.json({ message: 'Cards generated successfully', transaction: newTransaction, cards: cards });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
};

// @desc    Check Result (WAEC/NECO)
// @route   POST /api/transactions/result-checker
// @access  Private
const checkResult = async (req, res) => {
    const { examType, quantity } = req.body;
    const userId = req.user.id;
    
    const t = await sequelize.transaction();
    try {
        const user = await User.findByPk(userId);
        const price = 3500; // Mock price
        const totalCost = price * parseInt(quantity || 1);
        
        const newTransaction = await walletService.debit(
            user,
            totalCost,
            'exam_payment',
            `${examType} Scratch Card Purchase`,
            { examType, quantity },
            t
        );

        await t.commit();
        
        // Generate Mock Pins
        const pins = [];
        for(let i=0; i<parseInt(quantity || 1); i++) {
            pins.push({
                pin: Math.floor(100000000000 + Math.random() * 900000000000).toString(),
                serial: `WAEC${Math.floor(10000000 + Math.random() * 90000000)}`,
                exam: examType
            });
        }
        
        res.json({ message: 'Pins generated successfully', transaction: newTransaction, pins: pins });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
};

// @desc    Transfer Funds
// @route   POST /api/transactions/transfer
// @access  Private
const transferFunds = async (req, res) => {
    const { recipientEmail, amount, pin } = req.body;
    const userId = req.user.id;
    
    const t = await sequelize.transaction();
    try {
        const sender = await User.findByPk(userId);
        const recipient = await User.findOne({ 
            where: { email: recipientEmail }
        });

        if (!recipient) {
            await t.rollback();
            return res.status(404).json({ message: 'Recipient not found' });
        }

        const transferAmount = parseFloat(amount);
        
        // Use WalletService Transfer
        // Note: walletService.transfer returns { debit_transaction, credit_transaction }
        const result = await walletService.transfer(
            sender,
            recipient,
            transferAmount,
            `Transfer to ${recipient.name || recipientEmail}`,
            t
        );

        await t.commit();
        
        // Notifications?
        // await sendTransactionNotification(sender, result.debit_transaction);
        // await sendTransactionNotification(recipient, result.credit_transaction);

        res.json({ message: 'Transfer successful' });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
};

// @desc    Send Bulk SMS
// @route   POST /api/transactions/bulk-sms
// @access  Private
const sendBulkSMS = async (req, res) => {
    const { senderId, message, recipients } = req.body; // recipients is array or comma separated string
    const userId = req.user.id;
    
    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check Transaction Limits
        const limitCheck = await transactionLimitService.canTransact(user);
        if (!limitCheck.allowed) {
            return res.status(403).json({ 
                message: limitCheck.reason,
                details: limitCheck 
            });
        }

        const t = await sequelize.transaction();
        
        // Calculate cost (Mock: 4 naira per page per number)
        const recipientList = (Array.isArray(recipients) ? recipients : recipients.split(',')).map(r => r.trim()).filter(r => r.length > 0);
        const pages = Math.ceil(message.length / 160) || 1;
        const cost = recipientList.length * pages * 4;

        // Debit Wallet
        const newTransaction = await walletService.debit(
            user,
            cost,
            'bulk_sms_payment',
            `Bulk SMS to ${recipientList.length} numbers`,
            { senderId, pages, count: recipientList.length },
            t
        );

        await t.commit();

        // Send SMS via Termii (Async to avoid blocking response)
        // We use the sendSMS service which now handles Termii integration
        // Note: For very large lists, this should be moved to a background job (Queue)
        
        // Fire and forget (or await if critical)
        Promise.allSettled(recipientList.map(recipient => 
            sendSMS(recipient, message)
        )).then(results => {
            console.log(`Bulk SMS Processed: ${results.length} messages`);
        }).catch(err => {
            console.error('Bulk SMS Error:', err);
        });
        
        res.json({ message: 'SMS sent successfully', cost });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
};

// @desc    Get all transactions (Admin)
// @route   GET /api/transactions
// @access  Private (Admin)
const getAllTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.findAll({
            order: [['createdAt', 'DESC']],
            include: [{ model: Wallet, include: [{ model: User, attributes: ['name', 'email'] }] }]
        });
        res.json(transactions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get user transactions (With Filters)
// @route   GET /api/transactions
// @access  Private
const index = async (req, res) => {
    try {
        const { status, provider, date_from, date_to, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const where = {
            // Find wallet belonging to user and filter by that walletId
            // OR if we associate Transaction directly to User (which we should for easier querying)
            // Current model uses Wallet. Let's find User's Wallet first.
        };

        const user = await User.findByPk(req.user.id, { include: [{ model: Wallet, as: 'wallet' }] });
        if (!user || !user.wallet) {
            return res.json({
                data: [],
                current_page: parseInt(page),
                total: 0,
                per_page: parseInt(limit),
                last_page: 1
            });
        }

        where.walletId = user.wallet.id;

        // Apply filters
        if (status) {
            where.status = status;
        }

        if (provider) {
            where.provider = provider;
        }

        if (date_from || date_to) {
            where.createdAt = {};
            if (date_from) {
                where.createdAt[Op.gte] = new Date(date_from);
            }
            if (date_to) {
                // Add one day to include the end date fully if it's just a date string
                const endDate = new Date(date_to);
                endDate.setHours(23, 59, 59, 999);
                where.createdAt[Op.lte] = endDate;
            }
        }

        const { count, rows } = await Transaction.findAndCountAll({
            where,
            include: [
                { model: DataPlan, as: 'dataPlan' }, 
                { model: Sim, as: 'sim' }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            transactions: {
                data: rows,
                current_page: parseInt(page),
                total: count,
                per_page: parseInt(limit),
                last_page: Math.ceil(count / limit)
            },
            filters: { status, provider, date_from, date_to }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Export transactions to PDF
// @route   GET /api/transactions/export
// @access  Private
const exportTransactions = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, { include: [{ model: Wallet, as: 'wallet' }] });
        if (!user || !user.wallet) {
            return res.status(404).json({ message: 'User wallet not found' });
        }

        // Fetch all transactions for export (no pagination, latest first)
        const transactions = await Transaction.findAll({
            where: { walletId: user.Wallet.id },
            include: [
                { model: DataPlan, as: 'dataPlan' }, 
                { model: Sim, as: 'sim' }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Create PDF
        const doc = new PDFDocument();
        const filename = `transactions-${new Date().toISOString().split('T')[0]}.pdf`;

        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // PDF Content
        doc.fontSize(20).text('Transaction History', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`User: ${user.name} (${user.email})`);
        doc.text(`Date: ${new Date().toLocaleDateString()}`);
        doc.moveDown();

        // Table Header
        const startX = 50;
        let currentY = doc.y;
        
        doc.font('Helvetica-Bold');
        doc.text('Date', startX, currentY);
        doc.text('Type', startX + 100, currentY);
        doc.text('Amount', startX + 200, currentY);
        doc.text('Status', startX + 300, currentY);
        doc.text('Ref', startX + 400, currentY);
        
        doc.moveDown();
        doc.font('Helvetica');
        
        // Table Rows
        transactions.forEach(tx => {
            currentY = doc.y;
            
            // Check for page break
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
            }

            const date = new Date(tx.createdAt).toLocaleDateString();
            const type = tx.type === 'credit' ? 'Credit' : 'Debit';
            const amount = `N${parseFloat(tx.amount).toFixed(2)}`;
            const status = tx.status;
            const ref = tx.reference;

            doc.text(date, startX, currentY);
            doc.text(type, startX + 100, currentY);
            doc.text(amount, startX + 200, currentY);
            doc.text(status, startX + 300, currentY);
            doc.text(ref, startX + 400, currentY);
            
            doc.moveDown();
        });

        doc.end();

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get user transactions (By Params or Self)
// @route   GET /api/transactions/:userId
// @access  Private
const getTransactions = async (req, res) => {
    let userId = req.params.userId;
    if (!userId || userId === 'my') {
        userId = req.user.id;
    }
    
    try {
        const user = await User.findByPk(userId, { include: [{ model: Wallet }] });
        if (!user || !user.Wallet) {
            return res.json([]);
        }

        const transactions = await Transaction.findAll({
            where: { walletId: user.Wallet.id },
            order: [['createdAt', 'DESC']]
        });
        res.json(transactions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Dashboard Stats
// @route   GET /api/transactions/stats/:userId
// @access  Private
const getDashboardStats = async (req, res) => {
    let userId = req.params.userId;
    if (!userId || userId === 'my') {
        userId = req.user.id;
    }

    try {
        const user = await User.findByPk(userId, { include: [{ model: Wallet }] });
        if (!user || !user.Wallet) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Total Spent
        const totalSpent = await Transaction.sum('amount', {
            where: { 
                walletId: user.Wallet.id, 
                type: 'debit',
                status: 'completed'
            }
        }) || 0;

        // Total Funded
        const totalFunded = await Transaction.sum('amount', {
            where: { 
                walletId: user.Wallet.id, 
                type: 'credit',
                source: 'funding',
                status: 'completed'
            }
        }) || 0;

        const transactionsCount = await Transaction.count({
            where: { walletId: user.Wallet.id }
        });

        res.json({
            totalSpent,
            totalFunded,
            transactionsCount,
            balance: user.Wallet.balance,
            commission: user.Wallet.commission_balance,
            bonus: user.Wallet.bonus_balance
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Redeem Coupon
// @route   POST /api/transactions/coupon
// @access  Private
const redeemCoupon = async (req, res) => {
    // Mock implementation
    res.status(400).json({ message: 'Invalid or expired coupon' });
};

module.exports = {
    fundWallet,
    buyData,
    buyAirtime,
    payBill,
    withdrawFunds,
    airtimeToCash,
    printRechargeCard,
    checkResult,
    transferFunds,
    sendBulkSMS,
    getAllTransactions,
    getTransactions,
    getDashboardStats,
    redeemCoupon,
    index,
    exportTransactions
};
