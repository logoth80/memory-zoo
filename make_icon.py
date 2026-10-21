# Generates icon.ico for Memory Zoo from the game's card-back paw motif.
# Re-run with the bundled Python:  python make_icon.py
from PIL import Image, ImageDraw

S = 4  # design space is a 64x64 viewBox, like the card-back SVG
SS = 64 * S * 4  # supersample factor 4 for antialiasing, then downscale to 256
TOP = (74, 134, 196)     # #4a86c4  (card-back light blue)
BOT = (28, 63, 102)      # #1c3f66  (card-back deep blue)
PAW = (234, 245, 255)    # #eaf5ff  (card-back paw white)


def scaled(v):  # 64-viewBox coords -> supersampled pixels
    return v * S * 4


def draw_tile(size):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = size * 0.22

    # vertical blue gradient clipped to a rounded square
    grad = Image.new("RGBA", (size, size))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOT))
        gd.line([(0, y), (size, y)], fill=c + (255,))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    im.paste(grad, (0, 0), mask)

    # subtle inner ring + top-left sheen, like the card backs
    pad = size * 0.045
    d.rounded_rectangle([pad, pad, size - pad, size - pad],
                        radius=r * 0.8, outline=(255, 255, 255, 34), width=max(2, size // 42))

    # paw (same geometry as the card-back SVG, in the 64 viewBox)
    ps = size / 64.0
    off = (size * 0.03, size * 0.035)
    toes = [(20, 17, 5.6, 7), (32, 13, 5.6, 7.5), (44, 17, 5.6, 7),
            (13, 29, 5.2, 6.6), (51, 29, 5.2, 6.6)]
    for cx, cy, rx, ry in toes:
        x0 = (cx - rx) * ps + off[0]; y0 = (cy - ry) * ps + off[1]
        x1 = (cx + rx) * ps + off[0]; y1 = (cy + ry) * ps + off[1]
        d.ellipse([x0, y0, x1, y1], fill=PAW)
    # main pad + two top bumps -> heart-pad look
    for cx, cy, rx, ry in [(32, 40.5, 16.8, 13.6), (21.5, 33.5, 8.4, 8.0), (42.5, 33.5, 8.4, 8.0)]:
        x0 = (cx - rx) * ps + off[0]; y0 = (cy - ry) * ps + off[1]
        x1 = (cx + rx) * ps + off[0]; y1 = (cy + ry) * ps + off[1]
        d.ellipse([x0, y0, x1, y1], fill=PAW)
    return im


big = draw_tile(SS)
icon = big.resize((256, 256), Image.LANCZOS)
icon.save("icon_preview.png")

sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
icon.save("icon.ico", sizes=sizes)

check = Image.open("icon.ico")
print("icon.ico sizes:", check.info.get("sizes"))
