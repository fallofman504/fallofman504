#!/usr/bin/env python3
"""Generates the 3D-printable carrier board for the Simple Lamp.

    python3 make_board.py

Writes, next to this file:
    carrier_board.stl     the board, oriented for printing (wiring side up)
    carrier_board.png     top view (parts) and bottom view (wiring channels)
    carrier_wiring.md     which pad joins which, channel by channel

The board is a flat plate. Parts sit on the top face with their legs pushed
through holes. On the bottom face every connection is a channel, 2 mm wide
and 2 mm deep: bend the legs into the channels, lay bare wire along them and
solder.

Everything is laid out on a 0.635 mm grid (a quarter of the 2.54 mm pin
pitch). To change a part or move it, edit place() below and run the script
again: the channels are routed automatically and the script stops with a
message if a connection no longer fits.
"""
import heapq
import pathlib
import random
import sys

import numpy as np

G = 0.635            # grid, mm
W, H = 134, 98       # board size in grid cells (85.1 x 62.2 mm)
T_FLOOR = 2.0        # plate left above the channels, mm
CH_W = 2.0           # channel width, mm
CH_D = 2.0           # channel depth, mm
ENGRAVE = 0.4        # depth of the part outlines and names on the top face, mm
CORNER_R = 3.0       # board corner radius, mm
MIN_GAP = 4          # cells between centre lines of different connections (2.54 mm -> 0.54 mm wall)
EDGE = 4             # cells kept clear along the board edge

HOLE_LEG = 1.4       # resistor, diode, transistor and header pins
HOLE_WIRE = 1.8      # wires to modules, buttons, switch, LEDs
HOLE_MOUNT = 3.4     # M3 screws

pads = []            # dict(ref, pin, x, y, net, d)
bodies = []          # dict(ref, x0, y0, x1, y1, label): part outline on the top face
NC = "-"             # a hole that is there but joins nothing


def pad(ref, pin, x, y, net, d=HOLE_LEG):
    pads.append(dict(ref=ref, pin=pin, x=x, y=y, net=net, d=d))


def body(ref, x0, y0, x1, y1, label=None):
    bodies.append(dict(ref=ref, x0=min(x0, x1), y0=min(y0, y1), x1=max(x0, x1), y1=max(y0, y1), label=label or ref))


def two_leg(ref, x, y, dx, dy, net_a, net_b, label=None):
    """Resistor, diode or wire link: leg a at (x, y), leg b at (x+dx, y+dy)."""
    pad(ref, "a", x, y, net_a)
    pad(ref, "b", x + dx, y + dy, net_b)
    body(ref, x - 1.6, y - 1.6, x + dx + 1.6, y + dy + 1.6, label)


def three_leg(ref, x, y, dx, dy, names, nets, label=None, depth=4):
    """Transistor: three legs in a row, 2.54 mm apart, starting at (x, y)."""
    for i in range(3):
        pad(ref, names[i], x + dx * i, y + dy * i, nets[i])
    if dx:
        body(ref, x - 3, y - depth / 2, x + 2 * dx + 3, y + depth / 2, label)
    else:
        body(ref, x - depth / 2, y - 3, x + depth / 2, y + 2 * dy + 3, label)


guides = []          # (net, [(x, y), ...]) runs fixed by hand


def guide(net, pts):
    guides.append((net, pts))


def wire(ref, x, y, net, label=None):
    pad(ref, "w", x, y, net, HOLE_WIRE)
    bodies.append(dict(ref=ref, x0=x, y0=y, x1=x, y1=y, label=label or ref, point=True))


# ----------------------------------------------------------------------------
#  Placement and netlist. Coordinates are grid cells, seen from the TOP
#  (component side), x to the right, y up. 4 cells = 2.54 mm.
# ----------------------------------------------------------------------------
def place():
    # --- ESP32-C3 SuperMini, USB socket towards the left edge ----------------
    # Two rows of 8 pins, 15.24 mm apart. Seen from the top with USB on the left:
    top = ["5V", "GND", "3V3", "G4", "G3", "G2", "G1", "G0"]
    bot = ["G5", "G6", "G7", "G8", "G9", "G10", "G20", "G21"]
    net_of = {"5V": "V5C", "GND": "GND", "G4": "BTN_GROUP", "G3": "BTN_LAMP", "G1": "USB_SENSE",
              "G0": "BATT_SENSE", "G5": "LED_EN", "G6": "DATA_3V", "G7": "PWM_A", "G20": "PWM_B"}
    for i in range(8):
        pad("U1", top[i], 10 + 4 * i, 38, net_of.get(top[i], NC))
        pad("U1", bot[i], 10 + 4 * i, 14, net_of.get(bot[i], NC))
    body("U1", 4, 12, 40, 40, "ESP32-C3 SuperMini")

    # --- TP4056 charger module (with protection), USB socket at the top edge -
    # Battery wires solder straight onto the module's B+ / B- pads.
    pad("M1", "IN+", 24, 94, "USB_5V", HOLE_WIRE)
    pad("M1", "OUT+", 24, 57, "BAT_OUT", HOLE_WIRE)
    pad("M1", "OUT-", 4, 57, "GND", HOLE_WIRE)
    body("M1", 0.5, 54, 27.5, 98, "TP4056")

    # --- 5 V boost module (MT3608 size): output end on the left --------------
    # Its two minus pads are joined on the module, so only VIN- is wired.
    pad("M2", "VOUT+", 73, 71, "LED_5V", HOLE_WIRE)
    pad("M2", "VIN+", 125, 71, "BOOST_IN", HOLE_WIRE)
    pad("M2", "VIN-", 125, 91, "GND", HOLE_WIRE)
    body("M2", 70, 68, 128, 95, "5V boost")

    # --- master switch: two wires to the hidden on/off switch ---------------
    wire("SW-a", 30, 57, "BAT_OUT", "SWITCH")
    wire("SW-b", 54, 60, "VSW", "SWITCH")

    # --- C3 supply through a Schottky diode (so the C3's own USB can't push
    #     current back into the battery) ------------------------------------
    two_leg("D1", 48, 56, 0, -16, "VSW", "V5C", "D1 1N5817")

    # --- battery sense divider and USB sense divider --------------------------
    two_leg("R1", 42, 64, 0, -16, "VSW", "BATT_SENSE", "R1 220k")
    two_leg("R2", 38, 44, -20, 0, "BATT_SENSE", "GND", "R2 220k")
    two_leg("R3", 32, 90, 0, -20, "USB_5V", "USB_SENSE", "R3 10k")
    two_leg("R4", 34, 52, -20, 0, "USB_SENSE", "GND", "R4 20k")

    # --- LED power switch: 2N7000 pulls the gate of a P-channel MOSFET low ---
    three_leg("Q2", 106, 54, 4, 0, ["S", "D", "G"], ["VSW", "BOOST_IN", "PGATE"], "Q2 P-FET", depth=7)
    two_leg("R7", 102, 46, 16, 0, "VSW", "PGATE", "R7 100k")
    three_leg("Q1", 114, 34, 4, 0, ["D", "G", "S"], ["PGATE", "LED_EN", "GND"], "Q1 2N7000", depth=6)
    two_leg("R6", 106, 30, 0, -16, "LED_EN", "GND", "R6 100k")

    # --- level shifter for pixel data: 74AHCT125, DIP-14 ---------------------
    # Unused gates are parked: their inputs and enables tied to 5 V or GND.
    ux, uy = 78, 22          # pin 1
    u2 = {1: "GND", 2: "DATA_3V", 3: "DATA_5V", 4: "GND", 5: "GND", 6: NC, 7: "GND",
          8: NC, 9: "LED_5V", 10: "LED_5V", 11: NC, 12: "LED_5V", 13: "LED_5V", 14: "LED_5V"}
    for i in range(7):
        pad("U2", str(i + 1), ux + 4 * i, uy, u2[i + 1])
        pad("U2", str(14 - i), ux + 4 * i, uy + 12, u2[14 - i])
    body("U2", ux - 2, uy, ux + 26, uy + 12, "U2 74AHCT125")
    two_leg("R5", 112, 26, 0, -16, "DATA_5V", "DATA_OUT", "R5 330R")

    # --- plain-strip MOSFETs (only fitted on strip lamps) --------------------
    three_leg("Q4", 46, 14, 4, 0, ["G", "D", "S"], ["PWM_B", "STRIP_B", "GND"], "Q4 N-FET", depth=7)
    three_leg("Q3", 62, 14, 4, 0, ["G", "D", "S"], ["PWM_A", "STRIP_A", "GND"], "Q3 N-FET", depth=7)

    # --- wires off the board ------------------------------------------------
    wire("BTN-L", 26, 48, "BTN_LAMP", "LAMP")
    wire("BTN-G", 22, 48, "BTN_GROUP", "GRP")
    wire("BTN-0", 18, 48, "GND", "GND")
    wire("LED+", 106, 38, "LED_5V", "LED 5V")
    wire("LED-D", 116, 10, "DATA_OUT", "DATA")
    wire("LED-G", 122, 10, "GND", "GND")
    wire("STR-A", 66, 10, "STRIP_A", "WARM-")
    wire("STR-B", 50, 10, "STRIP_B", "COOL-")

    # --- mounting holes -------------------------------------------------------
    for x, y in [(40, 88), (62, 46), (93, 58)]:
        pad("MH", "", x, y, NC, HOLE_MOUNT)

    # --- fixed runs, laid down before the rest is routed automatically -------
    # Ground: down the left edge, along the bottom, up the right edge.
    guide("GND", [(4, 57), (6, 55), (6, 8), (8, 6), (127, 6), (129, 8), (129, 87), (125, 91)])
    guide("GND", [(6, 42), (14, 42), (14, 38)])
    # The C3's bottom-row pins leave between its two rows, towards the right.
    guide("V5C", [(10, 38), (10, 34), (42, 34)])
    guide("LED_EN", [(10, 14), (10, 30), (118, 30), (118, 34)])     # on through the middle of U2
    guide("DATA_3V", [(14, 14), (14, 26), (82, 26), (82, 22)])
    guide("DATA_5V", [(86, 22), (86, 26), (112, 26)])
    guide("PWM_A", [(18, 14), (18, 22), (42, 22)])
    guide("PWM_B", [(34, 14), (34, 18), (42, 18)])
    guide("PGATE", [(114, 34), (114, 54)])
    guide("LED_5V", [(73, 71), (73, 43), (78, 38), (106, 38)])
    # Switched battery supply runs under the boost module to the P-FET.
    guide("VSW", [(54, 60), (69, 75), (73, 79), (102, 79), (106, 75), (106, 54)])


# ----------------------------------------------------------------------------
#  Router: every connection becomes a path on the grid, on one layer, never
#  closer than MIN_GAP cells to a different connection or to a foreign hole.
# ----------------------------------------------------------------------------
DEBUG = False
DIRS = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]


def dilate(mask, r):
    out = np.zeros_like(mask)
    w, h = mask.shape
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            xs, xe = max(0, dx), min(w, w + dx)
            ys, ye = max(0, dy), min(h, h + dy)
            out[xs:xe, ys:ye] |= mask[xs - dx:xe - dx, ys - dy:ye - dy]
    return out


def keepout_radius(p):
    """Extra cells a hole pushes foreign channels away, beyond MIN_GAP."""
    return 2 if p["d"] >= 3 else 0


def route(order, seed):
    rng = random.Random(seed)
    nets = {}
    for p in pads:
        nets.setdefault(p["net"], []).append(p)
    occ = {n: np.zeros((W + 1, H + 1), bool) for n in nets}
    for n, ps in nets.items():
        for p in ps:
            r = keepout_radius(p)
            occ[n][max(0, p["x"] - r):p["x"] + r + 1, max(0, p["y"] - r):p["y"] + r + 1] = True
    border = np.ones((W + 1, H + 1), bool)
    border[EDGE:W - EDGE + 1, EDGE:H - EDGE + 1] = False
    segs = {n: [] for n in nets}
    failed = []
    guided = {n: np.zeros((W + 1, H + 1), bool) for n in nets}
    for n, pts in guides:
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            steps = max(abs(x1 - x0), abs(y1 - y0))
            assert abs(x1 - x0) in (0, steps) and abs(y1 - y0) in (0, steps), f"guide {n}: only straight or 45 degree runs"
            cells = [(x0 + (x1 - x0) * i // steps, y0 + (y1 - y0) * i // steps) for i in range(steps + 1)]
            for a, b in zip(cells, cells[1:]):
                segs[n].append((a, b))
            for x, y in cells:
                occ[n][x, y] = True
                guided[n][x, y] = True

    for n in order:
        ps = nets[n]
        if len(ps) < 2:
            continue
        others = np.zeros((W + 1, H + 1), bool)
        for m in nets:
            if m != n:
                others |= occ[m]
        blocked = dilate(others, MIN_GAP - 1) | border
        near = dilate(others, MIN_GAP + 1)
        for p in ps:
            blocked[p["x"], p["y"]] = False
        tree = guided[n].copy()
        if tree.any():
            todo = [p for p in ps if not tree[p["x"], p["y"]]]
        else:
            start = min(ps, key=lambda p: (p["x"] - W / 2) ** 2 + (p["y"] - H / 2) ** 2)
            tree[start["x"], start["y"]] = True
            todo = [p for p in ps if p is not start]
        while todo:
            targets = {(p["x"], p["y"]): p for p in todo}
            dist = {}
            prev = {}
            heap = []
            for x, y in zip(*np.nonzero(tree)):
                dist[(x, y, -1)] = 0.0
                heap.append((0.0, rng.random(), int(x), int(y), -1))
            heapq.heapify(heap)
            found = None
            while heap:
                c, _, x, y, d = heapq.heappop(heap)
                if c > dist.get((x, y, d), 1e18):
                    continue
                if (x, y) in targets:
                    found = (x, y, d)
                    break
                for nd, (dx, dy) in enumerate(DIRS):
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx > W or ny > H or blocked[nx, ny]:
                        continue
                    if d >= 0:
                        turn = min((nd - d) % 8, (d - nd) % 8)
                        if turn > 2:
                            continue
                    else:
                        turn = 0
                    step = 1.0 if dx == 0 or dy == 0 else 1.4142
                    nc = c + step + 1.2 * turn + (0.6 if near[nx, ny] else 0.0)
                    key = (nx, ny, nd)
                    if nc < dist.get(key, 1e18):
                        dist[key] = nc
                        prev[key] = (x, y, d)
                        heapq.heappush(heap, (nc, rng.random(), nx, ny, nd))
            if not found:
                if DEBUG:
                    failed.append((n, [f'{p["ref"]}.{p["pin"]}' for p in todo]))
                    break
                return None, (n, [f'{p["ref"]}.{p["pin"]}' for p in todo])
            cur = found
            path = [(cur[0], cur[1])]
            while cur in prev:
                cur = prev[cur]
                path.append((cur[0], cur[1]))
            for a, b in zip(path, path[1:]):
                segs[n].append((a, b))
            for x, y in path:
                tree[x, y] = True
                occ[n][x, y] = True
            todo.remove(targets[(found[0], found[1])])
    if failed:
        return segs, failed
    return segs, None


def route_best(tries=60):
    names = sorted({p["net"] for p in pads if p["net"] != NC})
    best, best_len, fails = None, 1e18, {}
    for seed in range(tries):
        rng = random.Random(seed)
        order = names[:]
        rng.shuffle(order)
        if seed == 0:   # first try: short connections first, ground last
            size = {n: len([p for p in pads if p["net"] == n]) for n in names}
            order.sort(key=lambda n: (n == "GND", size[n]))
        segs, fail = route(order, seed)
        if segs is None:
            fails[fail[0]] = fails.get(fail[0], 0) + 1
            continue
        length = sum(np.hypot(a[0] - b[0], a[1] - b[1]) for s in segs.values() for a, b in s)
        if length < best_len:
            best, best_len = segs, length
    return best, fails


# ----------------------------------------------------------------------------
#  Geometry
# ----------------------------------------------------------------------------
def build(segs, out_dir):
    import trimesh
    from matplotlib.textpath import TextPath
    from matplotlib.font_manager import FontProperties
    from shapely import affinity
    from shapely.geometry import LineString, Point, Polygon, box
    from shapely.ops import unary_union

    mm = lambda v: v * G
    outline = box(0, 0, mm(W), mm(H)).buffer(-CORNER_R).buffer(CORNER_R, resolution=16)

    chan = {}
    for n, ss in segs.items():
        if not ss:
            continue
        lines = [LineString([(mm(a[0]), mm(a[1])), (mm(b[0]), mm(b[1]))]) for a, b in ss]
        chan[n] = unary_union(lines).buffer(CH_W / 2, resolution=8)
    channels = unary_union(list(chan.values()))
    holes = unary_union([Point(mm(p["x"]), mm(p["y"])).buffer(p["d"] / 2, resolution=12) for p in pads])

    # checks: walls between different connections, and to foreign holes
    names = list(chan)
    wall = min(chan[a].distance(chan[b]) for i, a in enumerate(names) for b in names[i + 1:])
    hole_gap = 1e9
    for p in pads:
        c = Point(mm(p["x"]), mm(p["y"])).buffer(p["d"] / 2)
        for n in names:
            if n != p["net"]:
                hole_gap = min(hole_gap, chan[n].distance(c))
    edge_gap = channels.distance(outline.exterior)

    # top-face engraving: part outlines and names
    fp = FontProperties(family="DejaVu Sans", weight="bold")

    def text(s, x, y, size, rot=0, anchor="c"):
        if not s:
            return None
        polys = None
        for verts in TextPath((0, 0), s, size=size, prop=fp).to_polygons():
            if len(verts) < 3:
                continue
            pg = Polygon(verts).buffer(0)
            polys = pg if polys is None else polys.symmetric_difference(pg)
        if polys is None:
            return None
        x0, y0, x1, y1 = polys.bounds
        polys = affinity.translate(polys, -(x0 + x1) / 2 if anchor == "c" else -x0, -(y0 + y1) / 2)
        if rot:
            polys = affinity.rotate(polys, rot, origin=(0, 0))
        return affinity.translate(polys, x, y)

    marks = []
    for b in bodies:
        if b.get("point"):
            if b["label"]:
                t = text(b["label"], mm(b["x0"]), mm(b["y0"]) + 2.6, 1.9)
                marks.append(t)
            continue
        r = box(mm(b["x0"]), mm(b["y0"]), mm(b["x1"]), mm(b["y1"]))
        marks.append(r.exterior.buffer(0.3))
        w, h = r.bounds[2] - r.bounds[0], r.bounds[3] - r.bounds[1]
        cx, cy = (r.bounds[0] + r.bounds[2]) / 2, (r.bounds[1] + r.bounds[3]) / 2
        if min(w, h) > 8:                       # modules: name in the middle
            marks.append(text(b["label"], cx, cy, 2.6))
        elif w >= h:                            # small parts: name beside the outline
            marks.append(text(b["label"], cx, r.bounds[3] + 1.6, 1.9))
        else:
            marks.append(text(b["label"], r.bounds[2] + 1.5, cy, 1.9, rot=90))
    # pin 1 dot for the DIP, cathode bar for the diode
    for p in pads:
        if p["ref"] == "U2" and p["pin"] == "1":
            marks.append(Point(mm(p["x"]) - 2.2, mm(p["y"])).buffer(0.6))
        if p["ref"] == "D1" and p["pin"] == "b":
            marks.append(box(mm(p["x"]) - 1.6, mm(p["y"]) + 1.6, mm(p["x"]) + 1.6, mm(p["y"]) + 2.2))
    engrave = unary_union([m for m in marks if m is not None]).intersection(outline.buffer(-0.8))
    engrave = engrave.difference(holes.buffer(0.5))

    import manifold3d as m3

    def solid(shape, z0, z1):
        parts = shape.geoms if hasattr(shape, "geoms") else [shape]
        rings = []
        for pg in parts:
            if pg.area < 1e-6:
                continue
            rings.append(np.asarray(pg.exterior.coords)[:-1])
            rings += [np.asarray(r.coords)[:-1] for r in pg.interiors]
        cs = m3.CrossSection(rings, m3.FillRule.EvenOdd)
        return m3.Manifold.extrude(cs, z1 - z0).translate((0, 0, z0))

    # z = 0 is the bottom (wiring) face
    t_total = CH_D + T_FLOOR
    whole = (solid(outline.difference(channels).difference(holes), 0, CH_D)
             + solid(outline.difference(holes), CH_D, t_total - ENGRAVE)
             + solid(outline.difference(holes).difference(engrave), t_total - ENGRAVE, t_total))
    mesh = whole.to_mesh()
    board = trimesh.Trimesh(vertices=np.asarray(mesh.vert_properties)[:, :3], faces=np.asarray(mesh.tri_verts))
    # turn it over for printing: wiring side up, part names on the bed
    board.apply_transform(trimesh.transformations.rotation_matrix(np.pi, (1, 0, 0)))
    board.apply_translation((0, mm(H), t_total))
    board.export(out_dir / "carrier_board.stl")
    return dict(wall=wall, hole_gap=hole_gap, edge_gap=edge_gap, watertight=board.is_watertight,
                volume=board.volume, size=board.extents, chan=chan, outline=outline, engrave=engrave)


def draw(segs, info, out_dir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Circle, Rectangle

    mm = lambda v: v * G
    names = sorted(n for n in segs if segs[n])
    cmap = plt.get_cmap("tab20")
    color = {n: cmap(i % 20) for i, n in enumerate(names)}
    fig, axes = plt.subplots(2, 1, figsize=(15, 21))
    for ax, bottom in zip(axes, (False, True)):
        fx = (lambda x: mm(W) - x) if bottom else (lambda x: x)
        ax.add_patch(Rectangle((0, 0), mm(W), mm(H), fc="#f3efe6", ec="#333", lw=1.5))
        if bottom:
            for n in names:
                for a, b in segs[n]:
                    ax.plot([fx(mm(a[0])), fx(mm(b[0]))], [mm(a[1]), mm(b[1])], color=color[n],
                            lw=11.5, solid_capstyle="round", zorder=2)
            for n in names:   # one name per connection, at the middle of its longest straight run
                a, b = max(segs[n], key=lambda s: 0)  # placeholder, replaced below
                pts = [p for s in segs[n] for p in s]
                x, y = pts[len(pts) // 2]
                ax.text(fx(mm(x)), mm(y), n, fontsize=6.5, ha="center", va="center", zorder=5,
                        bbox=dict(fc="white", ec="none", alpha=0.75, pad=0.6))
        else:
            for n in names:
                for a, b in segs[n]:
                    ax.plot([mm(a[0]), mm(b[0])], [mm(a[1]), mm(b[1])], color="#d8d2c4", lw=11.5,
                            solid_capstyle="round", zorder=1)
            for b in bodies:
                if b.get("point"):
                    ax.text(mm(b["x0"]), mm(b["y0"]) + 1.7, b["label"], fontsize=6.5, ha="center", zorder=6)
                    continue
                ax.add_patch(Rectangle((mm(b["x0"]), mm(b["y0"])), mm(b["x1"] - b["x0"]), mm(b["y1"] - b["y0"]),
                                       fc="none", ec="#1a4f8a", lw=1.3, zorder=4))
                big = min(b["x1"] - b["x0"], b["y1"] - b["y0"]) > 12
                ax.text(mm((b["x0"] + b["x1"]) / 2), mm((b["y0"] + b["y1"]) / 2) if big else mm(b["y1"]) + 0.5,
                        b["label"], fontsize=9 if big else 6.5, ha="center", va="center" if big else "bottom",
                        color="#1a4f8a", zorder=6)
        for p in pads:
            x, y = fx(mm(p["x"])), mm(p["y"])
            ax.add_patch(Circle((x, y), p["d"] / 2, fc="white", ec="black", lw=0.8, zorder=7))
            if p["pin"] and p["pin"] not in ("a", "b", "w"):
                ax.text(x, y - 1.75, p["pin"], fontsize=5, ha="center", va="center", zorder=8, color="#444")
        ax.set_xlim(-2, mm(W) + 2)
        ax.set_ylim(-2, mm(H) + 2)
        ax.set_aspect("equal")
        ax.set_title("BOTTOM: wiring side, as you see it while soldering (mirrored left-right)" if bottom
                     else "TOP: component side", fontsize=13)
        ax.set_xlabel("mm")
    fig.tight_layout()
    fig.savefig(out_dir / "carrier_board.png", dpi=110)


def wiring_table(segs, out_dir):
    nets = {}
    for p in pads:
        if p["net"] != NC:
            nets.setdefault(p["net"], []).append(p)
    lines = ["# Carrier board wiring list", "",
             "One row per channel. Every pad in a row is joined by the same piece of wire.", "",
             "| Channel | Joins | Wire length |", "|---|---|---|"]
    for n in sorted(nets):
        length = sum(np.hypot(a[0] - b[0], a[1] - b[1]) for a, b in segs.get(n, [])) * G
        joins = ", ".join(f'{p["ref"]} {p["pin"]}'.replace(" w", "").replace(" a", " (a)").replace(" b", " (b)")
                          for p in nets[n])
        lines.append(f"| {n} | {joins} | {length:.0f} mm |")
    (out_dir / "carrier_wiring.md").write_text("\n".join(lines) + "\n")


def main():
    out_dir = pathlib.Path(__file__).resolve().parent
    place()
    seen = {}
    for p in pads:
        key = (p["x"], p["y"])
        if key in seen:
            sys.exit(f'Two holes in the same place: {seen[key]} and {p["ref"]} {p["pin"]}')
        seen[key] = f'{p["ref"]} {p["pin"]}'
    segs, fails = route_best(int(sys.argv[1]) if len(sys.argv) > 1 else 60)
    if segs is None:
        sys.exit(f"Could not fit these connections (connection: failed tries): {fails}")
    info = build(segs, out_dir)
    draw(segs, info, out_dir)
    wiring_table(segs, out_dir)
    print(f"board {info['size'][0]:.1f} x {info['size'][1]:.1f} x {info['size'][2]:.1f} mm, "
          f"watertight {info['watertight']}, volume {info['volume'] / 1000:.1f} cm3")
    print(f"thinnest wall between channels {info['wall']:.2f} mm, channel to foreign hole {info['hole_gap']:.2f} mm, "
          f"channel to board edge {info['edge_gap']:.2f} mm")
    if fails:
        print("orders that did not fit:", fails)


if __name__ == "__main__":
    main()
