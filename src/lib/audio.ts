const ensureLeadingSlash = (value: string): string =>
  value.startsWith('/') ? value : `/${value}`;

export const getAudioUrl = (path: string): string => {
  const baseUrl = process.env.NEXT_PUBLIC_AUDIO_BASE_URL;
  const normalizedPath = path.replace(/^\/+/, '');

  if (!baseUrl) {
    return ensureLeadingSlash(normalizedPath);
  }

  const normalizedBase = baseUrl.replace(/\/+$/, '');
  return `${normalizedBase}/${normalizedPath}`;
};
