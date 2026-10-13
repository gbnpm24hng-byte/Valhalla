const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/data.js');
require('../assets/js/sync-core.js');
require('../assets/js/group-draft-core.js');

const core = globalThis.VALHALLA.groupDraftCore;
const data = globalThis.VALHALLA.data;
const sync = globalThis.VALHALLA.syncCore;

const ui = (extra = {}) => ({
  sessionDate: '2026-10-12', dateIsManual: false, selectedClientIds: ['cli-a', 'cli-b'], dayChoices: { 'cli-a': 'dia-lun' },
  drafts: {
    'cli-a::ej-sent': { warmups: '40', setCount: 3, s1Weight: '70', s1Reps: '8', rir: '', decision: '', proposedWeight: '70', error: 'Falta el RIR final', basura: 'x', comment: { text: 'baja la técnica', visibleToStudent: false } },
    'cli-b::ej-sent': { warmups: '', setCount: 3, rir: '', decision: '', proposedWeight: '60', error: '' }
  },
  picker: null, commentEditor: null, history: { 'cli-a': 0 }, clientNotices: { 'cli-a': 'aviso' },
  ...extra
});

test('la clave es por cuenta y no se confunde con el estado que se sincroniza', () => {
  assert.equal(core.storageKey('coach-1'), 'valhalla_group_draft:coach-1');
  assert.notEqual(core.storageKey('coach-1'), core.storageKey('coach-2'));
  assert.equal(core.storageKey(''), 'valhalla_group_draft:local');
  assert.ok(![data.STORAGE_KEY, ...data.LEGACY_STORAGE_KEYS].includes(core.storageKey('coach-1')));
  assert.ok(!sync.SYNCED_KEYS.some((key) => key.startsWith('valhalla_group_draft')));
});

test('la foto guarda solo lo escrito, sin errores, avisos ni campos ajenos', () => {
  const snap = core.buildSnapshot({ ownerId: 'coach-1', ui: ui(), today: '2026-10-12', now: new Date('2026-10-12T14:00:00Z') });
  assert.equal(snap.schema, 1);
  assert.equal(snap.ownerId, 'coach-1');
  assert.equal(snap.savedDay, '2026-10-12');
  assert.deepEqual(snap.selectedClientIds, ['cli-a', 'cli-b']);
  const a = snap.drafts['cli-a::ej-sent'];
  assert.deepEqual(a, { setCount: 3, error: '', warmups: '40', s1Weight: '70', s1Reps: '8', rir: '', decision: '', proposedWeight: '70', comment: { text: 'baja la técnica', visibleToStudent: false } });
  assert.equal('history' in snap || 'clientNotices' in snap, false);
});

test('hay algo sin confirmar: series, RIR, comentario o galería; la decisión o la propuesta de peso solas no', () => {
  assert.equal(core.entryHasData({ setCount: 3, proposedWeight: '70' }), false);
  assert.equal(core.entryHasData({ s2Reps: '8' }), true);
  assert.equal(core.entryHasData({ rir: '2' }), true);
  assert.equal(core.entryHasData({ decision: 'up' }), false);
  assert.equal(core.entryHasData({ decision: 'up', s1Weight: '60' }), true);
  assert.equal(core.entryHasData({ comment: { text: 'x' } }), true);
  assert.equal(core.hasUnconfirmedData({ drafts: {}, picker: { clientId: 'cli-a', exerciseId: 'lib-x' } }), true);
  assert.equal(core.hasUnconfirmedData({ drafts: {}, commentEditor: { clientId: 'cli-b', text: 'hola' } }), true);
  assert.deepEqual(core.clientsWithData(core.buildSnapshot({ ownerId: 'c', ui: ui(), today: '2026-10-12' })), ['cli-a']);
});

test('al leer: otra cuenta, otro esquema o datos rotos no se usan; lo raro se limpia', () => {
  const snap = core.buildSnapshot({ ownerId: 'coach-1', ui: ui(), today: '2026-10-12' });
  const raw = JSON.stringify(snap);
  assert.ok(core.readSnapshot(raw, 'coach-1'));
  assert.equal(core.readSnapshot(raw, 'coach-2'), null, 'ligado a la cuenta');
  assert.equal(core.readSnapshot('{roto', 'coach-1'), null);
  assert.equal(core.readSnapshot(JSON.stringify({ ...snap, schema: 9 }), 'coach-1'), null);
  const dirty = core.readSnapshot(JSON.stringify({ ...snap, drafts: { 'cli-a::ej-sent': { s1Weight: '70', malicioso: '<script>' }, 'sin-separador': { s1Weight: '1' } } }), 'coach-1');
  assert.deepEqual(Object.keys(dirty.drafts), ['cli-a::ej-sent']);
  assert.equal('malicioso' in dirty.drafts['cli-a::ej-sent'], false);
});

test('hoy se retoma solo; de otro día se pregunta; sin nada no hay borrador', () => {
  const snap = core.readSnapshot(JSON.stringify(core.buildSnapshot({ ownerId: 'c', ui: ui(), today: '2026-10-12' })), 'c');
  assert.equal(core.classify(snap, '2026-10-12'), 'same-day');
  assert.equal(core.classify(snap, '2026-10-13'), 'other-day');
  assert.equal(core.classify(null, '2026-10-12'), 'none');
  const empty = core.buildSnapshot({ ownerId: 'c', ui: ui({ selectedClientIds: [], drafts: {} }), today: '2026-10-12' });
  assert.equal(core.isWorthSaving(empty), false, 'sin alumnos ni nada escrito se borra');
  const onlySelected = core.buildSnapshot({ ownerId: 'c', ui: ui({ drafts: { 'cli-a::ej-sent': { setCount: 3, proposedWeight: '70' } } }), today: '2026-10-12' });
  assert.equal(core.isWorthSaving(onlySelected), false, 'elegir alumnos sin escribir nada no es borrador');
  assert.equal(core.classify(onlySelected, '2026-10-12'), 'none');
  assert.equal(core.isWorthSaving(snap), true);
});
