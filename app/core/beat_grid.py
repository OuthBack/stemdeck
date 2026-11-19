"""Shared persisted beat-grid validation and reading for the API and export."""

from __future__ import annotations

import json
import math
from pathlib import Path

from pydantic import BaseModel, Field, field_validator

# Upper bound on an edited grid. A 20-minute track at 300 BPM is ~6000 beats;
# 20000 leaves generous headroom while refusing a payload crafted to exhaust
# memory or disk.
_MAX_EDITED_BEATS = 20000
_MAX_BARS = 2000
_MAX_BEAT_TIME_SECONDS = 86400


class BarMark(BaseModel):
    """A downbeat and the bar length that runs from it until the next mark."""

    beat: int = Field(ge=0, lt=_MAX_EDITED_BEATS)
    beats_per_bar: int = Field(ge=1, le=32)


class BeatsBody(BaseModel):
    beats: list[float] = Field(max_length=_MAX_EDITED_BEATS)
    bars: list[BarMark] = Field(default_factory=list, max_length=_MAX_BARS)

    @field_validator("beats")
    @classmethod
    def _check_beats(cls, v: list[float]) -> list[float]:
        # The client scheduler binary-searches this array and assumes it is
        # sorted and strictly increasing; enforce that at the boundary rather
        # than trusting the editor to have maintained it.
        out: list[float] = []
        for t in v:
            if not math.isfinite(t) or not (0 <= t < _MAX_BEAT_TIME_SECONDS):
                raise ValueError("beat time out of range")
            r = round(float(t), 6)
            if out and r <= out[-1]:
                raise ValueError("beat times must be strictly increasing")
            out.append(r)
        return out


def read_beat_grid(stems: Path) -> dict | None:
    """Prefer valid nonempty edits, retaining automatic analysis metadata.

    Missing files mean no grid. Unreadable data without a usable automatic fallback is an error, so the
    editor cannot mistake a failed load for permission to overwrite edits.
    """
    computed = stems / "beats.json"
    grid = None
    if computed.is_file():
        grid = json.loads(computed.read_text(encoding="utf-8"))
        if not isinstance(grid, dict) or not isinstance(grid.get("beats"), list):
            raise ValueError("invalid computed grid")
        BeatsBody(beats=grid["beats"], bars=grid.get("bars") or [])
    user = stems / "beats.user.json"
    if user.is_file():
        try:
            edits = BeatsBody.model_validate_json(user.read_text(encoding="utf-8"))
            if edits.beats:
                grid = dict(grid or {})
                grid.update(
                    beats=edits.beats, bars=[b.model_dump() for b in edits.bars], edited=True
                )
        except (OSError, ValueError):
            if grid is None:
                raise
    if grid is not None:
        grid.setdefault("bars", [])
        grid.setdefault("edited", False)
    return grid
