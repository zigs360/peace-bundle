const NETWORK_META = {
  mtn: { displayName: 'MTN', color: '#FFCC00', icon: '📡' },
  airtel: { displayName: 'Airtel', color: '#FF0000', icon: '📡' },
  glo: { displayName: 'Glo', color: '#008000', icon: '📡' },
  '9mobile': { displayName: '9mobile', color: '#006B3F', icon: '📡' },
};

function slugify(value, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function listify(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function dedupeTerms(values) {
  const unique = [];
  for (const value of listify(values)) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const exists = unique.some((item) => item === normalized);
    if (!exists) unique.push(normalized);
  }
  return unique;
}

function isSynonymLike(a, b) {
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a);
}

function inferContainsMode(values, label) {
  const terms = dedupeTerms(values);
  if (terms.length <= 1) return 'all';

  const rawLabel = String(label || '');
  if (/[\/&]/.test(rawLabel)) {
    return 'any';
  }

  for (let index = 0; index < terms.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < terms.length; compareIndex += 1) {
      if (isSynonymLike(terms[index], terms[compareIndex])) {
        return 'any';
      }
    }
  }

  return 'all';
}

function matchesNameContains(planName, values, label) {
  const haystack = normalizeText(planName);
  const terms = dedupeTerms(values);
  if (!terms.length) return true;

  const mode = inferContainsMode(terms, label);
  if (mode === 'any') {
    return terms.some((term) => haystack.includes(term));
  }

  return terms.every((term) => haystack.includes(term));
}

function mergeFilter(baseFilter, overrideFilter) {
  return {
    ...(baseFilter || {}),
    ...(overrideFilter || {}),
  };
}

function buildTaxonomyEntry({
  network,
  networkName,
  networkIcon,
  networkColor,
  serviceName,
  categoryName,
  categoryType,
  subcategoryName = null,
  filter = {},
  shared = false,
}) {
  return {
    network,
    networkName,
    networkIcon: networkIcon || NETWORK_META[network]?.icon || '📡',
    networkColor: networkColor || NETWORK_META[network]?.color || null,
    serviceName,
    serviceSlug: slugify(serviceName, 'data-plans'),
    categoryName,
    categorySlug: slugify(categoryName, 'general'),
    categoryType: categoryType || 'data',
    subcategoryName,
    subcategorySlug: subcategoryName ? slugify(subcategoryName) : null,
    filter,
    shared,
  };
}

function flattenTaxonomy(taxonomy) {
  const entries = [];
  const networks = Array.isArray(taxonomy?.networks) ? taxonomy.networks : [];

  for (const network of networks) {
    const networkCode = String(network?.code || '').toLowerCase();
    if (!networkCode) continue;

    const services = Array.isArray(network?.services) ? network.services : [];
    for (const service of services) {
      const serviceName = String(service?.name || '').trim();
      const categories = Array.isArray(service?.categories) ? service.categories : [];

      for (const category of categories) {
        if (String(category?.type || '').toLowerCase() !== 'data') continue;

        const categoryName = String(category?.name || '').trim();
        const categoryFilter = category?.source ? { source: category.source } : {};
        const subcategories = Array.isArray(category?.subcategories) ? category.subcategories : [];

        if (!subcategories.length) {
          entries.push(
            buildTaxonomyEntry({
              network: networkCode,
              networkName: network?.name || networkCode.toUpperCase(),
              networkIcon: network?.icon,
              networkColor: network?.color,
              serviceName,
              categoryName,
              categoryType: category?.type,
              filter: mergeFilter(categoryFilter, category?.filter),
            }),
          );
          continue;
        }

        for (const subcategory of subcategories) {
          entries.push(
            buildTaxonomyEntry({
              network: networkCode,
              networkName: network?.name || networkCode.toUpperCase(),
              networkIcon: network?.icon,
              networkColor: network?.color,
              serviceName,
              categoryName,
              categoryType: category?.type,
              subcategoryName: subcategory?.name || null,
              filter: mergeFilter(categoryFilter, subcategory?.filter),
            }),
          );
        }
      }
    }
  }

  const sharedServices = taxonomy?.shared_services;
  const sharedCategories = Array.isArray(sharedServices?.categories) ? sharedServices.categories : [];
  for (const category of sharedCategories) {
    if (String(category?.filter?.type || '').toLowerCase() === 'voice_bundle') continue;

    const targetNetworks = Array.isArray(category?.networks) && category.networks.length
      ? category.networks
      : networks.map((network) => network.code);

    for (const networkCodeRaw of targetNetworks) {
      const networkCode = String(networkCodeRaw || '').toLowerCase();
      if (!networkCode) continue;
      const meta = NETWORK_META[networkCode] || {};
      entries.push(
        buildTaxonomyEntry({
          network: networkCode,
          networkName: meta.displayName || networkCode.toUpperCase(),
          networkIcon: meta.icon || '📡',
          networkColor: meta.color || null,
          serviceName: sharedServices?.name || 'Other Services',
          categoryName: category?.name || 'Other Services',
          categoryType: 'data',
          filter: mergeFilter(category?.source ? { source: category.source } : {}, category?.filter),
          shared: true,
        }),
      );
    }
  }

  return entries.sort((left, right) => scoreEntry(right) - scoreEntry(left));
}

function scoreEntry(entry) {
  const filter = entry?.filter || {};
  let score = entry.shared ? 0 : 10;

  if (filter.source && String(filter.source).toLowerCase() !== 'all') {
    score += 5;
  }

  const validityValues = listify(filter.validity).filter(Boolean);
  if (validityValues.length) {
    score += 8 + validityValues.length;
  }

  const nameContainsTerms = dedupeTerms(filter.name_contains);
  if (nameContainsTerms.length) {
    score += 6 + nameContainsTerms.length;
  }

  if (entry.subcategoryName) score += 2;
  if (entry.categoryName) score += 1;

  return score;
}

function matchesFilter(plan, entry) {
  const filter = entry?.filter || {};
  const provider = String(plan?.provider || plan?.network || '').toLowerCase();
  const source = String(plan?.source || '').toLowerCase();
  const validity = normalizeText(plan?.validity);
  const name = String(plan?.name || plan?.plan || '');

  if (entry.network && provider !== entry.network) return false;

  if (filter.source && String(filter.source).toLowerCase() !== 'all') {
    if (source !== String(filter.source).toLowerCase()) return false;
  }

  const validityValues = listify(filter.validity)
    .map((value) => normalizeText(value))
    .filter(Boolean);
  if (validityValues.length && !validityValues.includes(validity)) {
    return false;
  }

  if (filter.name_contains) {
    const label = [entry.categoryName, entry.subcategoryName].filter(Boolean).join(' ');
    if (!matchesNameContains(name, filter.name_contains, label)) {
      return false;
    }
  }

  if (filter.type && String(filter.type).toLowerCase() !== 'data') {
    return false;
  }

  return true;
}

function buildAssignment(entry) {
  return {
    service_name: entry.serviceName,
    service_slug: entry.serviceSlug,
    category_name: entry.categoryName,
    category_slug: entry.categorySlug,
    subcategory_name: entry.subcategoryName || null,
    subcategory_slug: entry.subcategorySlug || null,
    network_display_name: entry.networkName,
    network_color: entry.networkColor,
    network_icon: entry.networkIcon,
    category: slugify(entry.categoryName, 'data').replace(/-/g, '_'),
  };
}

function classifyPlan(plan, taxonomyOrEntries) {
  const entries = Array.isArray(taxonomyOrEntries)
    ? taxonomyOrEntries
    : flattenTaxonomy(taxonomyOrEntries);

  for (const entry of entries) {
    if (matchesFilter(plan, entry)) {
      return {
        entry,
        assignment: buildAssignment(entry),
      };
    }
  }

  return null;
}

module.exports = {
  NETWORK_META,
  slugify,
  flattenTaxonomy,
  matchesFilter,
  classifyPlan,
};
