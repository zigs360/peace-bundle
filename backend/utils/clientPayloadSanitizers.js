function toPlainObject(value) {
  if (!value) return value;
  if (typeof value.toJSON === 'function') {
    return value.toJSON();
  }
  return { ...value };
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

  if (plain.metadata && typeof plain.metadata === 'object') {
    plain.metadata = { ...plain.metadata };
    delete plain.metadata.provider_plan_id;
    delete plain.metadata.api_plan_id;
    delete plain.metadata.smeplug_plan_id;
    delete plain.metadata.ogdams_sku;
  }

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
  sanitizePlanForClient,
  sanitizeTransactionForClient,
  sanitizeVoiceBundlePurchaseForClient,
};
