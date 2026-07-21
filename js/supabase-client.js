// ============================================================
// CLIENT SUPABASE — configuration centralisée
// ============================================================
const SUPABASE_URL = "https://wzgomcvwpkqkxoyhysca.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_s5up-GqvZhyaWkNsxoLNoA_BbUoF35t";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);
