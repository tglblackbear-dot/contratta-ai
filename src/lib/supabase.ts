import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "O Supabase ainda não está configurado. Crie o projeto separado e preencha as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
}
