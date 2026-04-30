const DataPlan = require('../models/DataPlan');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
    NETWORK_ORDER,
    comparePlans,
    extractPlanSearchTokens,
    parseValidityToDays,
    toFiniteNumber,
} = require('../utils/dataPlanUtils');
const {
    CATALOG_NETWORKS,
    buildNestedCatalog,
    cleanCatalogPlan,
    mergeAndDeduplicatePlans,
} = require('../utils/vtuCatalogUtils');

function normalizePlanForCatalog(plan, effectivePrice) {
    const json = plan.toJSON();
    return {
        ...json,
        effective_price: toFiniteNumber(effectivePrice, toFiniteNumber(json.admin_price, 0)),
        plan_id: json.plan_id || json.smeplug_plan_id || json.ogdams_sku || String(json.id),
        network: json.provider,
        network_display_name: json.network_display_name || String(json.provider || '').toUpperCase(),
        network_color: json.network_color || null,
        network_icon: json.network_icon || '📡',
        plan: json.name,
        source: json.source || (json.ogdams_sku ? 'ogdams' : 'smeplug'),
        service_name: json.service_name || 'Data Plans',
        service_slug: json.service_slug || 'data-plans',
        category_name: json.category_name || null,
        category_slug: json.category_slug || null,
        subcategory_name: json.subcategory_name || null,
        subcategory_slug: json.subcategory_slug || null,
        data_size: json.data_size || json.size || null,
        teleco_price: toFiniteNumber(json.original_price ?? json.api_cost, NaN),
        our_price: toFiniteNumber(effectivePrice, toFiniteNumber(json.your_price ?? json.admin_price)),
        wallet_price: toFiniteNumber(json.wallet_price ?? json.api_cost, 0),
        validity_days: parseValidityToDays(json.validity),
        search_text: extractPlanSearchTokens({
            ...json,
            service_name: json.service_name,
            category_name: json.category_name,
            subcategory_name: json.subcategory_name,
        }),
    };
}

function cleanPlanPayload(plan) {
    const clean = { ...plan };
    delete clean.search_text;
    return clean;
}

async function resolveCatalogRequester(req) {
    const authHeader = req.headers?.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded?.id) return null;
        return await User.findByPk(decoded.id);
    } catch (e) {
        return null;
    }
}

function sanitizePlanForRole(plan, { isAdmin = false } = {}) {
    const clean = cleanPlanPayload(plan);
    if (!isAdmin) {
        delete clean.plan_id;
        delete clean.smeplug_plan_id;
        delete clean.ogdams_sku;
    }
    return clean;
}

function buildGroupedCatalog(items) {
    const networksMap = new Map();

    for (const plan of items) {
        const networkCode = String(plan.provider || '').toLowerCase();
        if (!networksMap.has(networkCode)) {
            networksMap.set(networkCode, {
                code: networkCode,
                name: plan.network_display_name || String(networkCode).toUpperCase(),
                icon: plan.network_icon || '📡',
                color: plan.network_color || null,
                servicesMap: new Map(),
            });
        }

        const network = networksMap.get(networkCode);
        const serviceSlug = plan.service_slug || 'data-plans';
        const categorySlug = plan.category_slug || 'general';
        const subcategorySlug = plan.subcategory_slug || 'all-plans';

        if (!network.servicesMap.has(serviceSlug)) {
            network.servicesMap.set(serviceSlug, {
                name: plan.service_name || 'Data Plans',
                slug: serviceSlug,
                categoriesMap: new Map(),
            });
        }

        const service = network.servicesMap.get(serviceSlug);
        if (!service.categoriesMap.has(categorySlug)) {
            service.categoriesMap.set(categorySlug, {
                name: plan.category_name || 'General Plans',
                slug: categorySlug,
                source: plan.source || null,
                subcategoriesMap: new Map(),
            });
        }

        const category = service.categoriesMap.get(categorySlug);
        if (!category.subcategoriesMap.has(subcategorySlug)) {
            category.subcategoriesMap.set(subcategorySlug, {
                name: plan.subcategory_name || 'All Plans',
                slug: subcategorySlug,
                plans: [],
            });
        }

        category.subcategoriesMap.get(subcategorySlug).plans.push(cleanPlanPayload(plan));
    }

    return NETWORK_ORDER
        .filter((network) => networksMap.has(network))
        .map((network) => {
            const networkNode = networksMap.get(network);
            const services = Array.from(networkNode.servicesMap.values()).map((service) => ({
                name: service.name,
                slug: service.slug,
                categories: Array.from(service.categoriesMap.values()).map((category) => ({
                    name: category.name,
                    slug: category.slug,
                    source: category.source,
                    subcategories: Array.from(category.subcategoriesMap.values()).map((subcategory) => ({
                        name: subcategory.name,
                        slug: subcategory.slug,
                        plans: subcategory.plans,
                    })),
                })),
            }));

            return {
                code: networkNode.code,
                name: networkNode.name,
                icon: networkNode.icon,
                color: networkNode.color,
                services,
            };
        });
}

async function loadCatalogPlans(req) {
    const { provider, search, source, service, service_slug, category_name, category_slug, subcategory_name, subcategory_slug } = req.query || {};
    const where = { is_active: true };

    if (provider) {
        where.provider = provider.toLowerCase();
    }
    if (source) {
        where.source = String(source).toLowerCase();
    }
    if (service_slug || service) {
        where.service_slug = String(service_slug || service).toLowerCase();
    }
    if (category_name) {
        where.category_name = String(category_name);
    }
    if (category_slug) {
        where.category_slug = String(category_slug).toLowerCase();
    }
    if (subcategory_name) {
        where.subcategory_name = String(subcategory_name);
    }
    if (subcategory_slug) {
        where.subcategory_slug = String(subcategory_slug).toLowerCase();
    }

    const plans = await DataPlan.findAll({
        where,
        order: [['sort_order', 'ASC'], ['admin_price', 'ASC']]
    });

    const user = await resolveCatalogRequester(req);

    const payload = await Promise.all(
        plans.map(async (plan) => {
            let price = null;
            try {
                price = await plan.getPriceForUser(user);
            } catch (e) {
                void e;
            }
            return normalizePlanForCatalog(plan, price);
        })
    );

    const normalizedSearch = String(search || '').trim().toLowerCase();
    const items = payload
        .filter((plan) => {
            const telecoPrice = toFiniteNumber(plan.teleco_price, NaN);
            const ourPrice = toFiniteNumber(plan.our_price ?? plan.effective_price ?? plan.admin_price, NaN);
            if (!Number.isFinite(telecoPrice) && !Number.isFinite(ourPrice)) return false;
            if (!NETWORK_ORDER.includes(String(plan.provider || '').toLowerCase())) return false;
            if (plan.available_wallet === false && plan.available_sim === false) return false;
            if (!normalizedSearch) return true;
            return plan.search_text.includes(normalizedSearch);
        })
        .sort(comparePlans);

    return {
        items,
        user,
        isAdmin: String(user?.role || '').toLowerCase() === 'admin',
    };
}

// @desc    Get all data plans
// @route   GET /api/plans
// @access  Public
const getDataPlans = async (req, res) => {
    try {
        const { items, isAdmin } = await loadCatalogPlans(req);
        const legacyVisiblePlans = items.filter((plan) => {
            const telecoPrice = toFiniteNumber(plan.teleco_price, NaN);
            return Number.isFinite(telecoPrice) && telecoPrice > 0;
        });

        if (req.query.grouped === 'true' || req.query.view === 'hierarchy') {
            return res.json({
                items: legacyVisiblePlans.map((plan) => sanitizePlanForRole(plan, { isAdmin })),
                networks: buildGroupedCatalog(legacyVisiblePlans.map((plan) => sanitizePlanForRole(plan, { isAdmin }))),
            });
        }

        res.json(legacyVisiblePlans.map((plan) => sanitizePlanForRole(plan, { isAdmin })));
    } catch (error) {
        logger.error(`[DataPlan] Fetch error: ${error.message}`, { db: error.original?.message || null });
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve data plans' 
        });
    }
};

// @desc    Get all data plans (Admin)
// @route   GET /api/plans/admin
// @access  Private/Admin
const getAdminDataPlans = async (req, res) => {
    try {
        const plans = await DataPlan.findAll({
            order: [['createdAt', 'DESC']]
        });
        
        res.json(plans);
    } catch (error) {
        logger.error(`[DataPlan] Admin fetch error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve data plans for admin' 
        });
    }
};

// @desc    Create data plan
// @route   POST /api/plans
// @access  Private/Admin
const createDataPlan = async (req, res) => {
    const { 
        provider, 
        category, 
        service_name,
        service_slug,
        category_name,
        category_slug,
        subcategory_name,
        subcategory_slug,
        name, 
        size, 
        size_mb, 
        validity, 
        admin_price, 
        api_cost, 
        smeplug_plan_id 
    } = req.body;

    if (!provider || !name || !admin_price) {
        return res.status(400).json({ 
            success: false,
            message: 'Please provide all required fields: provider, name, admin_price' 
        });
    }

    try {
        const plan = await DataPlan.create({
            provider: provider.toLowerCase(),
            category: category || 'sme',
            service_name: service_name || 'Data Plans',
            service_slug: service_slug || 'data-plans',
            category_name: category_name || null,
            category_slug: category_slug || null,
            subcategory_name: subcategory_name || null,
            subcategory_slug: subcategory_slug || null,
            name,
            size,
            size_mb: size_mb || (size ? parseInt(size) : 0),
            validity,
            admin_price,
            api_cost,
            smeplug_plan_id
        });

        logger.info(`[DataPlan] Created new plan: ${name} for ${provider}`);

        res.status(201).json({
            success: true,
            message: 'Data plan created successfully',
            data: plan
        });
    } catch (error) {
        logger.error(`[DataPlan] Creation error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to create data plan' 
        });
    }
};

// @desc    Update data plan
// @route   PUT /api/plans/:id
// @access  Private/Admin
const updateDataPlan = async (req, res) => {
    const { 
        provider, 
        category, 
        service_name,
        service_slug,
        category_name,
        category_slug,
        subcategory_name,
        subcategory_slug,
        name, 
        size, 
        size_mb, 
        validity, 
        admin_price, 
        api_cost, 
        smeplug_plan_id,
        is_active
    } = req.body;

    try {
        const plan = await DataPlan.findByPk(req.params.id);

        if (!plan) {
            return res.status(404).json({ 
                success: false,
                message: 'Data plan not found' 
            });
        }

        plan.provider = provider ? provider.toLowerCase() : plan.provider;
        plan.category = category || plan.category;
        plan.service_name = service_name || plan.service_name;
        plan.service_slug = service_slug || plan.service_slug;
        plan.category_name = category_name || plan.category_name;
        plan.category_slug = category_slug || plan.category_slug;
        plan.subcategory_name = subcategory_name || plan.subcategory_name;
        plan.subcategory_slug = subcategory_slug || plan.subcategory_slug;
        plan.name = name || plan.name;
        plan.size = size || plan.size;
        plan.size_mb = size_mb || plan.size_mb;
        plan.validity = validity || plan.validity;
        plan.admin_price = admin_price || plan.admin_price;
        plan.api_cost = api_cost || plan.api_cost;
        plan.smeplug_plan_id = smeplug_plan_id || plan.smeplug_plan_id;
        
        if (is_active !== undefined) plan.is_active = is_active;

        const updatedPlan = await plan.save();
        logger.info(`[DataPlan] Updated plan ID: ${req.params.id}`);

        res.json({
            success: true,
            message: 'Data plan updated successfully',
            data: updatedPlan
        });
    } catch (error) {
        logger.error(`[DataPlan] Update error for ID ${req.params.id}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to update data plan' 
        });
    }
};

// @desc    Delete data plan
// @route   DELETE /api/plans/:id
// @access  Private/Admin
const deleteDataPlan = async (req, res) => {
    try {
        const plan = await DataPlan.findByPk(req.params.id);

        if (!plan) {
            return res.status(404).json({ 
                success: false,
                message: 'Data plan not found' 
            });
        }

        await plan.destroy();
        logger.info(`[DataPlan] Deleted plan ID: ${req.params.id}`);

        res.json({ 
            success: true,
            message: 'Data plan removed successfully' 
        });
    } catch (error) {
        logger.error(`[DataPlan] Delete error for ID ${req.params.id}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to delete data plan' 
        });
    }
};

const getVtuDataPlanCatalog = async (req, res) => {
    try {
        const { items, isAdmin } = await loadCatalogPlans(req);
        const catalogItems = mergeAndDeduplicatePlans(items);
        const catalog = buildNestedCatalog(catalogItems);
        return res.json({
            items: catalogItems.map((plan) => sanitizePlanForRole(cleanCatalogPlan(plan), { isAdmin })),
            networks: CATALOG_NETWORKS.map((network) => ({
                code: network,
                name: network === 'mtn' ? 'MTN' : network === 'airtel' ? 'Airtel' : 'GLO',
                categories: Object.fromEntries(
                    Object.entries(catalog[network === 'mtn' ? 'MTN' : network === 'airtel' ? 'Airtel' : 'GLO']).map(([categoryKey, plans]) => [
                        categoryKey,
                        Array.isArray(plans) ? plans.map((plan) => sanitizePlanForRole(plan, { isAdmin })) : [],
                    ])
                ),
            })),
            catalog: Object.fromEntries(
                Object.entries(catalog).map(([networkKey, categories]) => [
                    networkKey,
                    Object.fromEntries(
                        Object.entries(categories).map(([categoryKey, plans]) => [
                            categoryKey,
                            Array.isArray(plans) ? plans.map((plan) => sanitizePlanForRole(plan, { isAdmin })) : [],
                        ])
                    ),
                ])
            ),
        });
    } catch (error) {
        logger.error(`[DataPlan] VTU catalog error: ${error.message}`, { db: error.original?.message || null });
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve VTU data plan catalog'
        });
    }
};

module.exports = {
    getDataPlans,
    getVtuDataPlanCatalog,
    getAdminDataPlans,
    createDataPlan,
    updateDataPlan,
    deleteDataPlan
};
