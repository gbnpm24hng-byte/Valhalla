// "Hoy" en hora local: a las 22:30 del 19-10 en Chile (01:30 del 20-10 en UTC) la fecha por
// defecto de lo nuevo es 2026-10-19, no el día siguiente.
process.env.TZ = 'America/Santiago';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/data.js');
require('../assets/js/finance.js');

const data = globalThis.VALHALLA.data;
const finance = globalThis.VALHALLA.finance;
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// 22:30 en Chile (horario de verano, UTC-3) = 01:30 UTC del día siguiente.
const NIGHT_IN_CHILE = '2026-10-20T01:30:00.000Z';

function atNightInChile(t) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(NIGHT_IN_CHILE) });
  assert.equal(new Date().toISOString().slice(0, 10), '2026-10-20', 'en UTC ya es el día siguiente');
}

test('localDateString: a las 22:30 del 19-10 en Chile es 2026-10-19', (t) => {
  atNightInChile(t);
  assert.equal(data.localDateString(), '2026-10-19');
  assert.equal(data.localDateString(new Date('2026-10-19T12:00:00-03:00')), '2026-10-19');
  // Justo después de la medianoche de Chile ya es el 20.
  assert.equal(data.localDateString(new Date('2026-10-20T00:05:00-03:00')), '2026-10-20');
});

test('consideración deportiva nueva sin fecha: notedOn 2026-10-19 (data.js)', (t) => {
  atNightInChile(t);
  assert.equal(data.normalizeSportsConsideration({ clientId: 'cli-falso' }).notedOn, '2026-10-19');
  // Una fecha ya guardada no cambia.
  assert.equal(data.normalizeSportsConsideration({ clientId: 'cli-falso', notedOn: '2026-10-20' }).notedOn, '2026-10-20');
});

test('registro de nutrición sin fecha: date 2026-10-19 (data.js)', (t) => {
  atNightInChile(t);
  const state = data.importState(JSON.stringify({ nutritionLogs: [{ id: 'log-falso', clientId: 'cli-falso' }, { id: 'log-viejo', clientId: 'cli-falso', date: '2026-10-20' }] }));
  assert.equal(state.nutritionLogs[0].date, '2026-10-19');
  assert.equal(state.nutritionLogs[1].date, '2026-10-20', 'lo guardado no se migra');
});

test('finanzas: el mes del panel es el de la hora local (finance.js)', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-01T01:30:00.000Z') }); // 31-10 22:30 en Chile
  const state = { movements: [{ id: 'm-oct', date: '2026-10-05' }, { id: 'm-nov', date: '2026-11-02' }] };
  assert.deepEqual(finance.getMonthMovements(state).map((item) => item.id), ['m-oct']);
});

test('los demás "hoy" usan la función local y ya no toISOString (app.js, cloud-data.js, finance.js)', () => {
  const app = read('assets/js/app.js');
  assert.match(app, /dailyDate: getTodayLocalDate\(\)/, 'nutritionUi.dailyDate');
  assert.match(app, /date: payload\.date \|\| getTodayLocalDate\(\)/, 'registro diario de nutrición');
  assert.match(app, /function getTodayLocalDate\(\) \{\n\s+return dataApi\.localDateString\(\);/, 'una sola lógica de "hoy"');
  assert.match(read('assets/js/cloud-data.js'), /noted_on: itemPayload\?\.noted_on \|\| dataApi\.localDateString\(\)/);
  assert.match(read('assets/js/finance.js'), /date: localDateString\(\),/, 'pago de alumno');
  // Solo quedan los cálculos sobre una fecha dada (no "hoy"): previousDay y shiftDate.
  const remaining = ['app.js', 'data.js', 'cloud-data.js', 'finance.js', 'client-overrides-core.js', 'self-log-core.js', 'publish-core.js', 'sync-core.js', 'student-view.js']
    .flatMap((file) => (read(`assets/js/${file}`).match(/.*toISOString\(\)\.slice\(0, ?(7|10)\).*/g) || []).map((line) => `${file}: ${line.trim()}`));
  assert.deepEqual(remaining, [
    'client-overrides-core.js: return value.toISOString().slice(0, 10);',
    'self-log-core.js: return date.toISOString().slice(0, 10);'
  ]);
});
