from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src" / "icons"
SIZES = (16, 32, 48, 128)
SCALE = 4

# Color themes. A palette controls the gradient body, the glyph color, the
# drop-shadow tint/strength, the top sheen, and an optional hairline border.
EMERALD = {
    "top": (38, 211, 161),      # fresh emerald
    "bottom": (12, 110, 100),   # deep teal (aligned with popup.css --accent)
    "symbol": (255, 255, 255, 255),
    "shadow": (4, 52, 47),
    "shadow_alpha": 90,
    "sheen": 40,
}
MONO_DARK = {
    "top": (60, 60, 64),        # charcoal
    "bottom": (15, 15, 17),     # near-black
    "symbol": (255, 255, 255, 255),
    "shadow": (0, 0, 0),
    "shadow_alpha": 80,
    "sheen": 30,
}
MONO_LIGHT = {
    "top": (255, 255, 255),
    "bottom": (228, 229, 231),  # soft gray
    "symbol": (24, 24, 27, 255),
    "shadow": (0, 0, 0),
    "shadow_alpha": 32,
    "sheen": 0,
    "border": (0, 0, 0, 30),    # hairline so it survives on light toolbars
    "border_width": 1.4,
}

# Palette used for the real, shipped icons.
ACTIVE = EMERALD


def vertical_gradient(canvas, top, bottom):
    """Smooth top->bottom gradient as an RGB image."""
    base = Image.linear_gradient("L").resize((canvas, canvas))  # 0 (top) -> 255
    top_img = Image.new("RGB", (canvas, canvas), top)
    bottom_img = Image.new("RGB", (canvas, canvas), bottom)
    # composite keeps `top_img` where mask is white, so invert the ramp.
    return Image.composite(top_img, bottom_img, ImageChops.invert(base))


def squircle_mask(canvas, inset, radius):
    """Soft rounded-square alpha mask (drawn supersampled, downscaled later)."""
    mask = Image.new("L", (canvas, canvas), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (inset, inset, canvas - 1 - inset, canvas - 1 - inset),
        radius=radius,
        fill=255,
    )
    return mask


def top_sheen(canvas, body_mask, peak):
    """Subtle glossy highlight fading out over the upper ~45% of the icon."""
    ramp = Image.linear_gradient("L").resize((canvas, canvas))  # 0 (top) -> 255
    sheen = ramp.point(lambda v: int(max(0.0, 1.0 - v / 127.5) * peak))
    sheen = ImageChops.multiply(sheen, body_mask)  # never spill past the body
    layer = Image.new("RGBA", (canvas, canvas), (255, 255, 255, 0))
    layer.putalpha(sheen)
    return layer


def draw_glyph(canvas, symbol):
    """Download mark: arrow dropping into an open tray."""
    s = canvas / 128.0
    layer = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def sc(*xy):
        return tuple(v * s for v in xy)

    # Arrow shaft (rounded pill, tucked into the head).
    d.rounded_rectangle(sc(55, 22, 73, 54), radius=9 * s, fill=symbol)

    # Arrow head: clean triangle, crisp shoulders, softly rounded tip.
    tip = sc(64, 84)
    d.polygon([sc(40, 48), sc(88, 48), tip], fill=symbol)
    r = 5 * s
    d.ellipse((tip[0] - r, tip[1] - r, tip[0] + r, tip[1] + r), fill=symbol)

    # Tray: two arms + a base forming an open-top "U".
    d.rounded_rectangle(sc(32, 96, 96, 108), radius=6 * s, fill=symbol)  # base
    d.rounded_rectangle(sc(32, 78, 47, 108), radius=6.5 * s, fill=symbol)  # left arm
    d.rounded_rectangle(sc(81, 78, 96, 108), radius=6.5 * s, fill=symbol)  # right arm

    return layer


def draw_icon(size, pal=ACTIVE):
    canvas = size * SCALE
    s = canvas / 128.0
    inset = int(5 * s)
    radius = 30 * s

    # Gradient body clipped to a rounded-square mask.
    body_mask = squircle_mask(canvas, inset, radius)
    icon = vertical_gradient(canvas, pal["top"], pal["bottom"]).convert("RGBA")
    icon.putalpha(body_mask)

    # Glossy top sheen for a little depth.
    if pal.get("sheen"):
        icon = Image.alpha_composite(icon, top_sheen(canvas, body_mask, pal["sheen"]))

    glyph = draw_glyph(canvas, pal["symbol"])

    # Soft drop shadow lifts the glyph off the background.
    if pal.get("shadow_alpha"):
        offset = ImageChops.offset(glyph.split()[3], 0, max(1, round(3 * s)))
        shadow = Image.new("RGBA", (canvas, canvas), tuple(pal["shadow"]) + (pal["shadow_alpha"],))
        shadow.putalpha(ImageChops.multiply(offset, shadow.split()[3]))
        shadow = shadow.filter(ImageFilter.GaussianBlur(3.0 * s))
        icon = Image.alpha_composite(icon, shadow)

    icon = Image.alpha_composite(icon, glyph)

    # Optional hairline border (keeps light icons visible on light backgrounds).
    if pal.get("border"):
        bw = max(1, round(pal.get("border_width", 1.4) * s))
        ImageDraw.Draw(icon).rounded_rectangle(
            (inset, inset, canvas - 1 - inset, canvas - 1 - inset),
            radius=radius, outline=pal["border"], width=bw,
        )

    return icon.resize((size, size), Image.Resampling.LANCZOS)


def preview_strip(pal=ACTIVE, bg=(246, 247, 247, 255), sizes=SIZES):
    """A side-by-side strip of every size, each at its native resolution."""
    gap, label_h, tile = 18, 20, 128
    strip = Image.new("RGBA", (tile * len(sizes) + gap * (len(sizes) + 1), tile + label_h + gap * 2), bg)
    draw = ImageDraw.Draw(strip)
    label = (51, 65, 85, 255) if sum(bg[:3]) > 360 else (236, 236, 238, 255)

    x = y = gap
    for size in sizes:
        icon = draw_icon(size, pal)
        strip.alpha_composite(icon, (x + (tile - size) // 2, y + (tile - size) // 2))
        draw.text((x + 48, y + tile + 4), f"{size}x{size}", fill=label)
        x += tile + gap
    return strip


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        draw_icon(size, ACTIVE).save(OUT_DIR / f"icon-{size}.png")
    preview_strip(ACTIVE).save(OUT_DIR / "preview.png")
    print(f"Generated icons in {OUT_DIR}")


if __name__ == "__main__":
    main()
