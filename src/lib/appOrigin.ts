const APP_ORIGIN_ENV_KEY = 'APP_ORIGIN';
const PLACEHOLDER_HOSTS = new Set(['your-domain.example', 'example.com']);

export const normalizeOrigin = (candidate: string | null) => {
  if (!candidate) return null;

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
};

const isPlaceholderOrigin = (origin: string | null) => {
  if (!origin) return false;

  try {
    return PLACEHOLDER_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
};

const resolveRequestOrigin = (requestHeaders?: Headers) => {
  const originHeader = requestHeaders ? normalizeOrigin(requestHeaders.get('origin')) : null;
  if (originHeader) {
    return originHeader;
  }

  const forwardedProto = requestHeaders?.get('x-forwarded-proto');
  const forwardedHost = requestHeaders?.get('x-forwarded-host') ?? requestHeaders?.get('host');
  if (forwardedHost) {
    return normalizeOrigin(`${forwardedProto ?? 'http'}://${forwardedHost}`);
  }

  return null;
};

export const resolveAppOrigin = (requestHeaders?: Headers) => {
  const configuredOrigin = normalizeOrigin(process.env[APP_ORIGIN_ENV_KEY] ?? null);
  const usableConfiguredOrigin = isPlaceholderOrigin(configuredOrigin) ? null : configuredOrigin;
  if (process.env.NODE_ENV === 'production') {
    if (!usableConfiguredOrigin) {
      throw new Error(`${APP_ORIGIN_ENV_KEY} must be configured for production checkout.`);
    }
    return usableConfiguredOrigin;
  }

  const requestOrigin = resolveRequestOrigin(requestHeaders);
  if (requestOrigin) {
    return requestOrigin;
  }

  if (usableConfiguredOrigin) {
    return usableConfiguredOrigin;
  }

  return 'http://localhost:3000';
};
