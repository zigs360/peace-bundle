const KNOWN_UPSTREAM_PROVIDERS_REGEX = /\b(quicklysim|topupmate|smeplug|ogdams|clubkonnect|safehaven)\b/gi;
const INTERNAL_ROUTING_TERMS_REGEX = /\b(sim\s*pool|route\s*selected|upstream|gateway|locked\s*route|did\s*not\s*confirm\s*success|provider\s*failed|provider\s*data|api\s*balance)\b/gi;

function toPlainObject(value) {
  if (!value) return value;
  if (typeof value.toJSON === 'function') {
    return value.toJSON();
  }
  return { ...value };
}

function sanitizeUserFacingErrorMessage(message, fallback) {
  const defaultFallback = 'Transaction failed on Peace Bundle and was automatically reversed to your wallet.';
  const effectiveFallback = (fallback !== undefined && fallback !== null) ? fallback : defaultFallback;

  if (!message || typeof message !== 'string') {
    return effectiveFallback;
  }
  const trimmed = message.trim();
  if (!trimmed) {
    return effectiveFallback;
  }

  const hasProvider = KNOWN_UPSTREAM_PROVIDERS_REGEX.test(trimmed);
  KNOWN_UPSTREAM_PROVIDERS_REGEX.lastIndex = 0;
  const hasInternalTerm = INTERNAL_ROUTING_TERMS_REGEX.test(trimmed);
  INTERNAL_ROUTING_TERMS_REGEX.lastIndex = 0;

  const isReversalOrRefund = /\b(revers\w*|refund\w*|auto-revers\w*|rolled\s*back)\b/i.test(trimmed) ||
                             /\b(revers\w*|refund\w*)\b/i.test(effectiveFallback) ||
                             fallback === undefined;
  const isData = /\bdata\b/i.test(trimmed) || /\bdata\b/i.test(effectiveFallback);
  const isAirtime = /\bairtime\b/i.test(trimmed) || /\bairtime\b/i.test(effectiveFallback);

  if (hasProvider || hasInternalTerm) {
    if (isData) {
      return isReversalOrRefund
        ? 'Data purchase failed on Peace Bundle and was automatically reversed'
        : 'Data purchase failed on Peace Bundle. Please try again or contact support.';
    }
    if (isAirtime) {
      return isReversalOrRefund
        ? 'Airtime purchase failed on Peace Bundle and was automatically reversed'
        : 'Airtime purchase failed on Peace Bundle. Please try again or contact support.';
    }
    if (isReversalOrRefund) {
      return 'Transaction could not be completed on Peace Bundle and was automatically reversed to your wallet.';
    }
    return fallback || 'Transaction failed on Peace Bundle. Please try again or contact support.';
  }

  return trimmed.replace(KNOWN_UPSTREAM_PROVIDERS_REGEX, 'Peace Bundle');
}

function sanitizePlanForClient(plan, { isAdmin = false } = {}) {
  const plain = toPlainObject(plan);
  if (!plain || isAdmin) return plain;

  delete plain.plan_id;
  delete plain.smeplug_plan_id;
  delete plain.ogdams_sku;
  delete plain.api_plan_id;

  return plain;
}

function sanitizeTransactionForClient(transaction, { isAdmin = false } = {}) {
  const plain = toPlainObject(transaction);
  if (!plain || isAdmin) return plain;

  if (plain.failure_reason) {
    plain.failure_reason = sanitizeUserFacingErrorMessage(
      plain.failure_reason,
      'Transaction failed on Peace Bundle and was automatically reversed'
    );
  }
  if (plain.description && typeof plain.description === 'string') {
    plain.description = plain.description.replace(KNOWN_UPSTREAM_PROVIDERS_REGEX, 'Peace Bundle');
  }

  const KNOWN_UPSTREAM_SLUGS = new Set(['quicklysim', 'topupmate', 'smeplug', 'ogdams', 'clubkonnect', 'safehaven']);
  if (plain.provider && KNOWN_UPSTREAM_SLUGS.has(String(plain.provider).toLowerCase().trim())) {
    plain.provider = plain.metadata?.network || null;
  }

  if (plain.metadata && typeof plain.metadata === 'object') {
    plain.metadata = { ...plain.metadata };
    delete plain.metadata.provider_plan_id;
    delete plain.metadata.api_plan_id;
    delete plain.metadata.smeplug_plan_id;
    delete plain.metadata.ogdams_sku;
    delete plain.metadata.service_provider;
    delete plain.metadata.provider;
    delete plain.metadata.provider_attempts;
    delete plain.metadata.locked_route;
    delete plain.metadata.smeplug_response;
    delete plain.metadata.topupmate_response;
    delete plain.metadata.quicklysim_response;
    delete plain.metadata.ogdams_response;
    delete plain.metadata.refund_reason;
  }

  delete plain.smeplug_response;
  delete plain.provider_response;
  delete plain.quicklysim_response;
  delete plain.ogdams_response;

  return plain;
}

function sanitizeVoiceBundlePurchaseForClient(purchase, { isAdmin = false } = {}) {
  const plain = toPlainObject(purchase);
  if (!plain || isAdmin) return plain;

  delete plain.apiPlanId;

  if (plain.metadata && typeof plain.metadata === 'object') {
    plain.metadata = { ...plain.metadata };
    delete plain.metadata.api_plan_id;
    delete plain.metadata.apiPlanId;
  }

  return plain;
}

module.exports = {
  KNOWN_UPSTREAM_PROVIDERS_REGEX,
  sanitizeUserFacingErrorMessage,
  sanitizePlanForClient,
  sanitizeTransactionForClient,
  sanitizeVoiceBundlePurchaseForClient,
};
