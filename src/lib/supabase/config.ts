// The project URL and publishable key are public by design (they ship to every
// browser and only allow what row-level security permits). The secret key is
// never here: it lives only in the SUPABASE_SECRET_KEY environment variable.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://alinpnqhzxktalanjrwr.supabase.co";
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_K_0RahaGSAdoAyGnljIFUA_50fNW9OZ";
