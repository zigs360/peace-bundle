const ACCESS_COOKIE_NAME = 'pb_access_token';
const REFRESH_COOKIE_NAME = 'pb_refresh_token';
const TRANSACTION_PIN_COOKIE_PREFIX = 'pb_pin_session';
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sanitizeScope(scope = 'financial') {
  return String(scope || 'financial')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '') || 'financial';
}

function parseCookieHeader(headerValue) {
  return String(headerValue || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) return acc;
      const key = part.slice(0, separatorIndex).trim();
      const rawValue = part.slice(separatorIndex + 1).trim();
      try {
        acc[key] = decodeURIComponent(rawValue);
      } catch (_error) {
        acc[key] = rawValue;
      }
      return acc;
    }, {});
}

function parseCookies(req) {
  return parseCookieHeader(req?.headers?.cookie || '');
}

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function buildCookieOptions(maxAge, overrides = {}) {
  const production = isProduction();
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/',
    maxAge,
    ...overrides,
  };
}

function buildClearCookieOptions(overrides = {}) {
  const production = isProduction();
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/',
    ...overrides,
  };
}

function getAccessTokenFromRequest(req) {
  const authHeader = String(req?.headers?.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim() || null;
  }

  const cookies = parseCookies(req);
  return cookies[ACCESS_COOKIE_NAME] || null;
}

function getRefreshTokenFromRequest(req) {
  const bodyToken = req?.body?.refreshToken;
  if (bodyToken) return String(bodyToken);

  const cookies = parseCookies(req);
  return cookies[REFRESH_COOKIE_NAME] || null;
}

function getTransactionPinCookieName(scope = 'financial') {
  return `${TRANSACTION_PIN_COOKIE_PREFIX}_${sanitizeScope(scope)}`;
}

function getTransactionPinTokenFromRequest(req, scope = 'financial') {
  const headerToken = req?.headers?.['x-transaction-pin-token'] || req?.headers?.['x-transaction-authorization'];
  if (headerToken) return String(headerToken);

  const cookies = parseCookies(req);
  return cookies[getTransactionPinCookieName(scope)] || null;
}

function setAuthCookies(res, { accessToken, refreshToken }) {
  if (accessToken) {
    res.cookie(ACCESS_COOKIE_NAME, accessToken, buildCookieOptions(ACCESS_TOKEN_TTL_MS));
  }
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, buildCookieOptions(REFRESH_TOKEN_TTL_MS));
  }
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE_NAME, buildClearCookieOptions());
  res.clearCookie(REFRESH_COOKIE_NAME, buildClearCookieOptions());
}

function setTransactionPinCookie(res, { token, scope = 'financial', maxAge }) {
  res.cookie(
    getTransactionPinCookieName(scope),
    token,
    buildCookieOptions(maxAge, { maxAge: maxAge || 5 * 60 * 1000 })
  );
}

function clearTransactionPinCookie(res, scope = 'financial') {
  res.clearCookie(getTransactionPinCookieName(scope), buildClearCookieOptions());
}

module.exports = {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  parseCookies,
  parseCookieHeader,
  getAccessTokenFromRequest,
  getRefreshTokenFromRequest,
  getTransactionPinCookieName,
  getTransactionPinTokenFromRequest,
  setAuthCookies,
  clearAuthCookies,
  setTransactionPinCookie,
  clearTransactionPinCookie,
};
