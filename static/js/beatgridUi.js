// Toolbar wiring for the beat grid editor.
//
// Kept separate from beatgrid.js so that module stays pure grid logic and
// canvas rendering, with no knowledge of which buttons happen to drive it.

import {
  bgToolbar, bgUndoBtn, bgRedoBtn, bgResetBtn, bgDoneBtn,
  bgRippleEl, bgSnapEl, bgBarLenEl, bgHintEl, metronome, metroEditBtn,
  bgFixedBpmEl, bgFixedBpmToggleEl, bgFixedBpmErrorEl,
} from "./state.js";
import {
  setBeatGridEditing, isBeatGridEditing, setBeatGridTool, getBeatGridTool,
  setBeatGridRipple, getBeatGridRipple, setBeatGridSnap, getBeatGridSnap,
  undoBeatGrid, redoBeatGrid, resetBeatGrid, canUndo, canRedo,
  barLengthAt, setBarLengthAt, getBeats,
  getBeatGridBpm, applyFixedBpm, setBeatGridFixedBpm, getBeatGridFixedBpm,
} from "./beatgrid.js";
import { t } from "./i18n.js";
import { applyMetronomeAccent, toggleMetronome, onMetronomeToggle } from "./transport.js";

const TOOL_BTNS = [
  ["bg-tool-move", "move", "Drag a beat to retime the region. Alt-drag moves one beat."],
  ["bg-tool-insert", "insert", "Click anywhere on the waveform to add a beat."],
  ["bg-tool-delete", "delete", "Click a beat to remove it. Right-click works in any tool."],
  ["bg-tool-bar", "bar", "Click a beat to mark it as a downbeat, or unmark it."],
];

let _available = false;
let _bpmPending = false;

function _syncFixedBpm() {
  if (!bgFixedBpmEl || _bpmPending) return;
  const bpm = getBeatGridBpm();
  bgFixedBpmEl.value = bpm === null ? "" : String(+bpm.toFixed(3));
}

function _clearBpmError() {
  bgFixedBpmEl?.removeAttribute("aria-invalid");
  if (bgFixedBpmErrorEl) bgFixedBpmErrorEl.textContent = "";
}

function _applyFixedBpm() {
  if (!bgFixedBpmToggleEl?.checked) return;
  if (!_bpmPending) { _syncFixedBpm(); return; }
  const result = applyFixedBpm(bgFixedBpmEl.valueAsNumber);
  if (!result.ok) {
    bgFixedBpmEl.setAttribute("aria-invalid", "true");
    if (bgFixedBpmErrorEl) bgFixedBpmErrorEl.textContent = t(`beatgrid.${result.reason}`);
    return;
  }
  _bpmPending = false;
  _clearBpmError();
  _syncFixedBpm();
  if (bgHintEl && !getBeats().length) bgHintEl.textContent = t("beatgrid.empty");
}

function _syncTools() {
  const active = getBeatGridTool();
  for (const [id, tool, hint] of TOOL_BTNS) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    const on = tool === active;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
    if (on && bgHintEl) bgHintEl.textContent = !getBeats().length ? t("beatgrid.empty")
      : tool === "move" && getBeatGridFixedBpm() ? t("beatgrid.fixedDragHint") : hint;
  }
}

export function syncBeatGridButtons() {
  if (bgUndoBtn) bgUndoBtn.disabled = !canUndo();
  if (bgRedoBtn) bgRedoBtn.disabled = !canRedo();
  if (bgFixedBpmToggleEl) bgFixedBpmToggleEl.checked = getBeatGridFixedBpm();
  if (bgFixedBpmEl) bgFixedBpmEl.disabled = !_available || !getBeatGridFixedBpm();
  _syncFixedBpm();
  _syncTools();
}

/** Reflect the bar length in force at the current grid position. */
function _syncBarLen() {
  if (bgBarLenEl) bgBarLenEl.value = String(barLengthAt(0));
}

export function showBeatGridSaveError(failed) {
  const el = document.getElementById("bg-save-error");
  if (el) el.textContent = failed ? t("beatgrid.saveFailed") : "";
}

export function setBeatGridAvailable(on) {
  _available = !!on;
  if (!_available) {
    setBeatGridFixedBpm(false);
    _bpmPending = false;
    if (bgFixedBpmToggleEl) bgFixedBpmToggleEl.checked = false;
    _clearBpmError();
    if (bgFixedBpmEl) bgFixedBpmEl.value = "";
  }
  if (bgFixedBpmToggleEl) bgFixedBpmToggleEl.disabled = !_available;
  if (bgFixedBpmEl) bgFixedBpmEl.disabled = !_available || !bgFixedBpmToggleEl?.checked;
  if (metroEditBtn) metroEditBtn.disabled = !_available;
  if (!_available && isBeatGridEditing()) toggleBeatGridEditor(false);
}

export function toggleBeatGridEditor(force) {
  if (!bgToolbar) return;
  const next = force === undefined ? !isBeatGridEditing() : !!force;
  if (next && !_available) return;
  // The editor is a click-track tool: it edits the beats the click plays, and
  // the way to check an edit is to hear it. So opening it switches the click
  // on, the same way choosing a vocal mode switches vocals on, and switching
  // the click off closes it (see wireBeatGridUi). Otherwise Grid could stay
  // lit inside the panel of a feature that is off (#655).
  if (next) toggleMetronome(true);
  setBeatGridEditing(next);
  bgToolbar.classList.toggle("hidden", !next);
  // The Grid button is a press-to-open toggle like the click and count-in
  // buttons beside it, so its lit state is synced here -- the one place every
  // open and close runs through, including Done, Escape and losing the grid.
  if (metroEditBtn) {
    metroEditBtn.classList.toggle("active", next);
    metroEditBtn.setAttribute("aria-pressed", next ? "true" : "false");
  }
  if (next) {
    _syncTools();
    _syncBarLen();
    syncBeatGridButtons();
  }
}

export const isBeatGridEditorOpen = () => isBeatGridEditing();

export function wireBeatGridUi() {
  if (!bgToolbar) return;

  bgFixedBpmToggleEl?.addEventListener("change", () => {
    setBeatGridFixedBpm(bgFixedBpmToggleEl.checked);
    _syncTools();
    if (bgFixedBpmEl) bgFixedBpmEl.disabled = !bgFixedBpmToggleEl.checked;
    _bpmPending = false;
    _clearBpmError();
    _syncFixedBpm();
  });
  bgFixedBpmEl?.addEventListener("input", () => { _bpmPending = true; });
  bgFixedBpmEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      _applyFixedBpm();
    }
  });
  bgFixedBpmEl?.addEventListener("blur", _applyFixedBpm);

  for (const [id, tool] of TOOL_BTNS) {
    document.getElementById(id)?.addEventListener("click", () => {
      setBeatGridTool(tool);
      _syncTools();
    });
  }

  if (bgRippleEl) {
    bgRippleEl.checked = getBeatGridRipple();
    bgRippleEl.addEventListener("change", () => setBeatGridRipple(bgRippleEl.checked));
  }
  if (bgSnapEl) {
    bgSnapEl.checked = getBeatGridSnap();
    bgSnapEl.addEventListener("change", () => setBeatGridSnap(bgSnapEl.checked));
  }
  bgBarLenEl?.addEventListener("change", () => {
    const n = parseInt(bgBarLenEl.value, 10);
    if (Number.isFinite(n)) {
      setBarLengthAt(0, n);
      bgBarLenEl.value = String(barLengthAt(0));
    }
  });

  metroEditBtn?.addEventListener("click", () => toggleBeatGridEditor());
  onMetronomeToggle((on) => {
    if (!on && isBeatGridEditing()) toggleBeatGridEditor(false);
  });

  bgUndoBtn?.addEventListener("click", () => { undoBeatGrid(); syncBeatGridButtons(); });
  bgRedoBtn?.addEventListener("click", () => { redoBeatGrid(); syncBeatGridButtons(); });
  bgDoneBtn?.addEventListener("click", () => toggleBeatGridEditor(false));

  bgResetBtn?.addEventListener("click", async () => {
    const grid = await resetBeatGrid();
    if (grid) {
      // Push the restored grid straight into the click so the change is
      // audible immediately rather than on the next track load.
      metronome?.setBeats?.(getBeats());
      applyMetronomeAccent();
    }
    _syncBarLen();
    syncBeatGridButtons();
  });

  // Undo/redo while the editor is open. Scoped to the editor so it cannot
  // shadow anything else the app binds these to.
  document.addEventListener("keydown", (e) => {
    if (!isBeatGridEditing()) return;
    if (e.target instanceof HTMLInputElement) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.code === "KeyZ") {
      e.preventDefault();
      if (e.shiftKey) redoBeatGrid();
      else undoBeatGrid();
      syncBeatGridButtons();
    } else if (e.code === "Escape") {
      e.preventDefault();
      toggleBeatGridEditor(false);
    }
  });
}
