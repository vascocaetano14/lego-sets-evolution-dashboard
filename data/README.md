# Data

Built by `preprocessing/build_dataset.py` from the original Rebrickable CSVs in `preprocessing/rebrickable/`. Do not edit these files by hand: change the script and run it again (about 5 seconds).

**Rule.** Anything that does not depend on user interaction is computed in advance. Anything that depends on the selected period is stored **per year as counts and sums**, so the browser only adds the rows of the selected years instead of scanning 20 055 sets. Medians and quartiles cannot be added across years, so they are stored per theme and year and read directly.

## Files

| File | One row per | Used by |
|---|---|---|
| `sets.csv` | set (20 055) | C (points, hover) |
| `themes.csv` | node of the theme tree (542) | B (zoom), names and ids everywhere |
| `tree_year.csv` | tree node × year | B (rectangle sizes, Sets or Parts) |
| `root_year.csv` | root theme × year, plus the whole catalogue (`node_id = 0`) | A (boxes), C (trend lines), D Profile, D Vocabulary |
| `root_decade.csv` | root theme × decade | D Time |
| `theme_signature.csv` | root theme (126 of 150) | D Vocabulary (row label) |
| `metadata.json` | — | year range, decades, constants, the part categories of D Vocabulary and the piece that pictures each |
| `pieces/` | one picture per part category (75 of 76) | D Vocabulary (column headers, enlarged on click) |

## `sets.csv`

`set_num`, `name`, `year`, `decade`, `num_parts`, theme (`theme_id`, `theme_name`, `leaf_node_id`, `root_id`, `root_theme_name`), and per set: `color_diversity` (distinct colours), `part_cat_diversity` (distinct part categories), `minifig_count`, `top_part_name`, `top_color_name`, `top_part_share` (share of the most frequent part). Spare parts are excluded; each set uses its original inventory (lowest version). 259 sets have no parts inventory: their colour and category columns are empty.

## `themes.csv`

`node_id` (Rebrickable theme id; `0` = whole catalogue), `name`, `parent_id`, `root_id`, `depth` (0 = root), `path` (`Star Wars > Ultimate Collector Series`), `n_children`, `is_general`.
Theme names are not unique: always join on ids. Sets attached directly to a theme that also has sub-themes go to a node `<theme> (general)` (id = 100000 + theme id), so the children of any node always add up to it.

## `tree_year.csv`

`node_id`, `year`, `n_sets`, `n_parts`. A set counts in its leaf node and in every ancestor. Treemap size for a period = sum over the selected years.

## `root_year.csv`

| Columns | Use |
|---|---|
| `n_sets`, `n_parts`, `n_minifig_sets` | Sum over the period. D Profile: minifigure share = Σ`n_minifig_sets` / Σ`n_sets` |
| `p_q1`, `p_median`, `p_q3`, `p_whisk_lo`, `p_whisk_hi` | View A boxes, read directly. Whiskers: Tukey rule (1.5 × IQR), clipped to real sets |
| `n_fit`, `sum_x`, `sum_xx`, `sum_c`, `sum_cc`, `sum_xc`, `sum_k`, `sum_kk`, `sum_xk`, `sum_yc`, `sum_yk` | Sets with an inventory only. `x = log10(parts)`, `c` = colours, `k` = part categories (not logged), `yc = log10(colours)`, `yk = log10(part categories)`. Column names spell the product: `sum_xc` = Σ x·c |
| `q_cat_<id>` × 76 | Parts (quantity, spares excluded) in each Rebrickable part category (all 76, as they are). The keys and names, largest category first, are in `metadata.json` → `part_categories`. D Vocabulary: share of a category = Σ`q_cat_k` / Σ all `q_cat_*` over the period, for the theme and for the catalogue (`node_id = 0`); "Other" = 1 − the categories shown |

Trend line and band (view C, `stats.fitTrend()`), after summing the columns over the period (`n = n_fit`). The trend is **linear in log10(parts)**, `y = a + b·u` with `u = x − mean(x)` and `y` = colours: on C's axes (parts on a log scale, colours linear) it is a straight line, and `b` is the colours added by every 10× more parts. Least squares from the sums:

```
m   = sum_x / n
Σu² = sum_xx − n·m²          Σuy = sum_xc − m·sum_c
a   = sum_c / n              b   = Σuy / Σu²
s²  = (sum_cc − a·sum_c − b·Σuy) / (n − 2)
band at x0 = a + b·u0 ± 1.96·sqrt(s² · (1/n + u0²/Σu²)),   u0 = x0 − m
```

No trend is drawn for fewer than 10 sets.

Use the `_k` columns when the y-axis shows part categories. D Profile, typical value per theme: `10^(sum_x/n_fit)` (parts), `10^(sum_yc/n_fit)` (colours), `10^(sum_yk/n_fit)` (categories), i.e. geometric means.

## `root_decade.csv`

`root_id`, `decade`, `n_sets`, `n_parts`, `share_sets`, `share_parts` (share of the decade), `rank_sets`, `rank_parts` (1 = largest). Top 10 of a decade: `rank_* ≤ 10`. "Outside the top 10" = 1 − sum of their shares (D Time's "Others" row: 1 − the sum of the shares of the rows shown).

## Vocabulary

An element is a part in a colour. For each root theme, `coverage` = share of its sets containing the element, and `lift` = coverage ÷ share of all sets containing it. Only elements found in at least 5 sets of the theme are kept.

- `theme_signature.csv`: the characteristic element of each theme: `lift ≥ 2` and the highest `coverage × ln(lift)`, so it is both distinctive and common. `rgb` is the real LEGO colour.

The theme × theme similarity file (`theme_similarity.csv`) was removed in CP4: D Vocabulary now compares each theme with the catalogue per part category (`q_cat_*` in `root_year.csv`).

## Choices

- Years after 2026 dropped (one announced set). 2026 is a partial year.
- The 5 sets from 1949 are counted in the 1950s decade.
- Sets with 0 parts are dropped (as in CP1).
- Rebrickable files not needed by any view: `elements`, `minifigs`, `inventory_sets`, `part_relationships` (`part_categories` gives the category names of D Vocabulary).

## `pieces/` and `metadata.json` → `part_categories[].piece`

One picture per part category, for D Vocabulary's column headers: `piece = { part_num, name, colour, img }`, where `img` is the path of the picture (`data/pieces/<part_num>_<colour id>.png|jpg`, relative to `index.html`) or `null` when Rebrickable has none. The piece is the one the group chose (`PIECE_CHOICE` in `build_dataset.py`, from the shortlist in `docs/piece-choices.md`; a choice may also fix the colour) or the category's most-used piece, shown in the colour it is most used in (counted over every Rebrickable inventory, minifigs and minidolls included, since some chosen pieces only appear there). `build_dataset.py` downloads a picture from Rebrickable's image server only when it is not in `pieces/` yet, preferring the 500 px renders, then LEGO's 192 px photos, then users' photos; the dashboard never goes online.
