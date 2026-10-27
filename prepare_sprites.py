# Cuts out the new animal photos and writes game sprites to TileSprites/animals/.
# Reads source files from _sprites_in/ (raw copies), deletes them when done.
# Re-run:  python prepare_sprites.py
import os
from collections import deque
from PIL import Image

SRC = "TileSprites/raw"
OUT = "TileSprites/animals"
MAX_SIDE = 512
WHITE_T = 236          # near-white threshold for the background flood fill
EDGE_PAD = 0.04        # transparent margin kept around the subject

JOBS = [
    ("panda.webp",    "Panda01"),
    ("camel.png",     "Camel01"),
    ("kangaroo.webp", "Kangaroo01"),
    ("koala.webp",    "Koala01"),
    ("pig.png",       "Piglet01"),
    ("fish.png",      "Fish01"),
    ("elephant.png",  "Elephant01"),
    ("turtle.png",    "Turtle01"),
    ("shark.webp",    "Shark01"),
    ("wolf.png",      "Wolf01"),
    ("toucan.png",    "Toucan01"),
    ("parrot.png",    "Parrot01"),
    ("tiger.webp",    "TigerCub01"),
    ("frog.png",      "Frog01"),     # replaces the old frog sprite
]

SPECIAL = {"frog.png"}   # black letterbox bars + solid teal background


def strip_black_bars(im):
    px = im.load()
    w, h = im.size

    def col_black(x):
        return all(max(px[x, y][:3]) < 30 for y in range(0, h, max(1, h // 240)))

    def row_black(y):
        return all(max(px[x, y][:3]) < 30 for x in range(0, w, max(1, w // 240)))

    l = 0
    while l < w and col_black(l): l += 1
    r = w - 1
    while r > l and col_black(r): r -= 1
    t = 0
    while t < h and row_black(t): t += 1
    b = h - 1
    while b > t and row_black(b): b -= 1
    return im.crop((l, t, r + 1, b + 1))


def flood_bg(im):
    """Flood the solid background color from the borders and make it transparent."""
    w, h = im.size
    px = im.load()
    corners = [px[0, 0][:3], px[w - 1, 0][:3], px[0, h - 1][:3], px[w - 1, h - 1][:3]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def near_bg(x, y):
        r, g, b, _ = px[x, y]
        return abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < 90

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and near_bg(x, y):
                seen[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and near_bg(x, y):
                seen[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = px[x, y][:3] + (0,)
        for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and near_bg(nx, ny):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    return im


def has_alpha(im):
    a = im.getchannel("A")
    lo, hi = a.getextrema()
    return lo < 250  # anything below fully-opaque pixels present


def flood_white_out(im):
    """Make background reachable from the border transparent; keep interior whites."""
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()

    def is_white(x, y):
        r, g, b, _ = px[x, y]
        return r >= WHITE_T and g >= WHITE_T and b >= WHITE_T

    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and is_white(x, y):
                seen[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and is_white(x, y):
                seen[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = px[x, y][:3] + (0,)
        for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_white(nx, ny):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    return im


def process(src, dst, special=False):
    im = Image.open(src)
    im.load()
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    if special:
        im = strip_black_bars(im)
        im = flood_bg(im)
    elif not has_alpha(im):
        im = flood_white_out(im)
    bbox = im.getbbox()
    if not bbox:
        print("!! fully transparent:", src)
        return
    im = im.crop(bbox)
    w, h = im.size
    side = int(max(w, h) * (1 + 2 * EDGE_PAD))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2), im)
    if side > MAX_SIDE:
        canvas = canvas.resize((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    canvas.save(os.path.join(OUT, dst + ".png"))
    print("ok", dst, canvas.size)


os.makedirs(OUT, exist_ok=True)
for src_name, dst_name in JOBS:
    process(os.path.join(SRC, src_name), dst_name, special=src_name in SPECIAL)
