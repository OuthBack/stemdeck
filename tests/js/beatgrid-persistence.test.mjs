import assert from "node:assert/strict";
import * as grid from "../../static/js/beatgrid.js";

globalThis.document = { querySelector: () => null, getElementById: () => null };
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const requests = [];
let releaseDelete = deferred();
let saved = null;
globalThis.fetch = async (url, options = {}) => {
  requests.push(options.method || "GET");
  if (options.method === "DELETE") {
    await releaseDelete.promise;
    saved = null;
  }
  if (options.method === "PATCH") saved = JSON.parse(options.body);
  return { ok: true, json: async () => saved || { beats: [], bars: [] } };
};
grid.initBeatGrid({ jobId: "manual", grid: { beats: [] }, duration: 3 });
grid.applyFixedBpm(120);
await grid.flushBeatGrid();
const resetting = grid.resetBeatGrid();
await tick();
grid.applyFixedBpm(150);
const latest = grid.getBeats();
const saving = grid.flushBeatGrid();
await tick();
assert.deepEqual(requests, ["PATCH", "DELETE"], "new writes must wait for reset");
releaseDelete.resolve();
await resetting;
await saving;
assert.deepEqual(grid.getBeats(), latest, "stale reset must not discard subsequent edits");
assert.deepEqual(saved.beats, latest.map(t => +t.toFixed(6)));

// Reset cancels the debounce rather than writing the removed grid afterwards.
requests.length = 0;
releaseDelete = deferred();
releaseDelete.resolve();
grid.applyFixedBpm(130);
await grid.resetBeatGrid();
await grid.flushBeatGrid();
assert.deepEqual(requests, ["DELETE", "GET"]);
assert.deepEqual(grid.getBeats(), []);
assert.equal(saved, null);
grid.undoBeatGrid();
assert.ok(grid.getBeats().length);
grid.redoBeatGrid();
assert.deepEqual(grid.getBeats(), []);
await grid.flushBeatGrid();
grid.destroyBeatGrid();
await grid.flushBeatGrid();
grid.initBeatGrid({ jobId: "old", grid: { beats: [] }, duration: 3 });
grid.applyFixedBpm(120);
requests.length = 0;
releaseDelete = deferred();
const oldReset = grid.resetBeatGrid();
await tick();
grid.initBeatGrid({ jobId: "new", grid: { beats: [0.2, 0.7] }, duration: 3 });
releaseDelete.resolve();
await oldReset;
await grid.flushBeatGrid();
assert.deepEqual(requests, ["DELETE", "GET"], "switching during reset must not revive canceled edits");
assert.deepEqual(grid.getBeats(), [0.2, 0.7]);
grid.destroyBeatGrid();

for (const failAt of ["DELETE", "GET"]) {
  for (const teardown of [false, true]) {
    const calls = [];
    const gate = deferred();
    globalThis.fetch = async (url, options = {}) => {
      const method = options.method || "GET";
      calls.push({ url, method, body: options.body });
      if (method === "DELETE") await gate.promise;
      return { ok: method !== failAt, status: method === failAt ? 500 : 200,
        json: async () => ({ beats: [], bars: [] }) };
    };
    grid.initBeatGrid({ jobId: "recover", grid: { beats: [] }, duration: 3 });
    grid.applyFixedBpm(120);
    const expected = grid.getBeats();
    const reset = grid.resetBeatGrid();
    await tick();
    if (teardown) grid.initBeatGrid({ jobId: "replacement", grid: { beats: [0.2] }, duration: 3 });
    gate.resolve();
    await reset;
    await grid.flushBeatGrid();
    grid.destroyBeatGrid();
    await grid.flushBeatGrid();
    const writes = calls.filter(c => c.method === "PATCH");
    assert.equal(writes.length, 1, `${failAt}, teardown=${teardown}: canceled edit must be recovered exactly once`);
    assert.equal(writes[0].url, "/api/jobs/recover/beats");
    assert.deepEqual(JSON.parse(writes[0].body).beats, expected);
  }
}
// ─── Failed recovery remains retryable and queued saves deduplicate ───
let patchAttempts = 0;
let failPatch = true;
globalThis.fetch = async (_url, options = {}) => {
  const method = options.method || "GET";
  if (method === "PATCH") patchAttempts++;
  return { ok: method === "PATCH" && !failPatch, status: 500 };
};
grid.initBeatGrid({ jobId: "retry", grid: { beats: [] }, duration: 3 });
grid.applyFixedBpm(120);
grid.setBeatGridFixedBpm(true);
await grid.resetBeatGrid();
assert.equal(grid.getBeatGridFixedBpm(), true, "failed reset preserves fixed mode");
failPatch = false;
await grid.flushBeatGrid();
await grid.flushBeatGrid();
assert.equal(patchAttempts, 2, "failed recovery remains retryable without repeating successful PATCH");
patchAttempts = 0;
grid.applyFixedBpm(130);
const inFlight = grid.flushBeatGrid();
const failedReset = grid.resetBeatGrid();
await inFlight;
await failedReset;
await grid.flushBeatGrid();
assert.equal(patchAttempts, 1, "already queued PATCH is not duplicated on reset failure");
globalThis.fetch = async () => ({ ok: true, json: async () => ({ beats: [], bars: [] }) });
await grid.resetBeatGrid();
assert.equal(grid.getBeatGridFixedBpm(), false, "successful reset clears fixed mode");
grid.destroyBeatGrid();
// ─── Reset failure recovers unsuccessful queued writes after teardown ───
for (const firstPatchOk of [false, true]) {
  for (const failAt of ["DELETE", "GET"]) {
    const gate = deferred();
    const calls = [];
    let patches = 0;
    globalThis.fetch = async (url, options = {}) => {
      const method = options.method || "GET";
      calls.push({ url, method, body: options.body });
      if (method === "PATCH") {
        patches++;
        if (patches === 1) {
          await gate.promise;
          return { ok: firstPatchOk, status: firstPatchOk ? 200 : 500 };
        }
        return { ok: true };
      }
      return { ok: method !== failAt, status: method === failAt ? 500 : 200 };
    };
    grid.initBeatGrid({ jobId: "queued-original", grid: { beats: [] }, duration: 3 });
    grid.applyFixedBpm(120);
    const expected = grid.getBeats();
    const save = grid.flushBeatGrid();
    const reset = grid.resetBeatGrid();
    grid.initBeatGrid({ jobId: "replacement", grid: { beats: [0.2] }, duration: 3 });
    gate.resolve();
    await save;
    await reset;
    await grid.flushBeatGrid();
    assert.deepEqual(grid.getBeats(), [0.2]);
    assert.equal(patches, firstPatchOk && failAt === "DELETE" ? 1 : 2,
      `queued PATCH ${firstPatchOk}, reset fails ${failAt}: recover only unsaved or deleted snapshot`);
    for (const call of calls.filter(c => c.method === "PATCH")) {
      assert.equal(call.url, "/api/jobs/queued-original/beats");
      assert.deepEqual(JSON.parse(call.body).beats, expected);
    }
    grid.destroyBeatGrid();
  }
}
// ─── A failed recovery restores dirty after an earlier successful PATCH ───
const firstPatchGate = deferred();
let retryAttempts = 0;
globalThis.fetch = async (_url, options = {}) => {
  const method = options.method || "GET";
  if (method === "PATCH") {
    retryAttempts++;
    if (retryAttempts === 1) await firstPatchGate.promise;
    return { ok: retryAttempts !== 2, status: retryAttempts === 2 ? 500 : 200 };
  }
  return { ok: method === "DELETE", status: method === "DELETE" ? 200 : 500 };
};
grid.initBeatGrid({ jobId: "recovery-retry-current", grid: { beats: [] }, duration: 3 });
grid.applyFixedBpm(120);
const firstSave = grid.flushBeatGrid();
const failingReload = grid.resetBeatGrid();
firstPatchGate.resolve();
await firstSave;
await failingReload;
assert.equal(retryAttempts, 2);
await grid.flushBeatGrid();
await grid.flushBeatGrid();
assert.equal(retryAttempts, 3, "failed recovery after successful queued save must remain flushable");
grid.destroyBeatGrid();
console.log("beatgrid persistence: passed");
