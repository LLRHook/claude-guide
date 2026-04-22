#!/usr/bin/env python3
"""
Generate overlay assets for the claude-guide demo pipeline.

Produces title cards, transition cards, lower-third captions, and end cards in Claude's
warm brand palette. Uses Inter font (falls back to SF Pro Display, then
Helvetica Neue, then Arial).

Run: python3 demo/pipeline/generate-overlays.py
Output: demo/pipeline/overlays/
"""

import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ─── Paths ──────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
OVERLAYS_DIR = SCRIPT_DIR / "overlays"
OVERLAYS_DIR.mkdir(parents=True, exist_ok=True)

CLIPS_JSON = SCRIPT_DIR / "clips.json"
with open(CLIPS_JSON) as f:
    MANIFEST = json.load(f)

PAL = MANIFEST["palette"]

# ─── Font resolution ────────────────────────────────────────────────────────

FONT_CANDIDATES_REG = [
    "/Library/Fonts/Inter-Regular.otf",
    "/Library/Fonts/Inter-Regular.ttf",
    str(Path.home() / "Library/Fonts/Inter-Regular.otf"),
    str(Path.home() / "Library/Fonts/Inter-Regular.ttf"),
    # Homebrew cask font path
    str(Path.home() / "Library/Fonts/InterVariable.ttf"),
    "/System/Library/Fonts/SFNSDisplay.ttf",
    "/System/Library/Fonts/Supplemental/Helvetica Neue.ttc",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]

FONT_CANDIDATES_BOLD = [
    "/Library/Fonts/Inter-Bold.otf",
    "/Library/Fonts/Inter-Bold.ttf",
    str(Path.home() / "Library/Fonts/Inter-Bold.otf"),
    str(Path.home() / "Library/Fonts/Inter-Bold.ttf"),
    str(Path.home() / "Library/Fonts/InterVariable.ttf"),
    "/System/Library/Fonts/SFNSDisplay.ttf",
    "/System/Library/Fonts/Supplemental/Helvetica Neue.ttc",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]

FONT_CANDIDATES_MONO = [
    "/Library/Fonts/JetBrainsMono-Regular.ttf",
    str(Path.home() / "Library/Fonts/JetBrainsMono-Regular.ttf"),
    "/System/Library/Fonts/SFMono-Regular.otf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
]


def find_font(candidates):
    for path in candidates:
        if Path(path).exists():
            return path
    return candidates[-1]  # fallback to last


FONT_REG = find_font(FONT_CANDIDATES_REG)
FONT_BOLD = find_font(FONT_CANDIDATES_BOLD)
FONT_MONO = find_font(FONT_CANDIDATES_MONO)


def font(path, size):
    return ImageFont.truetype(path, size=size)


# ─── Color helpers ──────────────────────────────────────────────────────────


def rgba(hex_color, alpha=255):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def blend(hex1, hex2, t):
    """Linearly blend two hex colors. t=0 → hex1, t=1 → hex2."""
    c1 = rgba(hex1)[:3]
    c2 = rgba(hex2)[:3]
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


# ─── Drawing helpers ────────────────────────────────────────────────────────


def rounded_rect(draw, xy, radius, fill=None, outline=None, width=1):
    """Draw a rounded rectangle."""
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def centered_text(draw, xy, text, font_obj, fill, spacing=8):
    bbox = draw.multiline_textbbox(
        (0, 0), text, font=font_obj, spacing=spacing, align="center"
    )
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.multiline_text(
        (xy[0] - w / 2, xy[1] - h / 2),
        text,
        font=font_obj,
        fill=fill,
        spacing=spacing,
        align="center",
    )


# ─── Asset generators ───────────────────────────────────────────────────────

# -- Aspect ratio configs --
LAYOUTS = {
    "wide": {"size": (1920, 1080), "term_w": 1500, "term_y": 125, "caption_y": 920, "caption_w": 1500},
}


def generate_title_card(layout_name, layout):
    """Full-frame title card shown for the first 2-3 seconds."""
    w, h = layout["size"]
    img = Image.new("RGBA", (w, h), rgba(PAL["bg"]))
    draw = ImageDraw.Draw(img)

    # Subtle radial glow behind the title
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_color = rgba(PAL["accent"], 18)
    glow_draw.ellipse(
        (w // 2 - 400, h // 2 - 300, w // 2 + 400, h // 2 + 300),
        fill=glow_color,
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=120))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    # Top accent bar (thin, warm)
    draw.rectangle((0, 0, w, 4), fill=rgba(PAL["accent"]))

    # Badge: "claude-guide"
    badge_font = font(FONT_BOLD, 28)
    badge_text = "claude-guide"
    badge_bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
    badge_w = badge_bbox[2] - badge_bbox[0] + 48
    badge_h = badge_bbox[3] - badge_bbox[1] + 28
    badge_x = (w - badge_w) // 2
    badge_y = int(h * 0.30)
    rounded_rect(
        draw,
        (badge_x, badge_y, badge_x + badge_w, badge_y + badge_h),
        radius=badge_h // 2,
        fill=rgba(PAL["accent"], 40),
        outline=rgba(PAL["accent"], 100),
        width=2,
    )
    draw.text(
        (badge_x + 24, badge_y + 14),
        badge_text,
        font=badge_font,
        fill=rgba(PAL["accent_bright"]),
    )

    # Title
    title_size = 56 if h > 1200 else 48 if h > 1000 else 44
    centered_text(
        draw,
        (w / 2, h * 0.44),
        "Claude Code,\nsafer to learn",
        font(FONT_BOLD, title_size),
        rgba(PAL["text"]),
        spacing=12,
    )

    # Subtitle
    sub_size = 26 if h > 1200 else 22
    centered_text(
        draw,
        (w / 2, h * 0.58),
        "Explanations. Guard rails. Visible progress.",
        font(FONT_REG, sub_size),
        rgba(PAL["dim"]),
    )

    # Decorative dots (like Claude's spinner glyphs)
    dot_y = int(h * 0.68)
    glyphs = "  ".join(["·", "✻", "✽", "✶", "✳", "✢"])
    centered_text(
        draw, (w / 2, dot_y), glyphs, font(FONT_REG, 20), rgba(PAL["accent"], 80)
    )

    img.save(OVERLAYS_DIR / f"title-{layout_name}.png")


def generate_end_card(layout_name, layout):
    """End card with install command and links."""
    w, h = layout["size"]
    img = Image.new("RGBA", (w, h), rgba(PAL["bg"]))
    draw = ImageDraw.Draw(img)

    # Top accent bar
    draw.rectangle((0, 0, w, 4), fill=rgba(PAL["accent"]))

    # "Try it" heading
    centered_text(
        draw,
        (w / 2, h * 0.34),
        "Install in 30 seconds",
        font(FONT_BOLD, 52 if w >= 1600 else 46),
        rgba(PAL["text"]),
    )

    # Install command in a code block
    cmd_font = font(FONT_MONO, 32 if w >= 1600 else 28)
    cmd_text = "npm install -g claude-guide"
    cmd_bbox = draw.textbbox((0, 0), cmd_text, font=cmd_font)
    cmd_w = cmd_bbox[2] - cmd_bbox[0] + 64
    cmd_h = cmd_bbox[3] - cmd_bbox[1] + 36
    cmd_x = (w - cmd_w) // 2
    cmd_y = int(h * 0.45)
    rounded_rect(
        draw,
        (cmd_x, cmd_y, cmd_x + cmd_w, cmd_y + cmd_h),
        radius=14,
        fill=rgba(PAL["surface"]),
        outline=rgba(PAL["accent"], 80),
        width=2,
    )
    draw.text(
        (cmd_x + 32, cmd_y + 18), cmd_text, font=cmd_font, fill=rgba(PAL["accent_bright"])
    )

    # GitHub link
    centered_text(
        draw,
        (w / 2, h * 0.59),
        "github.com/victorivanov/claude-guide",
        font(FONT_REG, 24 if w >= 1600 else 22),
        rgba(PAL["dim"]),
    )

    # Features list
    features = [
        "Zero dependencies  ·  100% local  ·  Open source",
    ]
    centered_text(
        draw,
        (w / 2, h * 0.68),
        "\n".join(features),
        font(FONT_REG, 20),
        rgba(PAL["dim"], 180),
        spacing=10,
    )

    img.save(OVERLAYS_DIR / f"end-{layout_name}.png")


def generate_caption(clip, layout_name, layout, index):
    """Lower-third caption card for a single clip."""
    cap_w = layout["caption_w"]
    cap_h = 120
    img = Image.new("RGBA", (cap_w, cap_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background with accent border
    rounded_rect(
        draw,
        (0, 0, cap_w, cap_h),
        radius=20,
        fill=rgba(PAL["caption_bg"], 230),
        outline=rgba(PAL["caption_border"], 90),
        width=2,
    )

    # Step number chip
    chip_w = 48
    chip_h = cap_h
    rounded_rect(
        draw,
        (0, 0, chip_w + 20, chip_h),
        radius=20,
        fill=rgba(PAL["accent"], 60),
    )
    num_font = font(FONT_BOLD, 28)
    draw.text(
        (chip_w // 2 + 10, chip_h // 2),
        f"{index + 1}",
        font=num_font,
        fill=rgba(PAL["accent_bright"]),
        anchor="mm",
    )

    # Title and body text
    text_x = chip_w + 36
    draw.text(
        (text_x, 24),
        clip["caption_title"],
        font=font(FONT_BOLD, 28),
        fill=rgba(PAL["text"]),
    )
    draw.text(
        (text_x, 68),
        clip["caption_body"],
        font=font(FONT_REG, 20),
        fill=rgba(PAL["dim"]),
    )

    img.save(OVERLAYS_DIR / f"caption-{layout_name}-{clip['id']}.png")


def generate_transition_card(clip, layout_name, layout, index):
    """Full-frame transition card shown before each clip."""
    w, h = layout["size"]
    img = Image.new("RGBA", (w, h), rgba(PAL["bg"]))

    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        (w // 2 - 320, h // 2 - 220, w // 2 + 320, h // 2 + 220),
        fill=rgba(PAL["accent"], 20),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=110))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    draw.rectangle((0, 0, w, 4), fill=rgba(PAL["accent"]))

    badge_text = f"{index + 1} / {len(MANIFEST['clips'])}"
    badge_font = font(FONT_BOLD, 26 if w >= 1600 else 22)
    badge_bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
    badge_w = badge_bbox[2] - badge_bbox[0] + 42
    badge_h = badge_bbox[3] - badge_bbox[1] + 24
    badge_x = (w - badge_w) // 2
    badge_y = int(h * 0.24)
    rounded_rect(
        draw,
        (badge_x, badge_y, badge_x + badge_w, badge_y + badge_h),
        radius=badge_h // 2,
        fill=rgba(PAL["accent"], 40),
        outline=rgba(PAL["accent"], 90),
        width=2,
    )
    draw.text(
        (badge_x + badge_w / 2, badge_y + badge_h / 2),
        badge_text,
        font=badge_font,
        fill=rgba(PAL["accent_bright"]),
        anchor="mm",
    )

    title_size = 64 if w >= 1600 else 52 if h > 1200 else 46
    body_size = 28 if w >= 1600 else 22
    centered_text(
        draw,
        (w / 2, h * 0.44),
        clip["caption_title"],
        font(FONT_BOLD, title_size),
        rgba(PAL["text"]),
        spacing=10,
    )
    centered_text(
        draw,
        (w / 2, h * 0.58),
        clip["caption_body"],
        font(FONT_REG, body_size),
        rgba(PAL["dim"]),
        spacing=8,
    )

    img.save(OVERLAYS_DIR / f"transition-{layout_name}-{clip['id']}.png")


def generate_label_badge(layout_name):
    """Small 'claude-guide' badge shown in the top-left during clips."""
    badge_w, badge_h = 240, 48
    img = Image.new("RGBA", (badge_w, badge_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    rounded_rect(
        draw,
        (0, 0, badge_w, badge_h),
        radius=badge_h // 2,
        fill=rgba(PAL["accent"], 35),
        outline=rgba(PAL["accent"], 80),
        width=1,
    )
    draw.text(
        (badge_w // 2, badge_h // 2),
        "claude-guide",
        font=font(FONT_BOLD, 22),
        fill=rgba(PAL["accent_bright"]),
        anchor="mm",
    )
    img.save(OVERLAYS_DIR / f"label-{layout_name}.png")


# ─── Main ────────────────────────────────────────────────────────────────────


def main():
    clips = MANIFEST["clips"]

    for layout_name, layout in LAYOUTS.items():
        print(f"Generating {layout_name} overlays...")

        generate_title_card(layout_name, layout)
        generate_end_card(layout_name, layout)
        generate_label_badge(layout_name)

        for i, clip in enumerate(clips):
            generate_caption(clip, layout_name, layout, i)
            generate_transition_card(clip, layout_name, layout, i)

    total = len(LAYOUTS) * (3 + 2 * len(clips))  # title + end + label + captions + transitions
    print(f"\nDone. {total} overlay assets written to {OVERLAYS_DIR}/")


if __name__ == "__main__":
    main()
