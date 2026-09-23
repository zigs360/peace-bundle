const dynamicProviderService = require('../services/dynamicProviderService');
const simManagementService = require('../services/simManagementService');
const logger = require('../utils/logger');

// @desc    Get all configured API providers
// @route   GET /api/admin/providers
// @access  Private (Admin)
const getProviders = async (req, res) => {
  try {
    const providers = await dynamicProviderService.getAllProviders();
    res.json({
      success: true,
      providers,
    });
  } catch (err) {
    logger.error(`[ApiProvider] Error fetching providers: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch providers' });
  }
};

// @desc    Create or register a new API provider
// @route   POST /api/admin/providers
// @access  Private (Admin)
const createProvider = async (req, res) => {
  try {
    const { name, slug, service_type, base_url, api_key, secret_key, public_key, capabilities, endpoint_map, is_active, is_primary } = req.body;
    if (!name || !base_url) {
      return res.status(400).json({ success: false, message: 'Provider name and base_url are required' });
    }

    const provider = await dynamicProviderService.saveProvider({
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
      service_type: service_type || 'all',
      base_url,
      api_key,
      secret_key,
      public_key,
      capabilities: capabilities || ['vtu_data', 'vtu_airtime', 'sim_hosting'],
      endpoint_map: endpoint_map || {
        devices: '/devices',
        data_purchase: '/data',
        airtime_purchase: '/airtime',
        balance: '/balance',
      },
      is_active: is_active !== undefined ? is_active : true,
      is_primary: Boolean(is_primary),
    });

    if (is_primary) {
      await dynamicProviderService.setPrimaryProvider(provider.id);
    }

    res.status(201).json({
      success: true,
      message: `Provider ${provider.name} registered successfully`,
      provider,
    });
  } catch (err) {
    logger.error(`[ApiProvider] Error creating provider: ${err.message}`);
    const details = err.errors ? err.errors.map(e => `${e.path}: ${e.message}`).join(', ') : err.message;
    res.status(500).json({ success: false, message: details || 'Failed to create provider' });
  }
};

// @desc    Update provider credentials / configuration
// @route   PUT /api/admin/providers/:id
// @access  Private (Admin)
const updateProvider = async (req, res) => {
  try {
    const provider = await dynamicProviderService.saveProvider({
      id: req.params.id,
      ...req.body,
    });

    if (req.body.is_primary) {
      await dynamicProviderService.setPrimaryProvider(provider.id);
    }

    res.json({
      success: true,
      message: 'Provider updated successfully',
      provider,
    });
  } catch (err) {
    logger.error(`[ApiProvider] Error updating provider: ${err.message}`);
    res.status(500).json({ success: false, message: err.message || 'Failed to update provider' });
  }
};

// @desc    Set provider as active primary
// @route   POST /api/admin/providers/:id/activate
// @access  Private (Admin)
const activateProvider = async (req, res) => {
  try {
    const provider = await dynamicProviderService.setPrimaryProvider(req.params.id);
    res.json({
      success: true,
      message: `${provider.name} is now the primary active provider`,
      provider,
    });
  } catch (err) {
    logger.error(`[ApiProvider] Error activating provider: ${err.message}`);
    res.status(500).json({ success: false, message: err.message || 'Failed to activate provider' });
  }
};

// @desc    Delete provider
// @route   DELETE /api/admin/providers/:id
// @access  Private (Admin)
const deleteProvider = async (req, res) => {
  try {
    await dynamicProviderService.deleteProvider(req.params.id);
    res.json({ success: true, message: 'Provider deleted successfully' });
  } catch (err) {
    logger.error(`[ApiProvider] Error deleting provider: ${err.message}`);
    res.status(500).json({ success: false, message: err.message || 'Failed to delete provider' });
  }
};

// @desc    Trigger SIM device synchronization from provider (QuicklySIM, Smeplug, etc.)
// @route   POST /api/admin/providers/:id/sync-sims
// @access  Private (Admin)
const syncProviderSims = async (req, res) => {
  try {
    const ApiProvider = require('../models/ApiProvider');
    const provider = await ApiProvider.findByPk(req.params.id);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    const results = await simManagementService.syncProviderSims(provider.slug);
    res.json({
      success: true,
      message: `SIM sync completed for ${provider.name}`,
      results,
    });
  } catch (err) {
    logger.error(`[ApiProvider] SIM sync error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message || 'Failed to sync SIMs' });
  }
};

module.exports = {
  getProviders,
  createProvider,
  updateProvider,
  activateProvider,
  deleteProvider,
  syncProviderSims,
};
