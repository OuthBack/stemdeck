// The click track, count-in and grid editor in a real browser.
//
// These could not be tested at all until the fixture's beat grid moved to
// stems/beats.json, where the API actually looks. Written to the job root it
// 404'd, the studio said "No beat grid for this track", and every control here
// stayed disabled -- while the fixture looked, from a glance at seed.py, as
// though it covered them. The first test is the one that would have caught it.

import { test, expect } from "@playwright/test";
import { openStudio, waitForClickTrack, openClickOptions, SIBLING_JOB_ID } from "./helpers.mjs";

const metro = (page) => ({
  toggle: page.locator("#t-metro"),
  panel: page.locator("#t-metro-panel"),
  countIn: page.locator("#t-metro-countin"),
  accent: page.locator("#t-metro-bar"),
  grid: page.locator("#t-metro-edit"),
  half: page.locator("#t-metro-half"),
  double: page.locator("#t-metro-double"),
  note: page.locator("#t-metro-note"),
});

test.describe("click track", () => {
  test("the fixture's beat grid reaches the studio", async ({ page }) => {
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);

    // Disabled here means the grid never arrived -- the exact symptom of a
    // beats.json the API cannot find.
    await expect(ui.toggle).toBeEnabled();
    await expect(ui.panel).not.toHaveClass(/hidden/);
    await expect(ui.note).toContainText("120.0 BPM");

    // Bar marks present, so the detected-meter accent mode is live rather than
    // silently degrading to "none found".
    await expect(page.locator('#t-metro-bar option[value="-1"]')).toHaveText("Auto");
    await expect(page.locator('#t-metro-bar option[value="-1"]')).toBeEnabled();
  });

  test("the click toggles on and off", async ({ page }) => {
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);

    await ui.toggle.click();
    await expect(ui.toggle).toHaveClass(/active/);
    await expect(ui.toggle).toHaveAttribute("aria-pressed", "true");

    await ui.toggle.click();
    await expect(ui.toggle).not.toHaveClass(/active/);
    await expect(ui.toggle).toHaveAttribute("aria-pressed", "false");
  });

  test("the on/off button is the icon alone, and still says what it is", async ({ page }) => {
    // It used to carry the word ON, which never changed, so with the click off
    // it still read ON (#681). The highlight is the state now. The name moved
    // nowhere: it was always in aria-label and the tooltip, which is what a
    // screen reader and a hover use.
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);

    await expect(ui.toggle).toHaveText("");
    await expect(ui.toggle).toHaveAccessibleName("Click track");
    await expect(ui.toggle).toHaveAttribute("title", "Click track (K)");

    // Square, and the same size as the volume button beside it.
    const box = await ui.toggle.boundingBox();
    const vol = await page.locator("#t-metro-vol-btn").boundingBox();
    expect(Math.round(box.width)).toBe(Math.round(box.height));
    expect(Math.round(box.width)).toBe(Math.round(vol.width));
    expect(Math.round(box.height)).toBe(Math.round(vol.height));
  });

  test("the count-in length is chosen from the select and survives a reload", async ({ page }) => {
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    // #587 turned the count-in from an on/off button into a length select, so
    // "armed" is now a non-zero value rather than a pressed state. The tint
    // moved to the wrapper with it.
    await metro(page).countIn.selectOption("3");
    await expect(metro(page).countIn).toHaveValue("3");
    await expect(page.locator("#t-metro-countin").locator("xpath=..")).toHaveClass(/active/);

    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    // Restored from the store, not merely left in the DOM.
    await expect(metro(page).countIn).toHaveValue("3");

    await metro(page).countIn.selectOption("0");
    await expect(page.locator("#t-metro-countin").locator("xpath=..")).not.toHaveClass(/active/);
  });

  test("a custom meter can be typed and drives the accent note", async ({ page }) => {
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);
    const custom = page.locator("#t-metro-bar-custom");

    // Presets leave the free-entry box hidden. 5 carries a grouping, so the
    // note describes the 3+2 it is actually playing rather than a flat accent.
    await ui.accent.selectOption("5");
    await expect(custom).toBeHidden();
    await expect(ui.note).toContainText("counting 5 in 3+2");

    // "Custom..." reveals it, and a typed value is what actually applies.
    await ui.accent.selectOption("custom");
    await expect(custom).toBeVisible();
    await custom.fill("11");
    await custom.blur();
    await expect(ui.note).toContainText("accenting every 11 beats");

    // Out of range is clamped to what the backend accepts, never rejected.
    await custom.fill("99");
    await custom.blur();
    await expect(custom).toHaveValue("32");
    await expect(ui.note).toContainText("accenting every 32 beats");
  });

  test("an odd meter exposes its grouping, and a bad one is refused", async ({ page }) => {
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);
    const group = page.locator("#t-metro-group");

    // Simple meters have one sensible reading, so there is nothing to show.
    await ui.accent.selectOption("4");
    await expect(group).toBeHidden();

    // 7 is played 3+2+2, and the box says so before the user touches it (#595).
    await ui.accent.selectOption("7");
    await expect(group).toBeVisible();
    await expect(group).toHaveValue("3+2+2");
    // The standing "Groups" label went when the footer ran out of width. What
    // said the box is not a bare number has to still say it, so assert on what
    // replaced the label rather than dropping the check: the box's own
    // placeholder and title, and the note under the waveform.
    await expect(group).toHaveAttribute("placeholder", "3+2+2");
    await expect(group).toHaveAttribute("title", /grouping|divides/i);
    await expect(ui.note).toContainText("counting 7 in 3+2+2");
    await expect(ui.note).toContainText("stress on 1, 4, 6");

    // A grouping that fits the bar is taken.
    await group.fill("2+2+3");
    await group.blur();
    await expect(group).toHaveValue("2+2+3");
    await expect(ui.note).toContainText("stress on 1, 3, 5");

    // One that does not is refused rather than repaired -- and says so, because
    // a box that snaps back on its own reads as broken rather than as refused.
    await group.fill("3+3");
    await group.blur();
    await expect(group).toHaveValue("3+2+2");
    await expect(group).toHaveClass(/invalid/);
    await expect(ui.note).toContainText("add up to 7");

    // Clearing the box is a deliberate "use the default", not a mistake, so it
    // must not be scolded.
    await group.fill("");
    await group.blur();
    await expect(group).toHaveValue("3+2+2");
    await expect(group).not.toHaveClass(/invalid/);

    // Leaving the odd meter puts the control away again, and the note goes back
    // to describing a plain accent rather than a grouping that is not playing.
    await ui.accent.selectOption("4");
    await expect(group).toBeHidden();
    await expect(ui.note).toContainText("accenting every 4 beats");
  });

  test("the rate control reports the tempo it is actually clicking", async ({ page }) => {
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);

    await ui.double.click();
    await expect(ui.double).toHaveClass(/active/);
    await expect(ui.note).toContainText("240.0 BPM");

    await ui.half.click();
    await expect(ui.half).toHaveClass(/active/);
    await expect(ui.note).toContainText("60.0 BPM");
  });

  test("the accent choice is reflected in the note", async ({ page }) => {
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);

    await ui.accent.selectOption("3");
    await expect(ui.note).toContainText("accenting every 3 beats");

    await ui.accent.selectOption("-1");
    await expect(ui.note).toContainText("accenting 4/4 from the detected downbeat");
  });

  // #655: the grid editor was still open and lit after the click was switched
  // off. It is a click tool, so it follows the click. The count-in does not:
  // it plays with the click off, so it stays armed (count-in-replay.spec.mjs).
  test("the count-in stays armed when the click is switched off", async ({ page }) => {
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);
    const wrap = page.locator("#t-metro-countin").locator("xpath=..");

    await ui.countIn.selectOption("2");
    await ui.toggle.click();
    await ui.toggle.click();
    await expect(ui.toggle).toHaveAttribute("aria-pressed", "false");
    await expect(wrap).toHaveClass(/active/);
    await expect(ui.countIn).toHaveValue("2");
  });

  test("switching the click off closes the grid editor", async ({ page }) => {
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);
    const toolbar = page.locator("#beatgrid-toolbar");

    await ui.grid.click();
    await expect(toolbar).not.toHaveClass(/hidden/);

    await ui.toggle.click();
    await expect(ui.toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toolbar).toHaveClass(/hidden/);
    await expect(ui.grid).not.toHaveClass(/active/);
    await expect(ui.grid).toHaveAttribute("aria-pressed", "false");
  });

  test("the K shortcut closes it too", async ({ page }) => {
    // The shortcut and the button are two ways into the same toggle, and the
    // editor has to follow both.
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);
    const toolbar = page.locator("#beatgrid-toolbar");

    await ui.grid.click();
    await expect(toolbar).not.toHaveClass(/hidden/);

    await page.locator("body").press("k");
    await expect(ui.toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toolbar).toHaveClass(/hidden/);
  });

  test("opening the grid editor with the click off switches the click on", async ({ page }) => {
    // The editor edits the beats the click plays, and the way to check an edit
    // is to hear it. Opening it while the click is off would light Grid inside
    // the panel of a feature that is off, so it asks for the click as well.
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);
    await expect(ui.toggle).toHaveAttribute("aria-pressed", "false");

    await ui.grid.click();

    await expect(page.locator("#beatgrid-toolbar")).not.toHaveClass(/hidden/);
    await expect(ui.toggle).toHaveAttribute("aria-pressed", "true");
    await expect(ui.grid).toHaveClass(/active/);
  });

  test("closing the grid editor leaves the click as it was", async ({ page }) => {
    // Only the click can close the editor, not the other way round: Done is
    // "finished editing", not "stop the click".
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);

    await ui.grid.click();
    await page.locator("#bg-done").click();

    await expect(ui.grid).not.toHaveClass(/active/);
    await expect(ui.toggle).toHaveAttribute("aria-pressed", "true");
  });

  test("Grid opens and closes the beat-grid editor", async ({ page }) => {
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    const ui = metro(page);
    const toolbar = page.locator("#beatgrid-toolbar");

    await ui.grid.click();
    await expect(toolbar).not.toHaveClass(/hidden/);
    await expect(ui.grid).toHaveClass(/active/);

    // Same button closes it; the editor's own Done must agree.
    await ui.grid.click();
    await expect(toolbar).toHaveClass(/hidden/);
    await expect(ui.grid).not.toHaveClass(/active/);

    await ui.grid.click();
    await page.locator("#bg-done").click();
    await expect(toolbar).toHaveClass(/hidden/);
    await expect(ui.grid).not.toHaveClass(/active/);
  });
});

// ─── Fixed tempo editing and translation ───────────────────
test.describe("fixed BPM", () => {
  const field = page => page.locator("#bg-fixed-bpm");
  const beats = page => page.evaluate(async () => (await import("/js/beatgrid.js")).getBeats());
  test.beforeEach(async ({ page, request }, testInfo) => {
    await request.delete("/api/jobs/e2e0deadbeef/beats");
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    await metro(page).grid.click();
    if (!testInfo.title.startsWith("the fixed BPM toggle")) await page.locator("#bg-fixed-bpm-toggle").check();
  });

  test("the fixed BPM toggle enables the field and preserves edits when disabled", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: "Fixed BPM", exact: true });
    await expect(toggle).not.toBeChecked();
    await expect(field(page)).toBeDisabled();
    const original = await beats(page);
    await toggle.check();
    await expect(field(page)).toBeEnabled();
    expect(await beats(page)).toEqual(original);
    await field(page).fill("105");
    await field(page).press("Enter");
    const edited = await beats(page);
    await toggle.uncheck();
    await expect(field(page)).toBeDisabled();
    expect(await beats(page)).toEqual(edited);
    await toggle.check();
    await expect(field(page)).toHaveValue("105");
    expect(await beats(page)).toEqual(edited);
    await page.locator(`.cat-item[data-id="${SIBLING_JOB_ID}"]`).first().click();
    await waitForClickTrack(page);
    await metro(page).grid.click();
    await expect(toggle).not.toBeChecked();
    await expect(field(page)).toBeDisabled();
  });

  for (const enabled of [false, true]) {
    test(`Space plays and pauses without changing fixed BPM ${enabled ? "on" : "off"}`, async ({ page }) => {
      const toggle = page.locator("#bg-fixed-bpm-toggle");
      await toggle.setChecked(enabled);
      const gridState = () => page.evaluate(async () => {
        const grid = await import("/js/beatgrid.js");
        return { fixed: grid.getBeatGridFixedBpm(), beats: grid.getBeats(), bars: grid.getBars() };
      });
      const playing = () => page.evaluate(async () => (await import("/js/transport.js")).transport().isPlaying());
      const original = await gridState();
      await expect.poll(playing).toBe(false);
      for (const nextPlaying of [true, false]) {
        await toggle.press("Space");
        await expect(toggle).toBeChecked({ checked: enabled });
        expect(await gridState()).toEqual(original);
        await expect.poll(playing).toBe(nextPlaying);
        await expect(toggle).toBeFocused();
      }
      await toggle.click();
      await expect(toggle).toBeChecked({ checked: !enabled });
      expect((await gridState()).fixed).toBe(!enabled);
      if (enabled) await expect(field(page)).toBeDisabled();
      else await expect(field(page)).toBeEnabled();
    });
  }

  test("moving a fixed grid left preserves the original blue bar lines", async ({ page }) => {
    const bluePixels = () => page.locator("#beatgrid-canvas").evaluate(canvas => {
      const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 120 && pixels[i + 1] > 100 && pixels[i + 2] > 200 && pixels[i + 3] > 120) count++;
      }
      return count;
    });
    await field(page).fill("120");
    await field(page).press("Enter");
    await page.locator("#bg-snap").uncheck();
    expect(await bluePixels()).toBeGreaterThan(0);
    const original = await beats(page);
    const duration = await page.evaluate(async () => (await import("/js/state.js")).audioEngine.getDuration());
    const bounds = await page.locator("#beatgrid-canvas").boundingBox();
    const index = original.findIndex(t => t > duration * 0.3);
    const x = bounds.x + original[index] / duration * bounds.width;
    await page.mouse.move(x, bounds.y + 20);
    await page.mouse.down();
    await page.mouse.move(x - 5, bounds.y + 20, { steps: 3 });
    await page.mouse.up();
    expect(await bluePixels()).toBeGreaterThan(0);
    await page.locator("#bg-undo").click();
    expect(await beats(page)).toEqual(original);
    expect(await bluePixels()).toBeGreaterThan(0);
  });

  test("fixed mode drags every beat together despite Ripple and Alt", async ({ page }) => {
    await expect(page.locator("#bg-hint")).toHaveText("Drag any beat to move the whole grid while preserving the BPM.");
    await field(page).fill("120");
    await field(page).press("Enter");
    await page.locator("#bg-snap").uncheck();
    const original = await beats(page);
    const duration = await page.evaluate(async () => (await import("/js/state.js")).audioEngine.getDuration());
    const canvas = page.locator("#beatgrid-canvas");
    const bounds = await canvas.boundingBox();
    const selected = original.findIndex(t => t > duration * 0.3);
    const from = bounds.x + original[selected] / duration * bounds.width;
    const shiftPx = 5;
    for (const ripple of [false, true]) {
      await page.locator("#bg-ripple").setChecked(ripple);
      await page.keyboard.down("Alt");
      await page.mouse.move(from, bounds.y + 20);
      await page.mouse.down();
      await page.mouse.move(from + shiftPx, bounds.y + 20, { steps: 3 });
      await page.mouse.up();
      await page.keyboard.up("Alt");
      const moved = await beats(page);
      const target = original[selected] + shiftPx / bounds.width * duration;
      expect(moved.some(t => Math.abs(t - target) < 1e-6)).toBe(true);
      for (let i = 1; i < moved.length; i++) expect(moved[i] - moved[i - 1]).toBeCloseTo(0.5, 6);
      await expect(field(page)).toHaveValue("120");
      await page.locator("#bg-undo").click();
      expect(await beats(page)).toEqual(original);
    }
    await page.locator("#bg-done").click();
    await openClickOptions(page);
    await metro(page).grid.click();
    await expect(page.locator("#bg-fixed-bpm-toggle")).toBeChecked();
    await page.locator("#bg-reset").click();
    await expect(page.locator("#bg-fixed-bpm-toggle")).not.toBeChecked();
    await expect(field(page)).toBeDisabled();
  });

  test("Enter applies once, updates the click, persists, and supports history and manual edits", async ({ page }) => {
    const bpm = field(page);
    await expect(bpm).toHaveAccessibleName("Fixed BPM");
    await expect(bpm).toHaveValue("120");
    const original = await beats(page);
    await bpm.fill("100");
    expect(await beats(page)).toEqual(original);
    await bpm.press("Enter");
    await expect(bpm).toHaveValue("100");
    await expect(bpm).toBeFocused();
    const fixed = await beats(page);
    expect(fixed[0]).toBe(original[0]);
    expect(fixed[1] - fixed[0]).toBeCloseTo(0.6, 9);
    // Real metronome scheduling consumes the replacement immediately.
    const clickBeats = await page.evaluate(async () => {
      const { metronome } = await import("/js/state.js");
      return { count: metronome.getBeatCount(), bpm: metronome.getEffectiveBpm() };
    });
    expect(clickBeats.count).toBe(fixed.length);
    expect(clickBeats.bpm).toBeCloseTo(100, 6);
    await bpm.press("Tab");
    await page.locator("#bg-undo").click();
    expect(await beats(page)).toEqual(original);
    await expect(page.locator("#bg-undo")).toBeDisabled();
    await expect(bpm).toHaveValue("120");
    await page.locator("#bg-redo").click();
    await expect(bpm).toHaveValue("100");
    const patch = page.waitForResponse(r => r.url().endsWith("/beats") && r.request().method() === "PATCH");
    await page.locator("#bg-done").click();
    await patch;
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    await metro(page).grid.click();
    await expect(bpm).toHaveValue("100");
    expect(await beats(page)).toEqual(fixed.map(t => +t.toFixed(6)));
    await page.locator("#bg-snap").uncheck();
    await page.locator("#bg-tool-insert").click();
    await page.locator("#beatgrid-canvas").click({ position: { x: 30, y: 20 } });
    expect((await beats(page)).length).toBe(fixed.length + 1);
    await page.locator("#bg-reset").click();
    await expect(bpm).toHaveValue("120");
    expect(await beats(page)).toEqual(original);
  });

  test("blur applies edited text and invalid values leave the grid intact", async ({ page }) => {
    const bpm = field(page);
    const original = await beats(page);
    await bpm.fill("20");
    await bpm.press("Tab");
    await expect(bpm).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#bg-fixed-bpm-error")).toContainText("30");
    expect(await beats(page)).toEqual(original);
    await bpm.fill("150");
    await bpm.press("Tab");
    await expect(bpm).toHaveValue("150");
    await expect(bpm).not.toHaveAttribute("aria-invalid", "true");
    expect((await beats(page))[1] - original[0]).toBeCloseTo(0.4, 9);
  });

  test("sync follows changes while focused and preserves only user-pending text", async ({ page }) => {
    const bpm = field(page);
    await bpm.focus();
    await page.evaluate(async () => (await import("/js/beatgrid.js")).applyFixedBpm(90));
    await expect(bpm).toHaveValue("90");
    const latest = await beats(page);
    await bpm.press("Tab");
    expect(await beats(page)).toEqual(latest);
    await bpm.fill("140");
    await page.evaluate(async () => (await import("/js/beatgrid.js")).applyFixedBpm(110));
    await expect(bpm).toHaveValue("140");
    await bpm.press("Enter");
    await expect(bpm).toHaveValue("140");
    await expect(bpm).toBeFocused();
    expect((await beats(page))[1] - latest[0]).toBeCloseTo(60 / 140, 9);
  });

  test("display rounding never redistributes on focus and blur, and a single beat shows empty", async ({ page }) => {
    const bpm = field(page);
    await page.evaluate(async () => (await import("/js/beatgrid.js")).applyFixedBpm(123.456789));
    await expect(bpm).toHaveValue("123.457");
    const original = await beats(page);
    await bpm.focus();
    await bpm.press("Tab");
    expect(await beats(page)).toEqual(original);
    // Use the real lifecycle for grids with fewer intervals and estimates outside input limits.
    await page.evaluate(async () => {
      const grid = await import("/js/beatgrid.js");
      const ui = await import("/js/beatgridUi.js");
      grid.initBeatGrid({ jobId: "e2e0deadbeef", grid: { beats: [0, 0.1] }, duration: 1 });
      ui.syncBeatGridButtons();
    });
    await expect(bpm).toHaveValue("600");
    await page.evaluate(async () => {
      const grid = await import("/js/beatgrid.js");
      grid.initBeatGrid({ jobId: "e2e0deadbeef", grid: { beats: [0] }, duration: 1 });
      (await import("/js/beatgridUi.js")).syncBeatGridButtons();
    });
    await expect(bpm).toHaveValue("");
  });

  test("track teardown clears pending text and validation errors", async ({ page }) => {
    const bpm = field(page);
    await bpm.fill("20");
    await bpm.press("Enter");
    await expect(bpm).toHaveAttribute("aria-invalid", "true");
    await bpm.fill("140");
    await page.locator(`.cat-item[data-id="${SIBLING_JOB_ID}"]`).first().click();
    await waitForClickTrack(page);
    await metro(page).grid.click();
    await expect(bpm).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#bg-fixed-bpm-error")).toHaveText("");
    await expect(bpm).toHaveValue("120");
  });

  test("keyboard entry fits desktop and narrow toolbars", async ({ page }) => {
    await page.locator("#bg-barlen").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#bg-fixed-bpm-toggle")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(field(page)).toBeFocused();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const toolbar = page.locator("#beatgrid-toolbar");
      if (width < 600) {
        // The desktop shell reserves a fixed 300px stem gutter. Exercise the
        // toolbar itself at phone width without redesigning that shell.
        await toolbar.evaluate(el => {
          document.body.append(el);
          Object.assign(el.style, { position: "fixed", inset: "0 0 auto", margin: "0" });
        });
      }
      expect(await toolbar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expect(field(page)).toBeVisible();
      await toolbar.screenshot({ path: `/tmp/stemdeck-fixed-bpm-${width}.png` });
    }
  });
});

test.describe("manual grid", () => {
  async function manualTrack(page) {
    let saved = null;
    await page.route("**/api/jobs/e2e0deadbeef/beats", async route => {
      const method = route.request().method();
      if (method === "PATCH") {
        saved = route.request().postDataJSON();
        return route.fulfill({ json: { edited: true } });
      }
      if (method === "DELETE") {
        saved = null;
        return route.fulfill({ json: { edited: false } });
      }
      return saved?.beats.length
        ? route.fulfill({ json: { ...saved, edited: true } })
        : route.fulfill({ status: 404, json: { detail: "beat grid not found" } });
    });
    await openStudio(page, { tauri: true });
    await expect(metro(page).grid).toBeEnabled();
    await openClickOptions(page);
    await metro(page).grid.click();
    await page.locator("#bg-fixed-bpm-toggle").check();
  }

  test("create, undo, redo, persist and restore an empty grid", async ({ page }) => {
    await manualTrack(page);
    await expect(metro(page).toggle).toBeDisabled();
    await expect(metro(page).countIn).toBeDisabled();
    await expect(page.locator("#t-export-click")).toBeDisabled();
    await expect(page.locator("#bg-hint")).toHaveText("Enter a BPM to create the grid");
    await page.locator("#bg-fixed-bpm").fill("123.5");
    await page.locator("#bg-fixed-bpm").press("Enter");
    await expect(metro(page).toggle).toHaveAttribute("aria-pressed", "true");
    await expect(metro(page).countIn).toBeEnabled();
    await expect(page.locator("#t-export-click")).toBeEnabled();
    expect(await page.evaluate(async () => (await import("/js/state.js")).metronome.getEffectiveBpm())).toBeCloseTo(123.5, 3);
    await page.locator("#bg-undo").click();
    await expect(metro(page).toggle).toBeDisabled();
    await expect(page.locator("#bg-fixed-bpm")).toBeVisible();
    const patch = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().endsWith("/beats"));
    await page.locator("#bg-redo").click();
    await expect(metro(page).toggle).toBeEnabled();
    await patch;
    await openStudio(page, { tauri: true });
    await waitForClickTrack(page);
    await metro(page).grid.click();
    await expect(page.locator("#bg-fixed-bpm")).toHaveValue("123.5");
    await page.locator("#bg-reset").click();
    await expect(metro(page).toggle).toBeDisabled();
    await expect(metro(page).grid).toBeEnabled();
    await expect(page.locator("#bg-fixed-bpm")).toBeVisible();
  });

  for (const failure of ["server", "invalid response", "timeout"]) {
    test(`${failure} never opens an empty editor`, async ({ page }) => {
      await page.route("**/api/jobs/*/beats", async route => {
        if (failure === "timeout") {
          await new Promise(resolve => setTimeout(resolve, 5500));
          return route.abort();
        }
        return route.fulfill({ status: failure === "server" ? 500 : 200, json: {} });
      });
      await openStudio(page, { tauri: true });
      await expect(metro(page).note).toContainText("Failed to load beat grid");
      await expect(metro(page).grid).toBeDisabled();
    });
  }

  test("a late empty grid cannot replace the next track's grid", async ({ page }) => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route("**/api/jobs/e2e0deadbeef/beats", async route => {
      await pending;
      await route.fulfill({ status: 404, json: {} });
    });
    await openStudio(page, { tauri: true });
    await page.locator(`.cat-item[data-id="${SIBLING_JOB_ID}"]`).first().click();
    await waitForClickTrack(page);
    release();
    await expect.poll(async () => page.evaluate(async () => {
      const state = await import("/js/state.js");
      return [state.currentJobId, state.metronome?.getEffectiveBpm()];
    })).toEqual([SIBLING_JOB_ID, 120]);
    await expect(metro(page).toggle).toBeEnabled();
  });

  test("save failure is visible in the editor", async ({ page }) => {
    await manualTrack(page);
    await page.route("**/api/jobs/e2e0deadbeef/beats", route => route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, json: {} }) : route.fallback());
    await page.locator("#bg-fixed-bpm").fill("120");
    await page.locator("#bg-fixed-bpm").press("Enter");
    await expect(page.locator("#bg-save-error")).toContainText("Failed to save");
  });
});
