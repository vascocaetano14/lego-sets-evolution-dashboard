import json, os, urllib.error, urllib.request
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "rebrickable")
OUT = os.path.join(HERE, "..", "data")
os.makedirs(OUT, exist_ok=True)

LAST_YEAR = 2026
FIRST_DECADE = 1950
MIN_ELEMENT_SETS = 5
MIN_SIGNATURE_LIFT = 2.0
ALL = 0
# sets attached directly to a theme with sub-themes go in a "<theme> (general)" node, id GENERAL + theme id
GENERAL = 100000

# part category id -> part number, or (part number, colour id)
PIECE_CHOICE = {
    14: "3023",
    11: ("3003", 4),
    19: "2431",
    3: "3039",
    37: ("11477", 71),
    67: "27925",
    20: ("3062b", 71),
    15: ("2412b", 70),
    51: "32524",
    8: "32000",
    76: "2423",
    32: "63965",
    29: "4185",
    49: "43722",
    18: "73983",
    27: "3899",
    6: "2462",
    73: "21459",
    52: "94925",
    41: "90609",
    60: "93061",
    35: "2479",
    68: "15303",
    28: "30103",
    33: "30385",
    34: "95347",
    17: "759532",
    65: "4485",
    48: "45463",
    42: "30112c",
    59: "3626apr0001",
    61: "970c28",
    71: "50231",
    1: "3867",
    39: "90754",
    43: "32212",
    74: "4491b",
    77: "14119",
    50: "722",
    62: "92198pr0125",
    64: "16925c01pr0009",
    63: "92456c01pr0379",
}
PIECES = "pieces"

def read(name, **kw):
    path = os.path.join(SRC, name + ".csv")
    if not os.path.exists(path):
        path += ".zip"
    return pd.read_csv(path, **kw)

def write(df, name):
    df.to_csv(os.path.join(OUT, name), index=False, float_format="%.10g")
    print(f"  {name:22s} {len(df):7d} rows")

print("1/5 sets")
sets = read("sets", usecols=["set_num", "name", "year", "theme_id", "num_parts"])
themes = read("themes")
inv = read("inventories")
ip = read("inventory_parts", usecols=["inventory_id", "part_num", "color_id", "quantity", "is_spare", "img_url"])
parts = read("parts", usecols=["part_num", "name", "part_cat_id"])
colors = read("colors", usecols=["id", "name", "rgb", "is_trans"])
im = read("inventory_minifigs", usecols=["inventory_id", "quantity"])
pcat = read("part_categories")

# first inventory version = the set as originally released
inv = inv.sort_values("version").drop_duplicates("set_num")
sets = sets.merge(inv[["set_num", "id"]].rename(columns={"id": "inventory_id"}), on="set_num")
sets = sets[(sets.num_parts > 0) & (sets.year <= LAST_YEAR)].copy()
sets["decade"] = np.maximum((sets.year // 10) * 10, FIRST_DECADE)

ip = ip[~ip.is_spare.astype(str).str.lower().isin(["t", "true"])]
ip_all = ip
ip = ip[ip.inventory_id.isin(sets.inventory_id)]
ip = ip.merge(parts, on="part_num", how="left").merge(
    colors.rename(columns={"id": "color_id", "name": "color_name"})[["color_id", "color_name"]], on="color_id", how="left")

g = ip.groupby("inventory_id")
per_inv = pd.DataFrame({
    "color_diversity": g.color_id.nunique(),
    "part_cat_diversity": g.part_cat_id.nunique(),
    "total_qty": g.quantity.sum(),
})
top_part = (ip.groupby(["inventory_id", "name"]).quantity.sum().reset_index()
              .sort_values(["inventory_id", "quantity"], ascending=[True, False]).drop_duplicates("inventory_id"))
top_color = (ip.groupby(["inventory_id", "color_name"]).quantity.sum().reset_index()
               .sort_values(["inventory_id", "quantity"], ascending=[True, False]).drop_duplicates("inventory_id"))
per_inv["top_part_name"] = top_part.set_index("inventory_id").name
per_inv["top_part_qty"] = top_part.set_index("inventory_id").quantity
per_inv["top_color_name"] = top_color.set_index("inventory_id").color_name
per_inv["top_part_share"] = (per_inv.top_part_qty / per_inv.total_qty).round(4)

sets = sets.merge(per_inv.drop(columns=["total_qty", "top_part_qty"]), left_on="inventory_id", right_index=True, how="left")
sets["minifig_count"] = sets.inventory_id.map(im.groupby("inventory_id").quantity.sum()).fillna(0).astype(int)

cat_qty = ip.groupby("part_cat_id").quantity.sum().sort_values(ascending=False)
all_cats = [int(c) for c in cat_qty.index]
ip["cat_key"] = "q_cat_" + ip.part_cat_id.astype(int).astype(str)
CAT_KEYS = [f"q_cat_{c}" for c in all_cats]
per_cat = ip.pivot_table(index="inventory_id", columns="cat_key", values="quantity", aggfunc="sum", fill_value=0)
sets = sets.merge(per_cat.reindex(columns=CAT_KEYS, fill_value=0), left_on="inventory_id", right_index=True, how="left")
sets[CAT_KEYS] = sets[CAT_KEYS].fillna(0).astype(int)
cat_name = dict(zip(pcat.id.astype(int), pcat.name))
part_categories = [dict(key=f"q_cat_{c}", id=c, name=cat_name[c]) for c in all_cats]

print("2/5 theme tree")
parent = {int(r.id): (None if pd.isna(r.parent_id) else int(r.parent_id)) for r in themes.itertuples()}
tname = dict(zip(themes.id.astype(int), themes.name))
has_children = {p for p in parent.values() if p is not None}

def chain(t):
    c = [t]
    while parent.get(c[-1]) is not None:
        c.append(parent[c[-1]])
    return c

used = sorted(set(sets.theme_id.astype(int)))
nodes = {ALL: dict(node_id=ALL, name="All themes", parent_id=None, root_id=None, depth=-1, is_general=False)}
for t in used:
    c = chain(t)
    for i, n in enumerate(c):
        nodes.setdefault(n, dict(node_id=n, name=tname[n], parent_id=parent[n] if parent[n] is not None else ALL,
                                 root_id=c[-1], depth=len(c) - 1 - i, is_general=False))
    if t in has_children:
        nodes[GENERAL + t] = dict(node_id=GENERAL + t, name=f"{tname[t]} (general)", parent_id=t,
                                  root_id=c[-1], depth=len(c), is_general=True)

def path(n):
    out = []
    while n not in (None, ALL):
        out.append(nodes[n]["name"]); n = nodes[n]["parent_id"]
    return " > ".join(reversed(out)) or "All themes"

tree = pd.DataFrame(nodes.values())
tree["path"] = tree.node_id.map(path)
tree["n_children"] = tree.node_id.map(tree.parent_id.value_counts()).fillna(0).astype(int)

sets["theme_name"] = sets.theme_id.map(tname)
sets["leaf_node_id"] = sets.theme_id.map(lambda t: GENERAL + t if t in has_children else t)
sets["root_id"] = sets.theme_id.map(lambda t: chain(t)[-1])
sets["root_theme_name"] = sets.root_id.map(tname)

print("3/5 aggregates")

def ancestors(n):
    out = []
    while n is not None:
        out.append(n); n = nodes[n]["parent_id"]
    return out
anc = pd.DataFrame([(l, a) for l in sets.leaf_node_id.unique() for a in ancestors(l)], columns=["leaf_node_id", "node_id"])
tree_year = (sets.merge(anc, on="leaf_node_id").groupby(["node_id", "year"])
                 .agg(n_sets=("set_num", "size"), n_parts=("num_parts", "sum")).reset_index())

scope = pd.concat([sets.assign(node_id=sets.root_id), sets.assign(node_id=ALL)])
scope["x"] = np.log10(scope.num_parts)
ok = scope.color_diversity > 0
scope["yc"] = np.log10(scope.color_diversity.where(ok))
scope["yk"] = np.log10(scope.part_cat_diversity.where(ok))

def box(s):
    q1, med, q3 = np.quantile(s, [.25, .5, .75])
    lo, hi = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
    return pd.Series(dict(p_q1=q1, p_median=med, p_q3=q3, p_whisk_lo=s[s >= lo].min(), p_whisk_hi=s[s <= hi].max()))

gy = scope.groupby(["node_id", "year"])
root_year = gy.agg(n_sets=("set_num", "size"), n_parts=("num_parts", "sum"),
                   n_minifig_sets=("minifig_count", lambda s: int((s > 0).sum()))).reset_index()
root_year = root_year.merge(gy.num_parts.apply(box).unstack().reset_index(), on=["node_id", "year"])
root_year = root_year.merge(gy[CAT_KEYS].sum().reset_index(), on=["node_id", "year"])
f = scope[ok].assign(c=lambda d: d.color_diversity, k=lambda d: d.part_cat_diversity, xx=lambda d: d.x ** 2,
                     cc=lambda d: d.c ** 2, xc=lambda d: d.x * d.c, kk=lambda d: d.k ** 2, xk=lambda d: d.x * d.k)
# sums per year so the browser can fit the trend for any period
sums = f.groupby(["node_id", "year"]).agg(
    n_fit=("x", "size"), sum_x=("x", "sum"), sum_xx=("xx", "sum"),
    sum_c=("c", "sum"), sum_cc=("cc", "sum"), sum_xc=("xc", "sum"),
    sum_k=("k", "sum"), sum_kk=("kk", "sum"), sum_xk=("xk", "sum"),
    sum_yc=("yc", "sum"), sum_yk=("yk", "sum")).reset_index()
root_year = root_year.merge(sums, on=["node_id", "year"], how="left").fillna(0)
root_year["n_fit"] = root_year.n_fit.astype(int)

rd = sets.groupby(["root_id", "decade"]).agg(n_sets=("set_num", "size"), n_parts=("num_parts", "sum")).reset_index()
for m in ("sets", "parts"):
    rd[f"share_{m}"] = rd[f"n_{m}"] / rd.groupby("decade")[f"n_{m}"].transform("sum")
    rd[f"rank_{m}"] = rd.groupby("decade")[f"n_{m}"].rank(ascending=False, method="first").astype(int)
root_decade = rd.sort_values(["decade", "rank_sets"])

print("4/5 vocabulary")
el = ip[["inventory_id", "part_num", "color_id"]].drop_duplicates()
el = el.merge(sets[["inventory_id", "root_id"]], on="inventory_id")
n_all, n_root = len(sets), sets.groupby("root_id").size()
glob = el.groupby(["part_num", "color_id"]).size().rename("sets_all")
te = el.groupby(["root_id", "part_num", "color_id"]).size().rename("sets").reset_index()
te = te[te.sets >= MIN_ELEMENT_SETS].merge(glob, on=["part_num", "color_id"])
te["coverage"] = te.sets / te.root_id.map(n_root)
te["lift"] = te.coverage / (te.sets_all / n_all)
te = te.merge(parts[["part_num", "name"]].rename(columns={"name": "part_name"}), on="part_num") \
       .merge(colors.rename(columns={"id": "color_id", "name": "color_name"}), on="color_id")
te["element"] = te.part_name + " · " + te.color_name

cand = te[te.lift >= MIN_SIGNATURE_LIFT].assign(score=lambda d: d.coverage * np.log(d.lift))
signature = cand.sort_values("score", ascending=False).drop_duplicates("root_id")
signature = signature.assign(root_theme_name=signature.root_id.map(tname))[
    ["root_id", "root_theme_name", "element", "part_num", "part_name", "color_id", "color_name", "rgb", "is_trans",
     "sets", "coverage", "lift"]].sort_values("root_theme_name")


os.makedirs(os.path.join(OUT, PIECES), exist_ok=True)
KIND_ORDER = {"ldraw": 0, "elements": 1, "photos": 2}
CDN = "https://cdn.rebrickable.com/media/parts"
part_use = ip.groupby(["part_cat_id", "part_num"]).quantity.sum().reset_index()
colour_use = ip_all.groupby(["part_num", "color_id"]).quantity.sum().reset_index()
linked = ip_all.dropna(subset=["img_url"]).drop_duplicates(["part_num", "color_id", "img_url"])
linked = linked.assign(kind=linked.img_url.str.extract(r"/media/parts/(\w+)/", expand=False).map(KIND_ORDER).fillna(9))
part_name = dict(zip(parts.part_num, parts.name))
colour_name = dict(zip(colors.id, colors.name))

def download(url, dest, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "VI-Project build_dataset.py"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
            open(dest, "wb").write(body)
            return True
        except urllib.error.HTTPError:
            return False
        except Exception:
            if i == tries - 1:
                print(f"  ! could not download {url}")
    return False

def piece_picture(part_num, colour_first=None):
    """(file name in data/pieces, colour id) of a part's picture, downloading it if needed; (None, None) if none.
    colour_first: the colour asked for (PIECE_CHOICE); without a picture in it, the usual colours follow."""
    colours = list(colour_use[colour_use.part_num == part_num].sort_values("quantity", ascending=False).color_id.astype(int))
    if colour_first is not None:
        colours = [colour_first] + [c for c in colours if c != colour_first]
    for colour in colours:
        here = linked[(linked.part_num == part_num) & (linked.color_id == colour)].sort_values("kind").img_url
        # the 500px renders first, they stay sharp when enlarged
        for url in [f"{CDN}/ldraw/{colour}/{part_num}.png", *here]:
            fname = f"{part_num}_{colour}{os.path.splitext(url)[1].lower() or '.jpg'}"
            dest = os.path.join(OUT, PIECES, fname)
            if os.path.exists(dest) or download(url, dest):
                return fname, colour
    return None, None

for c in part_categories:
    choice, colour_first = PIECE_CHOICE.get(c["id"]), None
    if isinstance(choice, tuple):
        choice, colour_first = choice
    if choice is None:
        choice = part_use[part_use.part_cat_id == c["id"]].sort_values("quantity", ascending=False).part_num.iloc[0]
    fname, colour = piece_picture(choice, colour_first)
    c["piece"] = dict(part_num=choice, name=part_name.get(choice, choice),
                      colour=colour_name.get(colour), img=f"data/{PIECES}/{fname}" if fname else None)
used = {os.path.basename(c["piece"]["img"]) for c in part_categories if c["piece"]["img"]}
for f in os.listdir(os.path.join(OUT, PIECES)):
    if f not in used:
        os.remove(os.path.join(OUT, PIECES, f))
print(f"  {len(used)} piece pictures in data/{PIECES}/ ({len(part_categories) - len(used)} categories without one)")

print("5/5 write")
write(sets[["set_num", "name", "year", "decade", "num_parts", "theme_id", "theme_name", "leaf_node_id", "root_id",
            "root_theme_name", "color_diversity", "part_cat_diversity", "minifig_count",
            "top_part_name", "top_color_name", "top_part_share"]].sort_values("set_num"), "sets.csv")
write(tree.astype({"parent_id": "Int64", "root_id": "Int64"}), "themes.csv")
write(tree_year.sort_values(["node_id", "year"]), "tree_year.csv")
write(root_year.sort_values(["node_id", "year"]), "root_year.csv")
write(root_decade, "root_decade.csv")
write(signature, "theme_signature.csv")

meta = dict(
    years=[int(sets.year.min()), int(sets.year.max())], last_year_is_partial=True,
    decades=sorted(int(d) for d in sets.decade.unique()),
    n_sets=int(len(sets)), n_sets_with_inventory_parts=int((sets.color_diversity > 0).sum()),
    n_root_themes=int((tree.depth == 0).sum()), n_tree_nodes=int(len(tree)),
    all_node_id=ALL, general_node_offset=GENERAL,
    min_element_sets=MIN_ELEMENT_SETS, min_signature_lift=MIN_SIGNATURE_LIFT,
    part_categories=part_categories,
)
json.dump(meta, open(os.path.join(OUT, "metadata.json"), "w"), indent=1)
print("  metadata.json", meta)
