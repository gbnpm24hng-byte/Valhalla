(function(){
  const key='valhalla_v07';
  const raw = localStorage.getItem(key);
  console.log('LOCAL_STORAGE_RAW_EXISTS', !!raw);
  if (!raw) { console.log('LOCAL_STORAGE_EMPTY'); return; }
  try {
    const parsed = JSON.parse(raw);
    console.log('CLIENT_COUNT', Array.isArray(parsed.clients) ? parsed.clients.length : 'n/a');
    console.log('RESERVE', parsed.profile && parsed.profile.minimum_reserve !== undefined ? parsed.profile.minimum_reserve : 'n/a');
    console.log('INITIAL_CASH', parsed.profile && parsed.profile.initial_cash !== undefined ? parsed.profile.initial_cash : 'n/a');
    console.log('CLIENT_NAMES', Array.isArray(parsed.clients) ? parsed.clients.slice(0,5).map(c => c.name).join(' | ') : 'n/a');
  } catch (e) {
    console.log('LOCAL_STORAGE_PARSE_ERROR', e && e.message);
  }
})();
