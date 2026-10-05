(function () {
  // Configuración de Supabase: SOLO valores públicos por diseño.
  // 1) SUPABASE_URL: Project URL (Project Settings > API).
  // 2) SUPABASE_ANON_KEY: clave publishable (sb_publishable_...). Nunca la secret key.
  // La seguridad de los datos depende de RLS en la base, no de ocultar estos valores.
  // Con ambos vacíos la app funciona en Modo Local, sin pantalla de acceso.
  window.SUPABASE_URL = 'https://kxouspyrgyaweuhyxtrp.supabase.co';
  window.SUPABASE_ANON_KEY = 'sb_publishable_-3lJmyyTweKA0-FLfNItvA_pm-IDDuY';

  window.VALHALLA_CONFIG = {
    SUPABASE_URL: window.SUPABASE_URL,
    SUPABASE_ANON_KEY: window.SUPABASE_ANON_KEY
  };
})();
