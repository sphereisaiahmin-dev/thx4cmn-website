import { createBrowserClient } from '@supabase/ssr';

const normalizeSupabaseUrl = (candidate: string) => new URL(candidate).origin;

export const createSupabaseBrowserClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase browser environment variables.');
  }

  return createBrowserClient(normalizeSupabaseUrl(url), anonKey);
};
