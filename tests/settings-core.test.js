const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/settings-core.js');

const core = globalThis.VALHALLA.settingsCore;

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };

test('la fecha del último respaldo usa su propia clave y sobrevive a un almacenamiento bloqueado', () => {
  const storage = memoryStorage();
  assert.equal(core.LAST_EXPORT_KEY, 'valhalla_last_export_at');
  assert.equal(core.readLastExport(storage), '');
  assert.equal(core.writeLastExport(storage, new Date('2026-11-05T15:00:00Z')), true);
  assert.deepEqual(Object.keys(storage.data), ['valhalla_last_export_at']);
  assert.equal(core.readLastExport(storage), '2026-11-05T15:00:00.000Z');
  assert.equal(core.readLastExport(broken), '');
  assert.equal(core.writeLastExport(broken), false);
  assert.equal(core.readLastExport(null), '');
  assert.equal(core.readLastExport(memoryStorage({ valhalla_last_export_at: 'basura' })), '');
});

test('aviso: nunca exportado o más de 7 días', () => {
  const now = new Date(2026, 10, 5, 12, 0);
  const never = core.describeLastExport('', now);
  assert.equal(never.needsReminder, true);
  assert.equal(never.agoText, 'Último respaldo: nunca en este equipo');
  const at = (daysAgo) => core.describeLastExport(new Date(2026, 10, 5 - daysAgo, 9, 30).toISOString(), now);
  assert.equal(at(0).agoText, 'Último respaldo: hoy');
  assert.equal(at(1).agoText, 'Último respaldo: ayer');
  assert.equal(at(3).agoText, 'Último respaldo: hace 3 días');
  assert.equal(at(7).needsReminder, false);
  assert.equal(at(8).needsReminder, true);
  assert.equal(at(8).agoText, 'Último respaldo: hace 8 días');
  assert.match(at(0).dateText, / · en este equipo$/);
});

test('solo un respaldo completo con alumnos se puede restaurar', () => {
  const backup = { clients: [{ id: 'a' }, { id: 'b' }], trainingsV08: { programs: [{ id: 'p' }] } };
  assert.deepEqual(core.inspectBackup(JSON.stringify(backup)), { ok: true, readable: true, clients: 2, programs: 1, reason: '' });
  const program = core.inspectBackup(JSON.stringify({ format: 'valhalla-programa', formatVersion: 1, name: 'X', days: [] }));
  assert.equal(program.ok, false);
  assert.equal(program.isProgram, true);
  assert.equal(core.inspectBackup(JSON.stringify({ ...backup, format: 'valhalla-programa' })).ok, false);
  assert.equal(core.inspectBackup(JSON.stringify({ clients: [], trainingsV08: { programs: [{}] } })).ok, false);
  assert.equal(core.inspectBackup(JSON.stringify({ trainingsV08: {} })).ok, false);
  assert.equal(core.inspectBackup('{ roto').ok, false);
  assert.equal(core.inspectBackup('[1,2]').ok, false);
  assert.equal(core.inspectBackup('null').ok, false);
});
