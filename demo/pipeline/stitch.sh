#!/bin/bash
set -euo pipefail

# ─── claude-guide demo pipeline: stitch clips into social videos ─────────────
#
# Takes real screen recordings from clips/ + generated overlays and composites
# them into a polished 16:9 video with audio and subtitle metadata.
#
# Usage: bash demo/pipeline/stitch.sh [layout]
#   layout: wide (default), twitter, all
#
# Requires: ffmpeg 8+, python3 with Pillow, clips in clips/, overlays in overlays/
# Note: ffmpeg 8 on macOS lacks libass; subtitle overlays use Pillow PNG frames.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIPS_DIR="$SCRIPT_DIR/clips"
OVERLAYS_DIR="$SCRIPT_DIR/overlays"
OUTPUT_DIR="$SCRIPT_DIR/output"
MANIFEST="$SCRIPT_DIR/clips.json"
SUBTITLES_DIR="$SCRIPT_DIR/subtitles"
FRAMES_DIR="$SUBTITLES_DIR/frames"
AUDIO_DIR="$SCRIPT_DIR/assets/audio"
TEMP_DIR="$SCRIPT_DIR/.tmp"

LAYOUT="${1:-wide}"

# ─── Parse manifest ─────────────────────────────────────────────────────────

BG=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['palette']['bg'])")
SURFACE=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['palette']['surface'])")
ACCENT=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['palette']['accent'])")
TITLE_HOLD=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['format']['title_hold_s'])")
END_HOLD=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['format']['end_hold_s'])")
TRANSITION_CARD_S=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['format'].get('transition_card_s', 0))")
FPS=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['format']['fps'])")
CRF=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['format']['crf'])")
TRANSITION_MS=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['format'].get('transition_ms', 0))")
NUM_CLIPS=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(len(m['clips']))")

# ─── Layout configs (bash 3.2 compatible — no associative arrays) ────────────

get_layout() {
  local L="$1" KEY="$2"
  case "${L}_${KEY}" in
    wide_CW)   echo 1920 ;; wide_CH)   echo 1080 ;;
    wide_TW)   echo 1500 ;; wide_TY)   echo 125  ;;
    wide_CY)   echo 1030 ;; wide_CX)   echo 210  ;;
  esac
}

resolve_layout() {
  case "$1" in
    twitter|all|wide) echo "wide" ;;
    *)
      echo "ERROR: unsupported layout '$1'. This pipeline now renders 16:9 only." >&2
      exit 1
      ;;
  esac
}

get_output_stem() {
  case "$1" in
    *) echo "claude-guide-demo" ;;
  esac
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

ensure_dir() { mkdir -p "$1"; }

check_clips() {
  local missing=0
  for i in $(seq 0 $((NUM_CLIPS - 1))); do
    local clip_file
    clip_file=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['clips'][$i]['file'])")
    local path="$SCRIPT_DIR/$clip_file"
    if [ ! -f "$path" ]; then
      local alt="${path%.mov}.mp4"
      if [ ! -f "$alt" ]; then
        echo "  MISSING: $clip_file (tried .mov and .mp4)"
        missing=1
      fi
    fi
  done
  return $missing
}

find_clip() {
  local base="$1"
  local path="$SCRIPT_DIR/$base"
  if [ -f "$path" ]; then
    echo "$path"
  else
    local alt="${path%.mov}.mp4"
    if [ -f "$alt" ]; then
      echo "$alt"
    else
      echo ""
    fi
  fi
}

# ─── Render one layout ──────────────────────────────────────────────────────

render_layout() {
  local TARGET="$1"
  local L
  L=$(resolve_layout "$TARGET")
  local OUTPUT_STEM
  OUTPUT_STEM=$(get_output_stem "$TARGET")
  local CW=$(get_layout "$L" CW)
  local CH=$(get_layout "$L" CH)
  local TW=$(get_layout "$L" TW)
  local TY=$(get_layout "$L" TY)
  local CY=$(get_layout "$L" CY)
  local CX=$(get_layout "$L" CX)

  echo ""
  echo "━━━ Rendering: $TARGET (${CW}x${CH}) ━━━"

  rm -rf "$TEMP_DIR"
  ensure_dir "$TEMP_DIR"
  ensure_dir "$OUTPUT_DIR"

  # Step 1: Create title card video segment
  if python3 -c "import sys; sys.exit(0 if float('$TITLE_HOLD') > 0.05 else 1)"; then
    echo "  [1/5] Title card..."
    ffmpeg -y -loglevel warning \
      -loop 1 -t "$TITLE_HOLD" -i "$OVERLAYS_DIR/title-${L}.png" \
      -vf "scale=${CW}:${CH},fps=${FPS}" \
      -c:v libx264 -crf "$CRF" -preset medium -pix_fmt yuv420p \
      "$TEMP_DIR/seg-000-title.mp4"
  else
    echo "  [1/5] Title card skipped..."
  fi

  # Step 2: Process each clip → composited segment
  echo "  [2/5] Processing clips..."
  for i in $(seq 0 $((NUM_CLIPS - 1))); do
    local clip_file clip_id clip_speed clip_hold clip_start clip_zoom clip_y_shift
    clip_file=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['clips'][$i]['file'])")
    clip_id=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['clips'][$i]['id'])")
    clip_speed=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['clips'][$i]['speed'])")
    clip_hold=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['clips'][$i]['hold_s'])")
    clip_start=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['clips'][$i].get('start_s', 0))")
    clip_zoom=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['clips'][$i].get('zoom', 1.0))")
    clip_y_shift=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(m['clips'][$i].get('y_shift', 0))")
    local crop_x crop_y crop_w crop_h
    crop_x=$(python3 -c "import json; m=json.load(open('$MANIFEST')); c=m['clips'][$i].get('source_crop', {}); print(c.get('x', ''))")
    crop_y=$(python3 -c "import json; m=json.load(open('$MANIFEST')); c=m['clips'][$i].get('source_crop', {}); print(c.get('y', ''))")
    crop_w=$(python3 -c "import json; m=json.load(open('$MANIFEST')); c=m['clips'][$i].get('source_crop', {}); print(c.get('w', ''))")
    crop_h=$(python3 -c "import json; m=json.load(open('$MANIFEST')); c=m['clips'][$i].get('source_crop', {}); print(c.get('h', ''))")

    local clip_path
    clip_path=$(find_clip "$clip_file")
    if [ -z "$clip_path" ]; then
      echo "    SKIP: $clip_id (file not found)"
      continue
    fi

    local idx
    idx=$(printf "%03d" $((i + 1)))

    echo "    $clip_id..."

    local transition_card
    transition_card="$OVERLAYS_DIR/transition-${L}-${clip_id}.png"
    if python3 -c "import sys; sys.exit(0 if float('$TRANSITION_CARD_S') > 0.01 else 1)"; then
      local intro_idx
      intro_idx=$(printf "%03d" $((i * 2 + 1)))
      ffmpeg -y -loglevel warning \
        -loop 1 -t "$TRANSITION_CARD_S" -i "$transition_card" \
        -vf "scale=${CW}:${CH},fps=${FPS}" \
        -c:v libx264 -crf "$CRF" -preset medium -pix_fmt yuv420p \
        "$TEMP_DIR/seg-${intro_idx}-${clip_id}-intro.mp4"
    fi

    # Get clip duration
    local dur
    dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$clip_path")

    local avail_dur
    avail_dur=$(python3 -c "print(max(0.0, round(float('$dur') - float('$clip_start'), 3)))")

    if python3 -c "import sys; sys.exit(0 if float('$avail_dur') <= 0 else 1)"; then
      echo "    SKIP: $clip_id (start_s trims past clip duration)"
      continue
    fi

    local adj_dur
    adj_dur=$(python3 -c "print(round(float('$avail_dur') / float('$clip_speed'), 2))")

    local use_dur pad_dur
    use_dur="$clip_hold"
    pad_dur=$(python3 -c "print(round(max(0.0, float('$clip_hold') - float('$adj_dur')), 3))")

    local speed_filter=""
    if [ "$clip_speed" != "1.0" ] && [ "$clip_speed" != "1" ]; then
      speed_filter="setpts=PTS/${clip_speed},"
    fi

    local crop_filter=""
    if [ -n "$crop_x" ] && [ -n "$crop_y" ] && [ -n "$crop_w" ] && [ -n "$crop_h" ]; then
      crop_filter="crop=${crop_w}:${crop_h}:${crop_x}:${crop_y},"
    fi

    local pad_filter=""
    if python3 -c "import sys; sys.exit(0 if float('$pad_dur') > 0.001 else 1)"; then
      pad_filter="tpad=stop_mode=clone:stop_duration=${pad_dur},"
    fi

    local source_w source_h
    if [ -n "$crop_w" ] && [ -n "$crop_h" ]; then
      source_w="$crop_w"
      source_h="$crop_h"
    else
      source_w=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nw=1:nk=1 "$clip_path")
      source_h=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=nw=1:nk=1 "$clip_path")
    fi

    local TERM_W TERM_H BASE_TERM_H TERM_X TERM_Y
    TERM_W=$(python3 -c "raw=float('$TW') * float('$clip_zoom'); cap=float('$CW') - 40; print(int(round(min(raw, cap) / 2) * 2))")
    TERM_H=$(python3 -c "print(int(round((float('$source_h') * float('$TERM_W') / float('$source_w')) / 2) * 2))")
    BASE_TERM_H=$(python3 -c "print(int(round((float('$source_h') * float('$TW') / float('$source_w')) / 2) * 2))")
    TERM_X=$(python3 -c "print(int(round((float('$CW') - float('$TERM_W')) / 2)))")
    TERM_Y=$(python3 -c "print(int(round(float('$TY') - (float('$TERM_H') - float('$BASE_TERM_H')) / 2 + float('$clip_y_shift'))))")

    local LABEL="$OVERLAYS_DIR/label-${L}.png"
    local BOX_PAD=18
    local BOX_X=$((TERM_X - BOX_PAD))
    local BOX_Y=$((TERM_Y - BOX_PAD))
    local BOX_W=$((TERM_W + BOX_PAD * 2))
    local BOX_H=$((TERM_H + BOX_PAD * 2))
    local SHADOW_X=$((BOX_X + 14))
    local SHADOW_Y=$((BOX_Y + 18))
    local LABEL_X LABEL_Y
    LABEL_X=$(python3 -c "print(max(20, int('$BOX_X') + 20))")
    LABEL_Y=$(python3 -c "print(max(24, int('$BOX_Y') - 58))")

    # Transition cards carry the explanatory copy; keep clip segments uncluttered.
    ffmpeg -y -loglevel warning \
      -ss "$clip_start" -i "$clip_path" \
      -loop 1 -t "$use_dur" -i "$LABEL" \
      -filter_complex "\
color=c=${BG}:s=${CW}x${CH}:d=${use_dur}:r=${FPS}[bg]; \
[0:v]${speed_filter}${crop_filter}scale=${TERM_W}:-2:flags=lanczos,fps=${FPS},${pad_filter}setsar=1[term]; \
[bg]drawbox=x=${SHADOW_X}:y=${SHADOW_Y}:w=${BOX_W}:h=${BOX_H}:color=black@0.30:t=fill[shadow]; \
[shadow]drawbox=x=${BOX_X}:y=${BOX_Y}:w=${BOX_W}:h=${BOX_H}:color=${SURFACE}@0.82:t=fill[stage]; \
[stage]drawbox=x=${BOX_X}:y=${BOX_Y}:w=${BOX_W}:h=2:color=${ACCENT}@0.55:t=fill[stageLine]; \
[stageLine][term]overlay=${TERM_X}:${TERM_Y}:shortest=1[v1]; \
[v1][1:v]overlay=${LABEL_X}:${LABEL_Y}:shortest=1[out]" \
      -map "[out]" -an -t "$use_dur" \
      -c:v libx264 -crf "$CRF" -preset medium -pix_fmt yuv420p \
      "$TEMP_DIR/seg-$(printf "%03d" $((i * 2 + 2)))-${clip_id}.mp4"
  done

  # Step 3: Create end card video segment
  echo "  [3/5] End card..."
  ffmpeg -y -loglevel warning \
    -loop 1 -t "$END_HOLD" -i "$OVERLAYS_DIR/end-${L}.png" \
    -vf "scale=${CW}:${CH},fps=${FPS}" \
    -c:v libx264 -crf "$CRF" -preset medium -pix_fmt yuv420p \
    "$TEMP_DIR/seg-999-end.mp4"

  # Step 4: Concatenate all segments with xfade
  echo "  [4/5] Stitching video..."

  local transition_s
  transition_s=$(python3 -c "print(round(float('$TRANSITION_MS') / 1000.0, 3))")

  local -a segments=()
  for seg in "$TEMP_DIR"/seg-*.mp4; do
    [ -f "$seg" ] || continue
    segments+=("$seg")
  done

  if [ ${#segments[@]} -eq 0 ]; then
    echo "  ERROR: no rendered segments found"
    exit 1
  fi

  local SILENT_VIDEO="$TEMP_DIR/video-silent.mp4"

  if python3 -c "import sys; sys.exit(0 if float('$transition_s') > 0 and ${#segments[@]} > 1 else 1)"; then
    local -a ffmpeg_inputs=()
    local filter_complex=""
    local i
    for i in "${!segments[@]}"; do
      ffmpeg_inputs+=(-i "${segments[$i]}")
      filter_complex="${filter_complex}[${i}:v]settb=AVTB[v${i}]; "
    done

    local cumulative
    cumulative=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${segments[0]}")
    local last_label="v0"

    for ((i = 1; i < ${#segments[@]}; i++)); do
      local offset seg_dur out_label
      offset=$(python3 -c "print(round(float('$cumulative') - float('$transition_s'), 3))")
      out_label="x${i}"
      filter_complex="${filter_complex}[${last_label}][v${i}]xfade=transition=fadeblack:duration=${transition_s}:offset=${offset}[${out_label}]; "
      seg_dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${segments[$i]}")
      cumulative=$(python3 -c "print(round(float('$cumulative') + float('$seg_dur') - float('$transition_s'), 3))")
      last_label="$out_label"
    done

    ffmpeg -y -loglevel warning \
      "${ffmpeg_inputs[@]}" \
      -filter_complex "$filter_complex" \
      -map "[${last_label}]" -an \
      -c:v libx264 -crf "$CRF" -preset medium -pix_fmt yuv420p \
      -movflags +faststart \
      "$SILENT_VIDEO"
  else
    local CONCAT_LIST="$TEMP_DIR/concat-${TARGET}.txt"
    : > "$CONCAT_LIST"
    for seg in "${segments[@]}"; do
      echo "file '$seg'" >> "$CONCAT_LIST"
    done
    ffmpeg -y -loglevel warning \
      -f concat -safe 0 -i "$CONCAT_LIST" \
      -c:v libx264 -crf "$CRF" -preset medium -pix_fmt yuv420p \
      -movflags +faststart \
      "$SILENT_VIDEO"
  fi

  # Get video duration for audio generation
  local VIDEO_DUR
  VIDEO_DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$SILENT_VIDEO")

  # Step 5: Add audio track (music bed only) and mux
  echo "  [5/5] Adding audio..."

  local MUSIC_BED="$AUDIO_DIR/music-bed.mp3"
  if [ -f "$MUSIC_BED" ]; then
    local AUDIO_OUT="$TEMP_DIR/audio-mix.aac"

    # Music bed only: no startup SFX, so the opening stays clean.
    local FADE_START
    FADE_START=$(python3 -c "print(round(float('$VIDEO_DUR') - 2.0, 3))")

    ffmpeg -y -loglevel warning \
      -stream_loop -1 -i "$MUSIC_BED" \
      -filter_complex "\
[0:a]atrim=0:${VIDEO_DUR},afade=t=in:st=0:d=1.2,afade=t=out:st=${FADE_START}:d=2.0,volume=0.18[aout]" \
      -map "[aout]" \
      -c:a aac -b:a 128k \
      -t "$VIDEO_DUR" \
      "$AUDIO_OUT"

    # Mux video + audio
    ffmpeg -y -loglevel warning \
      -i "$SILENT_VIDEO" \
      -i "$AUDIO_OUT" \
      -c:v copy -c:a aac -b:a 128k \
      -movflags +faststart \
      "$OUTPUT_DIR/${OUTPUT_STEM}.mp4"

  else
    echo "    WARNING: Audio assets not found, producing silent output"
    cp "$SILENT_VIDEO" "$OUTPUT_DIR/${OUTPUT_STEM}.mp4"
  fi

  # Get final duration and check audio track
  local final_dur
  final_dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUTPUT_DIR/${OUTPUT_STEM}.mp4" 2>/dev/null || echo "?")
  local has_audio
  has_audio=$(ffprobe -v error -show_streams "$OUTPUT_DIR/${OUTPUT_STEM}.mp4" 2>/dev/null | grep -c "codec_type=audio" || echo "0")

  echo ""
  echo "  Done: output/${OUTPUT_STEM}.mp4 (${final_dur}s, audio streams: ${has_audio})"
}

# ─── Main ────────────────────────────────────────────────────────────────────

echo "claude-guide demo pipeline — stitch"
echo ""

# Keep subtitle metadata in sync with the manifest timings.
echo "Generating subtitle frames..."
python3 "$SCRIPT_DIR/generate-subtitles.py"

# Check that clips exist
echo "Checking clips..."
if ! check_clips; then
  echo ""
  echo "Some clips are missing. See demo/pipeline/record-guide.md for recording instructions."
  exit 1
fi
echo "  All clips found."

# Check that overlays exist
if [ ! -f "$OVERLAYS_DIR/title-wide.png" ]; then
  echo ""
  echo "Overlays not found. Generating..."
  python3 "$SCRIPT_DIR/generate-overlays.py"
fi

# Render the 16:9 layout. "twitter" and "all" are accepted as backwards-compatible aliases.
render_layout "$LAYOUT"

# Cleanup temp
rm -rf "$TEMP_DIR"

echo ""
echo "━━━ Pipeline complete ━━━"
echo "Output: $OUTPUT_DIR/claude-guide-demo.mp4"
ls -lh "$OUTPUT_DIR/claude-guide-demo.mp4" 2>/dev/null || true
