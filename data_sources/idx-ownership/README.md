# IDX Ownership — monthly upload folder

Drop the two monthly ownership files from IDX here, in a dated subfolder:

```
data_sources/idx-ownership/YYYY-MM-DD/
    satu-persen.xlsx     # "Pemegang Saham di Atas 1%"  (>1% shareholders, per holder)
    klasifikasi.xlsx     # "Berdasarkan Klasifikasi Investor"  (shares by investor type)
```

`YYYY-MM-DD` is the data date shown inside the file (the `DATE` column), not the
download date.

## Where the files come from

IDX → *Perusahaan Tercatat → Data Kepemilikan Saham* (requires an IDX login).
Download the monthly 1% file and the investor-classification file, rename them to
`satu-persen.xlsx` and `klasifikasi.xlsx`, and place both in the dated folder above.

## What happens next

The ownership adapter reads these two files and produces the combined KSEI data the
website serves — major holders + concentration from the 1% file, and the retail /
institutional / corporate split from the classification file. The retail-share
month-over-month change ("retail coming in vs. leaving") needs two consecutive
months present, so it appears from the second upload onward.

Files are the source of truth and are committed to the repo, exactly like the
earlier `data_sources/ksei/` workbooks. Nothing overwrites existing data unless a
valid newer file is processed.
