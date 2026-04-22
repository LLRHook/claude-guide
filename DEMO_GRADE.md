# Demo Video Grade Report

**Date**: April 15, 2026
**Evaluated**: `demo/pipeline/output/claude-guide-demo-{4x5,square,wide}.mp4`
**Source clips**: 5 VHS-rendered terminal recordings (01-init through 05-graduate)
**Total runtime**: 37.8 seconds

---

## Overall Grade: 42 / 100

The demo has strong bones — clear narrative arc, cohesive branding, and a smart multi-format pipeline. But it fails at the job a demo video must do: make the product instantly legible on the platform where people will actually watch it (mobile LinkedIn, muted, scrolling fast). The terminal text is unreadable at consumption size, there is no motion design to guide attention, and the video opens with a static title card instead of a hook.

---

## Category Breakdown

### 1. Information Portrayal — 55 / 100

**What works:**
- The 5-clip narrative (Install → Explain → Block → Status → Graduate) maps cleanly to the demo script's three goals: understandability, safety, and adaptive learning
- Each clip has a caption card with a clear title and one-sentence body — these are well-written
- The progression tells a complete user story from setup to graduation

**What doesn't work:**
- **The product's actual output is the thing being demonstrated, but it's the hardest thing to read.** The explanation blocks, the block message, and the status bars are the entire value proposition — and they're tiny monospace text inside a 940px terminal embed. On a phone screen, this is illegible.
- **Clip 1 (init) shows the wrong thing.** It shows the post-init welcome message, which is a wall of text. The viewer should see the one-line command and the instant "✓ Installed" confirmation. The current clip buries the action.
- **Clip 2 (explain) starts mid-output.** The viewer needs to see "Claude is about to use the Bash tool" appear in real-time context, not as pre-rendered static text. Without the before/after contrast, the explanation feature looks like just more terminal output.
- **No narration or voiceover.** The viewer must read everything. On muted autoplay (80%+ of LinkedIn views), they're reading small caption text while also trying to parse small terminal text. That's two reading tasks at once.

### 2. Visual Clarity — 38 / 100

**What works:**
- Warm color palette (#d77757 accent on #100e0c background) is distinctive and cohesive
- Title card is clean and professional — badge, heading, subtitle, decorative dots
- The lower-third caption cards have a clear information hierarchy (step number → title → body)
- The "claude-guide" label badge provides consistent branding across clips

**What doesn't work:**
- **Terminal text is unreadable on mobile.** Source clips are 1200×700 at 28pt SF Mono, but after compositing into a 1080×1350 frame with padding, the effective terminal area is ~940×600px. On a phone screen (375pt logical width), that terminal text renders at roughly 10-11pt equivalent. This is below the readability threshold.
- **No zoom or focus.** The entire terminal window is shown at all times. Best-in-class demos (Cursor, Warp, Vercel) use dynamic zoom to the active region so the viewer's eye is guided to what matters. Here, the viewer has to scan the entire frame.
- **No cursor highlighting.** The cursor is a small orange block that doesn't draw attention. Tools like Screen Studio add cursor smoothing, size scaling, and click ripples.
- **Hard cuts between clips.** There are no transitions. The stitch pipeline concatenates segments directly. Even a 400ms crossfade (which `clips.json` defines as `transition_ms: 400` but `stitch.sh` doesn't implement) would help.
- **Status bars (clip 4) are the most visually compelling element but get the least screen time.** The progress bars are the one truly visual feature, yet they're displayed at the same tiny size as everything else.
- **End card says `github.com/anthropics/claude-guide`** — verify this is the correct URL before publishing.

### 3. Video Production Quality — 40 / 100

**What works:**
- The pipeline infrastructure is genuinely excellent — `clips.json` manifest, Python overlay generator, bash stitching, multi-format output. This is a professional-grade build system.
- Three output formats (4:5, square, wide) show good platform awareness
- CRF 18 encoding quality is appropriate
- The overlay generation (title, captions, end card, badges) is clean and parameterized

**What doesn't work:**
- **Source clips are 25fps, not 30fps.** The VHS tapes set `Framerate 30` but the output is 25fps. The stitch pipeline upsamples to 30fps, which can cause micro-judder.
- **No audio whatsoever.** No background music, no sound effects, no voiceover. Every competitive demo video has at least a subtle background track. Silent videos feel unfinished.
- **No motion design.** Text appears instantly. Clips appear instantly. There are no easing animations, no fade-ins, no kinetic typography. The title card is static for 2.8 seconds. Compare this to Vercel's demos where text animates in word-by-word.
- **37.8 seconds is an awkward length.** Too long for a punchy social loop (15-20s ideal for Twitter/X), too short for a proper walkthrough (60-90s). It's in no-man's land.
- **VHS-simulated recordings vs. real screen recordings.** The clips are generated by VHS (charmbracelet/vhs) with scripted terminal commands. This gives perfect reproducibility but sacrifices authenticity — there's no real typing cadence, no genuine Claude Code session, no cursor movement that feels human.
- **The `transition_ms: 400` in clips.json is declared but never used.** The stitch script does hard concatenation.

### 4. Comparison to Industry Standard — 35 / 100

**Benchmarked against**: Cursor, Warp, Vercel, Supabase, Railway, Fig/Amazon Q CLI demos

| Element | Industry Standard | Current Demo |
|---|---|---|
| Opening | Hook/wow moment in first 3 seconds | Static title card for 2.8 seconds |
| Terminal readability | 18-22pt+ with dynamic zoom | 28pt source, no zoom, ~11pt on mobile |
| Motion design | Animated text reveals, smooth transitions | None — all static |
| Audio | Background music + optional VO | Silent |
| Cursor effects | Smoothed, highlighted, enlarged | Raw small block cursor |
| Recording quality | Screen Studio / 2x resolution downscaled | VHS-generated 1200×700 |
| Pacing | Speed up dead time, real-time for aha moments | Uniform speed throughout |
| Hook structure | Show outcome first, then setup | Shows setup first (init) |
| Captions/subtitles | Full subtitles for mute viewing | Lower-third cards only |
| Length | 15-30s (social) or 60-90s (demo) | 38s (neither) |
| CTA | Prominent, animated | Static end card |

---

## What to Fix — Priority-Ordered Actionable Plan

### P0 — Critical (blocks effectiveness)

1. **Make terminal text readable on mobile**
   - Increase VHS FontSize from 28 to 40-44
   - Reduce terminal window dimensions to show less text but larger
   - OR: add dynamic zoom overlays in ffmpeg (scale + crop to the active 4-6 lines)
   - Target: text must be legible at 375px viewport width (iPhone)

2. **Restructure the opening — lead with the hook**
   - Move the "block" clip (03) to position 1 — it's the most dramatic moment
   - OR: create a 2-second "cold open" montage: show the HOLD ON block message, then cut to title card, then tell the full story
   - The first 3 seconds determine whether someone keeps scrolling or stops

3. **Add zoom/focus to terminal clips**
   - Option A: Re-record with Screen Studio (paid, easiest path to professional quality)
   - Option B: Add ffmpeg crop+scale animations in `stitch.sh` that zoom to the relevant region of each clip (e.g., zoom to the explanation block in clip 2, zoom to the HOLD ON message in clip 3)
   - Option C: Record at much higher resolution and use strategic cropping

### P1 — Important (significantly improves quality)

4. **Add background music**
   - Use a royalty-free lo-fi or ambient track (Epidemic Sound, Artlist, or free options like Pixabay Audio)
   - Keep it subtle — -18dB to -24dB under any speech, or as soft background
   - Fade in after title card, fade out before end card

5. **Implement transitions**
   - The pipeline already declares `transition_ms: 400` — implement crossfade in `stitch.sh`
   - Use ffmpeg `xfade` filter between segments
   - Add a subtle fade-in for each caption card appearance

6. **Add kinetic typography to title and end cards**
   - Animate the title text in word-by-word or line-by-line
   - Animate the install command on the end card (typing effect)
   - This can be done with ffmpeg `drawtext` with enable expressions, or by generating frame sequences in Python

7. **Pick a definitive length**
   - For LinkedIn/social: cut to 25-30 seconds. Drop clip 1 (init) and clip 5 (graduate) — they're the weakest visually. Focus on Explain + Block + Status.
   - For website/README: expand to 60 seconds with slower pacing and more context

### P2 — Nice to Have (polishes the result)

8. **Re-record with real Claude Code sessions**
   - The VHS-simulated clips work but lack authenticity
   - Record real sessions with Screen Studio, then trim to the key moments
   - Keep VHS recordings as a fallback for CI/reproducibility

9. **Add cursor effects**
   - If using Screen Studio, this is automatic
   - If staying with VHS, increase cursor size in theme settings and add a subtle glow

10. **Add full subtitles**
    - Generate SRT/ASS subtitle tracks that narrate what's happening
    - Burn them into the video at a readable size
    - This serves the 80%+ of LinkedIn viewers watching on mute

11. **Optimize end card CTA**
    - Add a QR code alongside the text URL
    - Make the install command visually "type itself" (frame-by-frame text reveal)
    - Add "Star on GitHub" or "Try in 30 seconds" urgency text

12. **Improve status clip (04) visual impact**
    - The progress bars are the most visually distinctive element — make them bigger
    - Consider animating the bars filling up (record a real session where tool counts increment)

---

## Summary

| Category | Score | Weight | Weighted |
|---|---|---|---|
| Information Portrayal | 55 | 30% | 16.5 |
| Visual Clarity | 38 | 30% | 11.4 |
| Production Quality | 40 | 20% | 8.0 |
| Industry Comparison | 35 | 20% | 7.0 |
| **Total** | | | **42.9 → 42** |

The pipeline and narrative structure are genuinely good — this is not a "start over" situation. The core problems are readability, motion design, and hook structure. Fixing P0 items alone would move the score to ~60. Completing P0 + P1 would reach ~75, which is competitive with most indie dev tool demos. To reach 85+ (Vercel/Cursor tier), you'd need Screen Studio recordings and professional motion design.
