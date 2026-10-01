(function () {
  // Supabase Cloud configuration (public values only).
  // 1) SUPABASE_URL: Project URL from Supabase Project Settings > API
  // 2) SUPABASE_ANON_KEY: Publishable (anon) key from Supabase Project Settings > API
  // Keep both as empty strings to run in Local mode.
  window.SUPABASE_URL = '';
  window.SUPABASE_ANON_KEY = '';

  window.VALHALLA_CONFIG = {
    SUPABASE_URL: window.SUPABASE_URL,
    SUPABASE_ANON_KEY: window.SUPABASE_ANON_KEY
  };
})();
