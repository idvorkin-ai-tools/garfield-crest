# /// script
# dependencies = ["pillow", "numpy", "scipy"]
# ///
"""Cut the Garfield crest PNG into its seven real components.

Run: uv run tools/segment.py   (rewrites pieces/*.png + pieces/manifest.json)

Method: the crest is a line drawing with dark outlines. Every fill region
(white / purple) enclosed by outline is a connected component. Rough
polygons + seed points assign each component to a piece; outline pixels are
then given to every piece whose fill they touch (so shared outlines stay
whole on both sides). Output: pieces/<name>.png + pieces/manifest.json.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

SRC = os.path.join(os.path.dirname(__file__), '..', 'crest.png')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'pieces')
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert('RGBA')
W, H = im.size
a = np.asarray(im).astype(np.float32)
alpha = a[..., 3]
lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
present = alpha > 40
DARK_T = 36
dark = present & (lum < DARK_T)
fill = present & ~dark

# ---- pieces: priority order, polygon (rough), seeds (override) ----
PIECES = [
    dict(name='g', label='Gothic G and base',
         poly=[(505,235),(560,0),(880,0),(1010,235),(1010,270),(900,315),(800,340),(700,345),(600,330),(510,312)],
         seeds=[]),
    dict(name='mountain', label='Mountain panel',
         poly=[(470,332),(1020,332),(1020,560),(745,660),(470,560)], seeds=[]),
    dict(name='needle', label='Space Needle panel',
         poly=[(470,560),(745,650),(745,1050),(470,900)], seeds=[]),
    dict(name='shoe', label='Winged shoe panel',
         poly=[(745,650),(1020,560),(1020,1050),(745,1050)], seeds=[]),
    dict(name='bulldog', label='Bulldog',
         poly=[(150,365),(300,350),(430,380),(485,440),(485,540),(430,650),(455,800),(470,950),(485,1040),(460,1075),(300,1075),(250,1010),(262,930),(200,930),(90,900),(40,830),(20,700),(60,560),(110,420)],
         seeds=[]),
    dict(name='banner', label='Garfield High School banner',
         poly=[(0,840),(270,840),(450,880),(600,960),(745,1040),(900,960),(1000,840),(1010,470),(1050,380),(1254,340),(1254,1254),(0,1254)],
         seeds=[]),
    dict(name='frame', label='Shield frame',
         poly=[(400,280),(1060,280),(1060,1060),(400,1060)], seeds=[]),
]
# seed overrides can be appended from seeds.json: {"piece": [[x,y],...]}
SEEDS = {'banner': [[1000, 600], [1000, 560], [995, 640], [820, 1000], [780, 1000], [860, 990]]}
for p in PIECES:
    p['seeds'] = SEEDS.get(p['name'], [])

def polymask(poly):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    return np.asarray(m) > 0

polys = [polymask(p['poly']) for p in PIECES]

labels, n = ndi.label(fill)
print('fill components:', n)
sizes = ndi.sum(np.ones_like(labels), labels, index=np.arange(1, n + 1))
assign = np.full(n + 1, -1, dtype=int)  # component -> piece index

# seeds first
for pi, p in enumerate(PIECES):
    for (x, y) in p['seeds']:
        c = labels[y, x]
        if c == 0:
            print(f'WARN seed {p["name"]} {(x,y)} is not on a fill pixel')
            continue
        assign[c] = pi
# majority by priority
for pi, pm in enumerate(polys):
    inside = ndi.sum(pm.astype(np.float32), labels, index=np.arange(1, n + 1))
    frac = inside / np.maximum(sizes, 1)
    for c in range(1, n + 1):
        if assign[c] == -1 and frac[c - 1] >= 0.6:
            assign[c] = pi
# fallback: best overlap
best = np.zeros(n + 1);
for pi, pm in enumerate(polys):
    inside = ndi.sum(pm.astype(np.float32), labels, index=np.arange(1, n + 1))
    for c in range(1, n + 1):
        if assign[c] == -1 and inside[c - 1] > best[c]:
            best[c] = inside[c - 1]; assign[c] = -(pi + 10)
for c in range(1, n + 1):
    if assign[c] <= -10:
        assign[c] = -assign[c] - 10
    elif assign[c] == -1:
        assign[c] = len(PIECES) - 1

piece_fill = [(assign[labels] == pi) & fill for pi in range(len(PIECES))]

# ---- outline pixels: give to every piece whose fill is within slack of the nearest fill ----
SLACK = 7
dists = np.stack([ndi.distance_transform_edt(~pf) for pf in piece_fill])  # (P,H,W)
mind = dists.min(axis=0)
masks = []
for pi in range(len(PIECES)):
    m = piece_fill[pi] | (dark & (dists[pi] <= mind + SLACK))
    masks.append(m)

# ---- debug map ----
colors = [(255,80,80),(80,200,80),(80,120,255),(240,200,40),(240,90,240),(60,220,220),(200,200,200)]
dbg = np.zeros((H, W, 3), np.uint8)
for pi, m in enumerate(masks):
    dbg[piece_fill[pi]] = colors[pi]
outline_only = dark.copy()
for pi in range(len(PIECES)):
    dbg[dark & masks[pi]] = (np.array(colors[pi]) * 0.45).astype(np.uint8)
Image.fromarray(dbg).save(os.path.join(OUT, '_assign.png'))

rgba = np.asarray(im).copy()

# ---- occlusion repair: the bulldog sits in front of the frame, the mountain panel and the banner's purple field ----
AX = 713  # shield symmetry axis (measured: left/right edges average 713 +/- 1 at every unoccluded row)
def mirror(arr):
    fl = arr[:, ::-1]
    out = np.zeros_like(arr)
    sh = 2 * AX - (W - 1)  # mirror(x) = 2AX - x = fl[x - sh]
    out[:, sh:] = fl[:, :W - sh]
    return out
idx = {p['name']: i for i, p in enumerate(PIECES)}
dog_zone = ndi.binary_dilation(masks[idx['bulldog']], iterations=4)
src = [rgba.copy() for _ in PIECES]
for name, hole in [('frame', [(340,330),(560,330),(560,960),(340,960)]),
                   ('mountain', [(420,360),(540,360),(540,600),(420,600)])]:
    i = idx[name]
    R = polymask(hole) & dog_zone
    mm = mirror(masks[i]); mp = mirror(rgba)
    masks[i] = np.where(R, mm, masks[i])
    src[i] = np.where(R[..., None], mp, src[i])
    print(name, 'repaired px', int((R & mm).sum()))
# banner: flat fill of the purple field behind the dog's leg
i = idx['banner']
R = polymask([(215,930),(245,905),(285,880),(330,858),(380,838),(430,822),(470,818),(470,1010),(415,1045),(300,1010),(215,965)]) & dog_zone & ~mirror(masks[idx['frame']]) & ~masks[idx['frame']]
sample = piece_fill[i] & polymask([(500,900),(700,900),(700,1000),(500,1000)]) & (lum > 40) & (lum < 120)
col = np.median(rgba[sample][:, :3], axis=0)
print('banner field fill', col, 'px', int(R.sum()))
masks[i] = masks[i] | R
src[i][R] = np.array([*col, 255], dtype=rgba.dtype)

# ---- write pieces ----
manifest = []
for pi, p in enumerate(PIECES):
    m = masks[pi]
    ys, xs = np.where(m)
    if len(xs) == 0:
        print('EMPTY', p['name']); continue
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    soft = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    soft = np.asarray(soft).astype(np.float32) / 255
    out = src[pi].astype(np.float32)
    out[..., 3] = out[..., 3] * soft
    crop = out[y0:y1, x0:x1]
    Image.fromarray(crop.astype(np.uint8)).save(os.path.join(OUT, p['name'] + '.png'))
    manifest.append(dict(name=p['name'], label=p['label'], x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0), px=int(m.sum())))
    print(f"{p['name']:8s} bbox=({x0},{y0})-({x1},{y1}) px={int(m.sum())}")
json.dump(dict(size=[W, H], pieces=manifest), open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
