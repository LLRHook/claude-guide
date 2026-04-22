#!/usr/bin/env python3
"""
generate-subtitles.py — Generate SRT subtitle files and PNG caption frame overlays
from clips.json for the claude-guide demo pipeline.

Outputs:
  subtitles/claude-guide-demo.srt         (16:9 layout)
  subtitles/frames/*.png                  (one PNG per cue, layout-specific)

Timeline math mirrors stitch.sh:
  Each clip pair is: [transition_card_s hold] then [clip hold_s]
  Boundaries are joined with xfade (transition_s overlap).
  Cumulative time = sum(seg_dur) - (n_xfades * transition_s)
"""

import json
import math
import os
import struct
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ─── Paths ───────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent.resolve()
MANIFEST = SCRIPT_DIR / "clips.json"
SUBTITLES_DIR = SCRIPT_DIR / "subtitles"
FRAMES_DIR = SUBTITLES_DIR / "frames"

SUBTITLES_DIR.mkdir(exist_ok=True)
FRAMES_DIR.mkdir(exist_ok=True)

# ─── Load manifest ────────────────────────────────────────────────────────────

with open(MANIFEST) as f:
    manifest = json.load(f)

fmt = manifest["format"]
palette = manifest["palette"]
clips = manifest["clips"]

FPS = fmt["fps"]
CRF = fmt["crf"]
TRANSITION_MS = fmt.get("transition_ms", 550)
TRANSITION_S = TRANSITION_MS / 1000.0
TRANSITION_CARD_S = fmt.get("transition_card_s", 1.6)
TITLE_HOLD_S = fmt.get("title_hold_s", 0.0)
END_HOLD_S = fmt.get("end_hold_s", 2.2)

# Palette
BG_COLOR = palette["surface"]      # #1a1614
BORDER_COLOR = palette["accent"]   # #d77757
TEXT_COLOR = palette["text"]       # #f5ede3
DIM_COLOR = palette["dim"]         # #7a6e68

# ─── Layout configs ───────────────────────────────────────────────────────────

LAYOUTS = {
    "wide": {"cw": 1920, "ch": 1080, "bar_h": 120},
}

# SRT output file stems
LAYOUT_SRT_STEMS = {
    "wide":   "claude-guide-demo",
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def hex_to_rgb(h, alpha=255):
    h = h.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (r, g, b, alpha)

def fmt_srt_time(secs):
    """Convert float seconds to SRT timestamp HH:MM:SS,mmm"""
    secs = max(0.0, secs)
    total_ms = int(math.floor(secs * 1000 + 0.5))
    ms = total_ms % 1000
    total_s = total_ms // 1000
    h = total_s // 3600
    m = (total_s % 3600) // 60
    s = total_s % 60
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def find_font(size):
    """Try JetBrains Mono, fall back to system mono fonts."""
    candidates = [
        "/Users/victorivanov/Library/Fonts/JetBrainsMono-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Courier New.ttf",
        "/System/Library/Fonts/Monaco.ttf",
        "/System/Library/Fonts/Menlo.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()

# ─── Build timeline ───────────────────────────────────────────────────────────

# Mirror stitch.sh segment ordering:
# For each clip i: seg (2i+1) = transition_card, seg (2i+2) = clip content
# Segments are stitched with xfade (overlapping by TRANSITION_S at boundaries)
# cumulative tracks start time of the CURRENT output frame

# Collect all segments with their raw duration
segments = []  # list of (duration_s, cue_type, clip_index)

if TITLE_HOLD_S > 0.05:
    segments.append({
        "duration": TITLE_HOLD_S,
        "type": "title",
        "clip_idx": -1,
        "caption_title": "",
        "caption_body": "",
        "clip_id": "title",
        "label": "Title",
    })

for i, clip in enumerate(clips):
    # transition card segment
    segments.append({
        "duration": TRANSITION_CARD_S,
        "type": "transition",
        "clip_idx": i,
        "caption_title": clip["caption_title"],
        "caption_body": clip["caption_body"],
        "clip_id": clip["id"],
        "label": clip["label"],
    })
    # clip content segment
    segments.append({
        "duration": clip["hold_s"],
        "type": "clip",
        "clip_idx": i,
        "caption_title": clip["caption_title"],
        "caption_body": clip["caption_body"],
        "clip_id": clip["id"],
        "label": clip["label"],
    })

# end card
segments.append({
    "duration": END_HOLD_S,
    "type": "end",
    "clip_idx": -1,
    "caption_title": "",
    "caption_body": "",
    "clip_id": "end",
    "label": "End",
})

# Compute start times accounting for xfade overlaps
# Each segment boundary has a TRANSITION_S overlap
cue_times = []
t = 0.0
for i, seg in enumerate(segments):
    start = t
    end = t + seg["duration"]
    cue_times.append((start, end, seg))
    # Next segment starts at (end - TRANSITION_S) due to xfade overlap
    if i < len(segments) - 1:
        t = end - TRANSITION_S
    else:
        t = end

total_duration = t
print(f"Timeline: {len(segments)} segments, total ~{total_duration:.2f}s")
for (start, end, seg) in cue_times:
    print(f"  [{fmt_srt_time(start)} --> {fmt_srt_time(end)}] {seg['type']:10s} {seg['clip_id']}")

# ─── Build SRT cues ───────────────────────────────────────────────────────────

def build_srt(cue_times):
    """Build SRT content from cue_times list."""
    cues = []
    idx = 1
    for (start, end, seg) in cue_times:
        if seg["type"] in {"title", "end"}:
            continue
        if seg["type"] == "transition":
            text = seg["caption_title"]
        else:
            text = seg["caption_body"]
        if not text:
            continue
        # Ensure minimum cue duration
        duration = end - start
        if duration < 0.5:
            end = start + 0.5
        cues.append(f"{idx}\n{fmt_srt_time(start)} --> {fmt_srt_time(end)}\n{text}\n")
        idx += 1
    return "\n".join(cues)

srt_content = build_srt(cue_times)

# Write SRTs for each layout (same content, layout-named files)
for layout_name, stem in LAYOUT_SRT_STEMS.items():
    srt_path = SUBTITLES_DIR / f"{stem}.srt"
    with open(srt_path, "w") as f:
        f.write(srt_content)
    print(f"Wrote: {srt_path}")

# Count SRT lines
srt_lines = len(srt_content.splitlines())
print(f"SRT content: {srt_lines} lines")

# ─── Build PNG caption frames ─────────────────────────────────────────────────

def make_caption_png(text, width, bar_h, output_path, font_size=28):
    """
    Create a subtitle bar PNG: width x bar_h, dark bg with accent border,
    centered text in palette text color.
    """
    if not text:
        return

    bg_color = hex_to_rgb(BG_COLOR, 230)   # #1a1614 @ alpha 230
    border_color = hex_to_rgb(BORDER_COLOR) # #d77757
    text_color = hex_to_rgb(TEXT_COLOR)     # #f5ede3

    img = Image.new("RGBA", (width, bar_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background with rounded corners approximation
    border_w = 2
    pad = 8
    x0, y0 = pad, pad
    x1, y1 = width - pad, bar_h - pad
    radius = 10

    # Draw rounded rectangle background
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=bg_color)
    # Draw rounded rectangle border
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius,
                           outline=border_color, width=border_w)

    # Load font
    font = find_font(font_size)

    # Center text
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
    except Exception:
        text_w, text_h = len(text) * font_size // 2, font_size

    tx = (width - text_w) // 2
    ty = (bar_h - text_h) // 2

    draw.text((tx, ty), text, fill=text_color, font=font)

    img.save(output_path, "PNG")

# Generate PNGs for each cue in the 16:9 layout.
png_count = 0
for i, (start, end, seg) in enumerate(cue_times):
    if seg["type"] in {"title", "end"}:
        continue
    if seg["type"] == "transition":
        text = seg["caption_title"]
    else:
        text = seg["caption_body"]
    if not text:
        continue

    # Wide frame (base)
    layout_cfg = LAYOUTS["wide"]
    cw = layout_cfg["cw"]
    bar_h = layout_cfg["bar_h"]
    png_name = f"cue-{i:03d}-{seg['clip_id']}-{seg['type']}-wide.png"
    png_path = FRAMES_DIR / png_name
    make_caption_png(text, cw, bar_h, png_path, font_size=30)
    png_count += 1

print(f"Generated {png_count} PNG frames in {FRAMES_DIR}")

# ─── Summary ─────────────────────────────────────────────────────────────────

print("\nGenerate subtitles complete.")
print(f"  SRT files: {len(LAYOUT_SRT_STEMS)}")
print(f"  SRT lines: {srt_lines}")
print(f"  PNG frames: {png_count}")
print(f"  Total video duration estimate: {total_duration:.1f}s")
