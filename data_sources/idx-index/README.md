# IDX Index Evaluation — quarterly upload folder

Drop the three IDX index-evaluation files here, in a quarter subfolder:

```
data_sources/idx-index/YYYYQn/
    ihsg.xlsx        # "Evaluasi Index IHSG"           (COMPOSITE / IHSG constituents)
    sektor.xlsx      # "Evaluasi Index Sektor"         (11 sector indices, one sheet each)
    primbank.xlsx    # "Evaluasi Index Pefindo Prime Bank"  (PRIMBANK10)
```

`YYYYQn` is the effective quarter, e.g. `2026Q3`.

## Cadence — these are QUARTERLY, not monthly

IDX re-evaluates its indices four times a year (Mar / Jun / Sep / Dec effective).
These files change only at those points, so you upload them once a quarter — unlike
the monthly ownership files in `../idx-ownership/`.

## Where the files come from

IDX → *Pengumuman* (announcement) for the index evaluation, e.g.
`Peng-…/BEI.POP/…`. Download the IHSG, Sektor, and Pefindo Prime Bank attachments,
rename them to `ihsg.xlsx`, `sektor.xlsx`, `primbank.xlsx`, and place all three in
the quarter folder above.

## What they give

- **Authoritative IDX sector classification** (sector index membership) — the
  official source for each stock's IDX sector.
- **Index weight** (Bobot) per stock, plus the weight-change signal
  (Tetap / Naik / Turun / Baru) — "Baru" marks a new index inclusion, a catalyst.
- **Official index free float** (banded/capped for index math — context, not a
  replacement for the computed free float).

The index adapter is not wired yet; files placed here are stored safely and will be
picked up once it is built.
