import assert from "node:assert/strict";
import * as grid from "../../static/js/beatgrid.js";
import { TRANSLATIONS, LANGUAGES } from "../../static/js/i18n.js";

// No canvas is required to exercise the editor's real history and PATCH path.
globalThis.document = { querySelector: () => null, getElementById: () => null };
const requests = [];
globalThis.fetch = async (url, options) => {
  requests.push({ url, ...options });
  return { ok: true };
};
let changes = 0;
async function init(beats = [0.25, 0.8, 1.5], duration = 3, bars = []) {
  grid.destroyBeatGrid();
  await grid.flushBeatGrid();
  requests.length = 0;
  changes = 0;
  grid.initBeatGrid({ jobId: "fixed-bpm", grid: { beats, bars }, duration,
    onChange: () => changes++ });
}
const serialized = (beats) => beats.map(t => +t.toFixed(6));

await init();
assert.deepEqual(grid.applyFixedBpm(120), { ok: true });
assert.deepEqual(grid.getBeats(), [0.25, 0.75, 1.25, 1.75, 2.25, 2.75]);
assert.equal(grid.getBeatGridBpm(), 120);
assert.equal(changes, 1);
assert.equal(grid.canUndo(), true);
grid.undoBeatGrid();
assert.deepEqual(grid.getBeats(), [0.25, 0.8, 1.5]);
grid.redoBeatGrid();
assert.equal(grid.getBeats().length, 6);
grid.flushBeatGrid();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(requests.length, 1);
assert.deepEqual(JSON.parse(requests[0].body).beats, serialized(grid.getBeats()));
assert.equal(requests[0].method, "PATCH");

await init([0.1234567, 1], 5000);
grid.applyFixedBpm(123.456);
for (const [i, t] of grid.getBeats().entries()) {
  assert.equal(t, 0.1234567 + i * (60 / 123.456));
  assert.ok(t <= 5000);
}
assert.equal(grid.getBeats()[0], 0.1234567);

await init([0, 0.7, 1.4, 2.1], 3, [{ beat: 0, beats_per_bar: 3 }, { beat: 3, beats_per_bar: 5 }]);
grid.applyFixedBpm(30);
assert.deepEqual(grid.getBeats(), [0, 2]);
assert.deepEqual(grid.getBars(), [{ beat: 0, beats_per_bar: 3 }]);
grid.undoBeatGrid();
assert.equal(grid.getBars().length, 2);
grid.applyFixedBpm(300);
assert.equal(grid.getBeats().length, 16);
assert.equal(grid.getBars().length, 2);

for (const bpm of [NaN, Infinity, -1, 0, 29.999, 300.001, "120", null]) {
  await init();
  assert.deepEqual(grid.applyFixedBpm(bpm), { ok: false, reason: "invalidBpm" });
  assert.deepEqual(grid.getBeats(), [0.25, 0.8, 1.5]);
  assert.equal(grid.canUndo(), false);
  assert.equal(changes, 0);
  grid.flushBeatGrid();
await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.length, 0);
}
for (const [beats, duration] of [[[-0.1, 1], 5], [[6], 5], [[0], 0], [[0], Infinity], [[NaN], 5], [[86399.9999996], 86400], [[1.0000006], 1.0000007]]) {
  await init(beats, duration);
  assert.deepEqual(grid.applyFixedBpm(120), { ok: false, reason: "unavailable" });
  assert.deepEqual(grid.getBeats(), beats);
  assert.equal(grid.canUndo(), false);
  assert.equal(changes, 0);
}
await init([], 3);
assert.deepEqual(grid.applyFixedBpm(120), { ok: true });
assert.deepEqual(grid.getBeats(), [0, 0.5, 1, 1.5, 2, 2.5, 3]);
assert.deepEqual(grid.getBars(), []);
grid.undoBeatGrid();
assert.deepEqual(grid.getBeats(), []);
grid.redoBeatGrid();
assert.equal(grid.getBeats().length, 7);
await init([], 4000);
assert.deepEqual(grid.applyFixedBpm(300), { ok: false, reason: "tooManyBeats" });
await init([0, 1], 4000);
assert.deepEqual(grid.applyFixedBpm(300), { ok: false, reason: "tooManyBeats" });
assert.deepEqual(grid.getBeats(), [0, 1]);
assert.equal(grid.canUndo(), false);
await init([0], 3999.8);
assert.deepEqual(grid.applyFixedBpm(300), { ok: true });
assert.equal(grid.getBeats().length, 20000);

for (const [first, duration] of [[86399.4999996, 86400], [0.0000006, 0.5000007]]) {
  await init([first], duration);
  assert.deepEqual(grid.applyFixedBpm(120), { ok: true });
  assert.deepEqual(grid.getBeats(), [first]);
  grid.flushBeatGrid();
await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.length, 0); // excluded candidate leaves a genuine no-op
}
await init([86398.9999996], 86400);
grid.applyFixedBpm(120);
grid.flushBeatGrid();
await new Promise(resolve => setTimeout(resolve, 0));
assert.deepEqual(JSON.parse(requests[0].body).beats, [86399, 86399.5]);

await init([0.0000006], 1.0000007);
grid.applyFixedBpm(120);
grid.flushBeatGrid();
await new Promise(resolve => setTimeout(resolve, 0));
assert.deepEqual(JSON.parse(requests[0].body).beats, [0.000001, 0.500001]);

// A no-op must preserve redo and must survive the server's six-place round trip.
for (const reload of [false, true]) {
  await init([0.25, 0.8], 4);
  grid.applyFixedBpm(123.456);
  grid.flushBeatGrid();
await new Promise(resolve => setTimeout(resolve, 0));
  if (reload) await init(serialized(grid.getBeats()), 4);
  grid.setBarLengthAt(0, 3);
  grid.undoBeatGrid();
  grid.flushBeatGrid();
await new Promise(resolve => setTimeout(resolve, 0));
  const before = grid.getBeats();
  const count = changes;
  requests.length = 0;
  assert.deepEqual(grid.applyFixedBpm(123.456), { ok: true });
  assert.deepEqual(grid.getBeats(), before);
  assert.equal(changes, count);
  assert.equal(grid.canRedo(), true);
  grid.flushBeatGrid();
await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.length, 0);
}
await init([0, 0.5, 1, 2, 2.5]);
assert.equal(grid.getBeatGridBpm(), 120); // median, not average
await init([0, 0.5, 1.5]);
assert.equal(grid.getBeatGridBpm(), 80); // even median
await init([0]);
assert.equal(grid.getBeatGridBpm(), null);
await init([]);
assert.equal(grid.getBeatGridBpm(), null);

// Real pointer handlers create anchors, which must be restored by undo.
const handlers = {};
const context = new Proxy({}, { get: () => () => {} });
const canvas = {
  style: {}, classList: { add() {}, toggle() {} },
  addEventListener: (name, fn) => { handlers[name] = fn; },
  removeEventListener() {}, getContext: () => context,
};
globalThis.window = { devicePixelRatio: 1 };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.document = {
  querySelector: () => ({ clientHeight: 100, getBoundingClientRect: () => ({ left: 0, width: 300 }) }),
  getElementById: () => canvas,
};
await init([0, 0.5, 1, 1.5, 2, 2.5, 3], 3);
grid.setBeatGridEditing(true);
grid.setBeatGridSnap(false);
grid.setBeatGridRipple(false);
const event = { button: 0, clientX: 100, pointerId: 1, stopPropagation() {}, preventDefault() {} };
handlers.pointerdown(event);
handlers.pointermove(event); // no displacement, but marks index 2 as an anchor
handlers.pointerup(event);
assert.deepEqual(grid.getAnchors(), [2]);
const anchored = grid.getBeats();
assert.deepEqual(grid.applyFixedBpm(120), { ok: true });
assert.deepEqual(grid.getAnchors(), []);
assert.deepEqual(grid.getBeats(), anchored);
grid.undoBeatGrid();
assert.deepEqual(grid.getAnchors(), [2]);
assert.deepEqual(grid.getBeats(), anchored);
grid.redoBeatGrid();
assert.deepEqual(grid.getAnchors(), []);
grid.undoBeatGrid();
grid.undoBeatGrid(); // exactly one operation for fixed BPM, one for the drag
assert.equal(grid.canUndo(), false);
assert.deepEqual(grid.getAnchors(), []);

// ─── Fixed mode translates the lattice from a gesture snapshot ───
const drag = (from, to, altKey = false) => {
  handlers.pointerdown({ ...event, clientX: from * 100, altKey });
  handlers.pointermove({ ...event, clientX: to * 100 });
  handlers.pointerup(event);
};
for (const ripple of [false, true]) {
  for (const alt of [false, true]) {
    await init([0, 0.5, 1, 1.5, 2, 2.5, 3], 3, [{ beat: 2, beats_per_bar: 3 }]);
    grid.setBeatGridEditing(true);
    grid.setBeatGridRipple(ripple);
    grid.setBeatGridSnap(false);
    grid.setBeatGridFixedBpm(true);
    drag(1, 1.1, alt);
    assert.deepEqual(serialized(grid.getBeats()), [0.1, 0.6, 1.1, 1.6, 2.1, 2.6]);
    assert.deepEqual(grid.getBars(), [{ beat: 2, beats_per_bar: 3 }]);
    assert.ok(Math.abs(grid.getBeatGridBpm() - 120) < 1e-9);
    grid.undoBeatGrid();
    assert.deepEqual(grid.getBeats(), [0, 0.5, 1, 1.5, 2, 2.5, 3]);
    assert.equal(grid.canUndo(), false);
    grid.redoBeatGrid();
    await grid.flushBeatGrid();
    assert.deepEqual(JSON.parse(requests.at(-1).body).beats, serialized(grid.getBeats()));
  }
}
await init([0.25, 0.75, 1.25, 1.75, 2.25, 2.75], 3, [{ beat: 0, beats_per_bar: 4 }, { beat: 3, beats_per_bar: 3 }]);
grid.setBeatGridEditing(true);
grid.setBeatGridFixedBpm(true);
handlers.pointerdown({ ...event, clientX: 125 });
handlers.pointermove({ ...event, clientX: 5 });
assert.deepEqual(serialized(grid.getBeats()), [0.05, 0.55, 1.05, 1.55, 2.05, 2.55]);
assert.deepEqual(grid.getBars(), [{ beat: 1, beats_per_bar: 3 }]);
handlers.pointermove({ ...event, clientX: 125 });
assert.deepEqual(serialized(grid.getBeats()), [0.25, 0.75, 1.25, 1.75, 2.25, 2.75]);
assert.equal(grid.getBars().length, 2, "returning within a gesture restores clipped marks");
handlers.pointerup(event);
await init([0.25, 0.8, 1.5], 3);
grid.setBeatGridEditing(true);
grid.setBeatGridFixedBpm(true);
assert.deepEqual(grid.getBeats(), [0.25, 0.8, 1.5], "activation preserves irregular grid");
drag(0.8, 0.9);
assert.ok(grid.getBeats().some(t => Math.abs(t - 0.9) < 1e-9), "irregular selected beat remains under pointer");
const interval = 0.625;
for (let i = 1; i < grid.getBeats().length; i++) assert.ok(Math.abs(grid.getBeats()[i] - grid.getBeats()[i - 1] - interval) < 1e-9);
grid.undoBeatGrid();
assert.deepEqual(grid.getBeats(), [0.25, 0.8, 1.5]);
await init([], 3);
grid.setBeatGridFixedBpm(true);
assert.deepEqual(grid.getBeats(), []);
grid.destroyBeatGrid();
assert.equal(grid.getBeatGridFixedBpm(), false);

// ─── Boundary gestures and opt-out preserve editor semantics ───
for (const [from, to] of [[0, 0.1], [3, 2.9], [1.5, 0], [1.5, 3]]) {
  await init([0, 0.5, 1, 1.5, 2, 2.5, 3], 3, [{ beat: 0, beats_per_bar: 4 }, { beat: 6, beats_per_bar: 3 }]);
  grid.setBeatGridEditing(true);
  grid.setBeatGridSnap(false);
  grid.setBeatGridFixedBpm(true);
  drag(from, to);
  assert.ok(grid.getBeats().some(t => Math.abs(t - to) < 1e-9));
  for (let i = 1; i < grid.getBeats().length; i++) assert.ok(Math.abs(grid.getBeats()[i] - grid.getBeats()[i - 1] - 0.5) < 1e-9);
  grid.undoBeatGrid();
  assert.deepEqual(grid.getBars(), [{ beat: 0, beats_per_bar: 4 }, { beat: 6, beats_per_bar: 3 }]);
}
await init([0, 0.5, 1, 1.5, 2, 2.5, 3], 3);
grid.destroyBeatGrid();
grid.initBeatGrid({ jobId: "snap", grid: { beats: [0, 0.5, 1, 1.5, 2, 2.5, 3], onsets: [1.12] }, duration: 3 });
grid.setBeatGridEditing(true);
grid.setBeatGridSnap(true);
grid.setBeatGridFixedBpm(true);
drag(1, 1.1);
assert.ok(grid.getBeats().some(t => Math.abs(t - 1.12) < 1e-9), "snap the selected beat while translating the whole grid");
grid.undoBeatGrid();
grid.setBeatGridFixedBpm(false);
grid.setBeatGridSnap(false);
grid.setBeatGridRipple(false);
drag(1, 1.1);
assert.deepEqual(serialized(grid.getBeats()), [0, 0.5, 1.1, 1.5, 2, 2.5, 3]);
grid.undoBeatGrid();
grid.setBeatGridRipple(true);
drag(1, 1.1);
assert.deepEqual(serialized(grid.getBeats()), [0, 0.55, 1.1, 1.575, 2.05, 2.525, 3]);
await init([1], 3);
grid.setBeatGridEditing(true);
grid.setBeatGridFixedBpm(true);
drag(1, 1.2);
assert.deepEqual(serialized(grid.getBeats()), [1.2]);
await init([], 3);
assert.equal(grid.getBeatGridFixedBpm(), false, "new session starts unlocked");
grid.setBeatGridFixedBpm(true);
grid.setBeatGridEditing(false);
grid.setBeatGridEditing(true);
assert.equal(grid.getBeatGridFixedBpm(), true, "closing editor preserves track toggle");

for (const { code } of LANGUAGES) {
  for (const key of ["fixedBpm", "fixedBpmDescription", "invalidBpm", "tooManyBeats", "unavailable"]) {
    assert.ok((TRANSLATIONS[code][`beatgrid.${key}`] ?? (code === "pt-PT" && TRANSLATIONS.pt[`beatgrid.${key}`]))?.length, `${code}: ${key}`);
  }
}
// ─── Clipped meter origin keeps the visible blue bar grid ───
await init([0, 0.5, 1, 1.5, 2, 2.5, 3], 3, [{ beat: 0, beats_per_bar: 4 }]);
grid.setBeatGridEditing(true);
grid.setBeatGridSnap(false);
grid.setBeatGridFixedBpm(true);
drag(1, 0.9);
assert.deepEqual(grid.getBars(), [{ beat: 3, beats_per_bar: 4 }]);
assert.equal(grid.isDownbeatIndex(3), true, "retain the blue line at the original meter phase");
assert.equal(grid.isDownbeatIndex(0), false);
grid.undoBeatGrid();
assert.deepEqual(grid.getBars(), [{ beat: 0, beats_per_bar: 4 }]);
grid.redoBeatGrid();
assert.deepEqual(grid.getBars(), [{ beat: 3, beats_per_bar: 4 }]);
await init([0, 0.5, 1, 1.5, 2, 2.5, 3], 3);
grid.setBeatGridEditing(true);
grid.setBeatGridFixedBpm(true);
drag(1, 0.9);
assert.deepEqual(grid.getBars(), [], "do not invent meter marks for a new manual grid");
grid.destroyBeatGrid();
console.log("beatgrid fixed BPM: passed");
