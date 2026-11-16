"""
Rebuilds src/lib/slicer/creality-print.json from Creality Print's own source code, so the website's print
settings match the slicer the shop uses: same categories, groups, fields, order, dropdown choices, simple/advanced
split, and the stock profile defaults for the shop's printers.

Usage (from the squiggle folder), after cloning the matching release of Creality Print:

    git clone --depth 1 --branch v7.3.2 https://github.com/CrealityOfficial/CrealityPrint /tmp/CrealityPrint
    python3 scripts/extract_creality_print.py /tmp/CrealityPrint src/lib/slicer/creality-print.json 7.3.2

The show/hide rules in src/lib/slicer/visibility.ts are ported by hand from
src/slic3r/GUI/ConfigManipulation.cpp (toggle_print_fff_options); re-check them when changing versions.
"""
import json, re, sys, os
SRC = sys.argv[1]; OUT = sys.argv[2]
tab = open(f"{SRC}/src/slic3r/GUI/Tab.cpp", encoding="utf-8", errors="replace").read()
cfg = open(f"{SRC}/src/libslic3r/PrintConfig.cpp", encoding="utf-8", errors="replace").read()

# ---------- 1. the tree, from TabPrint::build ----------
start = tab.index("void TabPrint::build()")
end = tab.index("\nvoid TabPrint::", start + 10)
pages = []; page = group = None
for raw in tab[start:end].splitlines():
    line = raw.strip()
    if line.startswith("//"): continue
    line = re.sub(r"//.*$", "", line)
    m = re.search(r'add_options_page\(L\("([^"]+)"\)', line)
    if m: page = {"title": m.group(1), "groups": []}; pages.append(page); group = None; continue
    m = re.search(r'new_optgroup\(L\("([^"]+)"\)', line)
    if m and page is not None: group = {"title": m.group(1), "options": []}; page["groups"].append(group); continue
    if group is None: continue
    for key in re.findall(r'(?:append_single_option_line|get_option)\(\s*"([a-z0-9_]+)"', line):
        if key not in group["options"]: group["options"].append(key)

# ---------- 2. field definitions, from PrintConfig.cpp ----------
def strings(expr):
    """Join adjacent C string literals in an expression."""
    parts = re.findall(r'"((?:[^"\\]|\\.)*)"', expr)
    s = "".join(parts)
    return s.replace('\\n', '\n').replace('\\"', '"').replace("\\'", "'").replace('\\\\', '\\')

enum_ident = {}  # C++ enumerator -> config string, from the s_keys_map tables
for m in re.finditer(r'\{\s*"([^"]+)"\s*,\s*(?:int\()?\s*((?:\w+::)*\w+)\s*\)?\s*\}', cfg):
    enum_ident.setdefault(m.group(2), m.group(1))                  # fully qualified, e.g. NoiseType::Classic
    enum_ident.setdefault(m.group(2).split("::")[-1], m.group(1))  # bare, e.g. ipGrid
alias = {v: k for v, k in re.findall(r'(\w+)\s*=\s*def\s*=\s*this->add(?:_nullable)?\(\s*"(\w+)"', cfg)}  # def_x = def = add("key")

defs = {}
blocks = list(re.finditer(r'def\s*=\s*this->add(?:_nullable)?\(\s*"(\w+)"\s*,\s*(co\w+)\s*\)\s*;', cfg))
for i, m in enumerate(blocks):
    key, typ = m.group(1), m.group(2)
    body = cfg[m.end(): blocks[i + 1].start() if i + 1 < len(blocks) else m.end() + 6000]
    body = "\n".join(l for l in body.splitlines() if not l.strip().startswith("//"))
    d = {"type": typ}
    def field(name):
        mm = re.search(r'def->' + name + r'\s*=\s*(.*?);', body, re.S)
        return mm.group(1) if mm else None
    for name in ("label", "tooltip", "sidetext", "category"):
        v = field(name)
        if v is not None: d[name] = strings(v)
    for name in ("min", "max"):
        v = field(name)
        if v is not None:
            try: d[name] = float(v)
            except ValueError: pass
    v = field("mode")
    d["mode"] = {"comAdvanced": "advanced", "comDevelop": "develop"}.get((v or "").strip(), "simple")
    values = re.findall(r'def->enum_values\.(?:push_back|emplace_back)\(\s*"([^"]*)"\s*\)', body)
    labels = [strings(x) for x in re.findall(r'def->enum_labels\.(?:push_back|emplace_back)\((.*?)\)\s*;', body, re.S)]
    mm = re.search(r'def->enum_values\s*=\s*(\w+)->enum_values', body)
    if mm and not values and alias.get(mm.group(1)) in defs: d["enum"] = defs[alias[mm.group(1)]].get("enum", [])
    if values: d["enum"] = [{"value": v, "label": (labels[j] if j < len(labels) and labels[j] else v)} for j, v in enumerate(values)]
    mm = re.search(r'set_default_value\(\s*new\s+ConfigOption(\w+)(?:<[^>]*>)?\s*[\({](.*?)[\)}]\s*\)\s*;', body, re.S)
    if mm:
        kind, arg = mm.group(1), mm.group(2).strip()
        if kind == "Bool": d["default"] = "1" if arg.startswith("true") else "0"
        elif kind in ("Float", "Int", "Percent"):
            try: d["default"] = ("%g" % float(arg.rstrip("f"))) + ("%" if kind == "Percent" else "")
            except ValueError: pass
        elif kind == "FloatOrPercent":
            a = [x.strip() for x in arg.split(",")]
            try: d["default"] = ("%g" % float(a[0].rstrip("f."))) + ("%" if len(a) > 1 and a[1] == "true" else "")
            except ValueError: pass
        elif kind == "Enum":
            ident = arg if arg in enum_ident else arg.split("::")[-1]
            if ident in enum_ident: d["default"] = enum_ident[ident]
        elif kind == "String": d["default"] = strings(arg)
    defs.setdefault(key, d)

# ---------- 3. stock K1 profiles, with inheritance resolved ----------
PDIR = f"{SRC}/resources/profiles/Creality/process"
def load(name):
    path = f"{PDIR}/{name}.json"
    d = json.load(open(path, encoding="utf-8"))
    base = load(d["inherits"]) if d.get("inherits") else {}
    base.update(d); return base
# The shop's printers: the K1 for single-color prints, the K2 (with CFS) for full-color prints.
PRINTERS = [("k1", "Creality K1 0.4 nozzle", ["0.08", "0.16", "0.20", "0.24"]),
            ("k2", "Creality K2 0.4 nozzle", ["0.08", "0.12", "0.16", "0.20", "0.24", "0.28"])]
presets = {pid: [(h, f"{h}mm Standard @{pname}", load(f"{h}mm Standard @{pname}")) for h in heights] for pid, pname, heights in PRINTERS}

# ---------- 4. the trimmed file the website uses ----------
VERSION = sys.argv[3] if len(sys.argv) > 3 else "unknown"
# Left out on purpose: developer-only fields, and free-text fields (file names, notes, and post-processing
# scripts, which are commands that would run on the slicing computer and must never come from a customer).
TEXT = ("coString", "coStrings")
KIND = {"coBool": "bool", "coBools": "bool", "coInt": "int", "coInts": "int", "coFloat": "float", "coFloats": "float",
        "coPercent": "percent", "coPercents": "percent", "coFloatOrPercent": "floatOrPercent",
        "coFloatsOrPercents": "floatOrPercent", "coEnum": "enum", "coEnums": "enum"}
def scalar(v):
    if isinstance(v, list): v = v[0] if v else ""
    v = str(v)
    return "" if v == "nil" else v
out_pages, kept, skipped = [], [], []
for p in pages:
    groups = []
    for g in p["groups"]:
        fields = []
        for k in g["options"]:
            d = defs[k]
            if d["mode"] == "develop" or d["type"] in TEXT or d["type"] not in KIND: skipped.append(k); continue
            f = {"key": k, "label": d.get("label") or k, "type": KIND[d["type"]], "mode": "s" if d["mode"] == "simple" else "a"}
            if d.get("sidetext"): f["unit"] = d["sidetext"]
            if d.get("tooltip"): f["tip"] = " ".join(d["tooltip"].split())[:400]
            for b in ("min", "max"):
                if b in d and abs(d[b]) < 1e9: f[b] = d[b]
            if d.get("enum"): f["options"] = [[e["value"], e["label"]] for e in d["enum"]]
            if "default" in d: f["def"] = d["default"]
            fields.append(f); kept.append(k)
        if fields: groups.append({"title": g["title"], "fields": fields})
    if groups: out_pages.append({"title": p["title"], "groups": groups})
printers = [{"id": pid, "name": pname,
             "profiles": [{"id": h, "name": n, "values": {k: scalar(v[k]) for k in kept if k in v}} for h, n, v in presets[pid]]}
            for pid, pname, _ in PRINTERS]
json.dump({"slicer": "Creality Print", "version": VERSION, "printers": printers, "pages": out_pages},
          open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("kept", len(kept), "fields; left out:", skipped)
sys.exit(0)
keys = [k for p in pages for g in p["groups"] for k in g["options"]]
missing = [k for k in keys if k not in defs]
print("pages:", [(p["title"], len(p["groups"]), sum(len(g["options"]) for g in p["groups"])) for p in pages])
print("fields in tree:", len(keys), "| defined:", len(keys) - len(missing), "| missing defs:", missing)
from collections import Counter
print("modes:", Counter(defs[k]["mode"] for k in keys if k in defs))
print("types:", Counter(defs[k]["type"] for k in keys if k in defs))
