# Rebrickable CSVs

Put the 12 CSV files from <https://rebrickable.com/downloads/> here (unzipped):

`colors.csv`, `elements.csv`, `inventories.csv`, `inventory_minifigs.csv`, `inventory_parts.csv`, `inventory_sets.csv`, `minifigs.csv`, `part_categories.csv`, `part_relationships.csv`, `parts.csv`, `sets.csv`, `themes.csv`.

They are not in Git: `inventory_parts.csv` alone is 133 MB, over GitHub's 100 MB limit. Then run, from the repository root:

```bash
python preprocessing/build_dataset.py
```

It needs Python 3 with pandas and numpy, takes a few seconds and rewrites `data/`.
