import { createClient } from '@supabase/supabase-js';

const normalizeSupabaseUrl = (candidate: string) => new URL(candidate).origin;

export const createServerClient = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase server environment variables.');
  }

  return createClient(normalizeSupabaseUrl(url), serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
};
