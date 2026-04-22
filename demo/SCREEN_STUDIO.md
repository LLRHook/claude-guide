# Screen Studio demo polish

Use Screen Studio when the generated demo needs a cleaner product-video feel:
smooth zooms, softer framing, cursor polish, and nicer export defaults.

## Current source video

The canonical demo video is:

```text
demo/pipeline/output/claude-guide-demo.mp4
```

Screen Studio can create a project from an existing MP4:

1. Open Screen Studio.
2. Choose `File -> Create project from video...`.
3. Select `demo/pipeline/output/claude-guide-demo.mp4`.
4. Set aspect ratio to `Wide` for X/Twitter.
5. Export as MP4 at 1920x1080, 30fps, high quality.

Imported videos can use visual enhancements like zooms, background, shadow, and
spacing. Cursor animations and click-aware zooms are best when recording
directly in Screen Studio instead of importing an already-rendered MP4.

## Recommended visual settings

- Aspect ratio: `Wide` / `16:9`
- Background: warm dark, close to `#100e0c`
- Outer spacing: medium, enough that the terminal does not touch the edges
- Shadow: subtle, soft, low opacity
- Inset: small, just enough to separate the terminal from the background
- Zooms: manual, not automatic, because the important moments are text regions
- Cursor: hide when static; keep cursor small if it appears

## Manual zoom beats

Keep the main terminal view calm and zoomed out. Add manual zooms only where the
viewer needs help reading:

1. Explanation clip: zoom gently into the explanation block.
2. Block clip: zoom gently into the safety explanation.
3. Status clip: keep mostly wide so the progress bars feel like a dashboard.
4. End card: no zoom.

The zoom should feel like camera direction, not a magnifying glass. Prefer slow,
smooth movement and hold the final zoom long enough to read.

## Timing target

The demo should feel readable, not chopped:

- Transition cards: 2.0-2.5 seconds
- Crossfades: 0.7-0.9 seconds
- Explain clip: 7-8 seconds
- Block clip: 6-7 seconds
- Status clip: 4-5 seconds
- End card: 2-3 seconds

Target total length: 32-40 seconds.

## Best-quality path

For the cleanest result, record the terminal directly in Screen Studio instead
of importing the generated MP4:

1. Use the same commands from `demo/pipeline/record-clips.sh`.
2. Record only the terminal window.
3. Keep Claude Code permissions in normal mode. Do not use bypass permissions.
4. Use Menlo around 18pt with no artificial tracking.
5. Add manual zooms in Screen Studio after recording.
6. Export one final `claude-guide-demo.mp4`.

This route preserves Screen Studio's native cursor smoothing, zoom editing, and
screen-recording polish.
