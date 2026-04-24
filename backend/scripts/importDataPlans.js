#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { connectDB } = require('../config/db');
const DataPlan = require('../models/DataPlan');

const NETWORK_ALIASES = {
  mtn: 'mtn',
  airtel: 'airtel',
  glo: 'glo',
  gl0: 'glo',
};

const SOURCE_ALIASES = {
  ogdams: 'ogdams',
  smeplug: 'smeplug',
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function titleCase(value, fallback = '') {
  const source = String(value || '').trim();
  if (!source) return fallback;
  return source
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value).replace(/[,Nn][Aa][Nn]/g, '').replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = true) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'active', 'enabled'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'inactive', 'disabled'].includes(raw)) return false;
  return fallback;
}

function extractDataSize(name, fallback = '') {
  const source = String(name || fallback || '');
  const match = source.match(/(\d+(?:\.\d+)?)\s*(gb|mb|tb)/i);
  if (!match) return fallback || '';
  return `${match[1]}${match[2].toUpperCase()}`;
}

function extractSizeMb(dataSize) {
  const raw = String(dataSize || '');
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(gb|mb|tb)/i);
  if (!match) return 0;
  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount)) return 0;
  if (unit === 'mb') return Math.round(amount);
  if (unit === 'gb') return Math.round(amount * 1024);
  if (unit === 'tb') return Math.round(amount * 1024 * 1024);
  return 0;
}

function inferNetwork(value, filePath) {
  const source = String(value || path.basename(filePath || '')).toLowerCase();
  for (const [alias, canonical] of Object.entries(NETWORK_ALIASES)) {
    if (source.includes(alias)) return canonical;
  }
  return null;
}

function inferSource(value, filePath) {
  const source = String(value || path.basename(filePath || '')).toLowerCase();
  for (const [alias, canonical] of Object.entries(SOURCE_ALIASES)) {
    if (source.includes(alias)) return canonical;
  }
  return 'smeplug';
}

function inferNetworkMeta(network) {
  const key = String(network || '').toLowerCase();
  if (key === 'mtn') return { displayName: 'MTN', color: '#FFCC00', icon: '📡' };
  if (key === 'airtel') return { displayName: 'Airtel', color: '#FF0000', icon: '📡' };
  if (key === 'glo') return { displayName: 'Glo', color: '#008000', icon: '📡' };
  if (key === '9mobile') return { displayName: '9mobile', color: '#006B3F', icon: '📡' };
  return { displayName: titleCase(network), color: null, icon: '📡' };
}

function normalizeRecord(record, filePath, defaults) {
  const row = Object.fromEntries(
    Object.entries(record).map(([key, value]) => [normalizeKey(key), value]),
  );

  const name = row.plan_name || row.name || row.plan || '';
  const planId = row.plan_id || row.api_code || row.code || row.sku || row.id || '';
  const network = inferNetwork(row.network || row.provider || row.teleco || defaults.network, filePath);
  const source = inferSource(row.source || defaults.source, filePath);
  const dataSize = row.data_size || row.size || extractDataSize(name, '');
  const originalPrice = toNumber(
    row.original_price ?? row.network_price ?? row.teleco_price ?? row.vendor_price ?? row.price,
    null,
  );
  const yourPrice = toNumber(
    row.your_price ?? row.our_price ?? row.selling_price ?? row.admin_price,
    null,
  );
  const walletPrice = toNumber(
    row.wallet_price ?? row.sim_price ?? row.api_cost ?? originalPrice,
    null,
  );
  const serviceName = String(row.service_name || row.service || defaults.serviceName || 'Data Plans').trim();
  const categoryName = String(
    row.category_name || row.group_name || row.plan_group || row.category_label || defaults.categoryName || row.category || 'Gifting Plans',
  ).trim();
  const subcategoryName = String(
    row.subcategory_name || row.subcategory || row.segment || row.plan_segment || defaults.subcategoryName || '',
  ).trim();

  if (!name || !planId || !network) return null;

  const networkMeta = inferNetworkMeta(network);

  return {
    source,
    provider: network,
    category: normalizeKey(row.category || defaults.category || 'gifting') || 'gifting',
    service_name: serviceName,
    service_slug: normalizeKey(serviceName).replace(/_/g, '-') || 'data-plans',
    category_name: categoryName || null,
    category_slug: categoryName ? normalizeKey(categoryName).replace(/_/g, '-') : null,
    subcategory_name: subcategoryName || null,
    subcategory_slug: subcategoryName ? normalizeKey(subcategoryName).replace(/_/g, '-') : null,
    network_display_name: networkMeta.displayName,
    network_color: networkMeta.color,
    network_icon: networkMeta.icon,
    name: String(name).trim(),
    size: dataSize || extractDataSize(name, ''),
    data_size: dataSize || extractDataSize(name, ''),
    size_mb: toNumber(row.size_mb, null) || extractSizeMb(dataSize || extractDataSize(name, '')),
    validity: String(row.validity || row.duration || defaults.validity || '30 Days').trim(),
    plan_id: String(planId).trim(),
    original_price: originalPrice,
    your_price: yourPrice ?? originalPrice,
    wallet_price: walletPrice ?? originalPrice,
    admin_price: yourPrice ?? originalPrice ?? 0,
    api_cost: walletPrice ?? originalPrice ?? 0,
    available_sim: toBoolean(row.available_sim ?? row.sim ?? row.available_on_sim, true),
    available_wallet: toBoolean(row.available_wallet ?? row.wallet ?? row.available_on_wallet, true),
    is_active: toBoolean(row.is_active ?? row.status, true),
    last_updated_by: defaults.lastUpdatedBy || 'import-script',
    smeplug_plan_id: source === 'smeplug' ? String(planId).trim() : null,
    ogdams_sku: source === 'ogdams' ? String(planId).trim() : null,
  };
}

function loadRecordsFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, 'utf8');
  if (ext === '.json') {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`JSON file must contain an array: ${filePath}`);
    }
    return parsed;
  }
  if (ext === '.csv') {
    return parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  }
  throw new Error(`Unsupported file format: ${filePath}`);
}

async function importPlans({ inputPath, source, network, dryRun = false }) {
  const stat = fs.statSync(inputPath);
  const filePaths = stat.isDirectory()
    ? fs.readdirSync(inputPath)
        .filter((file) => ['.json', '.csv'].includes(path.extname(file).toLowerCase()))
        .map((file) => path.join(inputPath, file))
    : [inputPath];

  if (!filePaths.length) {
    throw new Error(`No importable .json or .csv files found in ${inputPath}`);
  }

  const imported = [];
  const summary = { created: 0, updated: 0, skipped: 0 };

  for (const filePath of filePaths) {
    const records = loadRecordsFromFile(filePath);
    for (const record of records) {
      const normalized = normalizeRecord(record, filePath, {
        source,
        network,
        category: 'gifting',
        serviceName: 'Data Plans',
        categoryName: 'Gifting Plans',
        lastUpdatedBy: 'import-script',
      });

      if (!normalized) {
        summary.skipped += 1;
        continue;
      }

      imported.push(normalized);
      if (dryRun) continue;

      const existing = await DataPlan.findOne({
        where: {
          source: normalized.source,
          provider: normalized.provider,
          plan_id: normalized.plan_id,
        },
      });

      if (existing) {
        await existing.update(normalized);
        summary.updated += 1;
      } else {
        await DataPlan.create(normalized);
        summary.created += 1;
      }
    }
  }

  return { summary, imported };
}

async function importPlanFile({ filePath, source, network, dryRun = false }) {
  return importPlans({
    inputPath: filePath,
    source,
    network,
    dryRun,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input;

  if (!inputPath) {
    console.error('Usage: node scripts/importDataPlans.js --input <file-or-directory> [--source smeplug|ogdams] [--network mtn|airtel|glo] [--dry-run]');
    process.exit(1);
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`Input path does not exist: ${resolvedInput}`);
    process.exit(1);
  }

  await connectDB();
  const result = await importPlans({
    inputPath: resolvedInput,
    source: args.source ? String(args.source).toLowerCase() : undefined,
    network: args.network ? String(args.network).toLowerCase() : undefined,
    dryRun: Boolean(args['dry-run']),
  });

  console.log(JSON.stringify({
    input: resolvedInput,
    dryRun: Boolean(args['dry-run']),
    summary: result.summary,
    sample: result.imported.slice(0, 5),
  }, null, 2));

  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Plan import failed:', error);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  normalizeRecord,
  importPlans,
  importPlanFile,
  loadRecordsFromFile,
};
