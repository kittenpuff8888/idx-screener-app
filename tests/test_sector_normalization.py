import unittest

from rebuild_backend.sector_normalization import (
    OFFICIAL_IDX_SECTORS,
    normalize_idx_sector,
)


class SectorNormalizationTests(unittest.TestCase):
    def test_official_codes_are_preserved(self):
        for sector in OFFICIAL_IDX_SECTORS:
            self.assertEqual(normalize_idx_sector(sector), sector)

    def test_missing_sector_becomes_others(self):
        for value in ("-", "", None, "Unclassified", "unknown"):
            self.assertEqual(normalize_idx_sector(value), "Others")

    def test_authoritative_sector_wins_over_descriptive_fallback(self):
        self.assertEqual(normalize_idx_sector("IDXTRANS", "Industrials"), "IDXTRANS")

    def test_dash_placeholder_falls_back_same_as_none(self):
        # "-" is the raw workbook's ordinary missing-value placeholder, not a
        # signal that IDX actively reviewed and declined to sector this
        # ticker — every unclassified cell reads "-", never a real `None`, so
        # treating it differently from `None` meant the fallback parameter
        # could never fire in practice (see rebuild_backend/sector_normalization.py).
        self.assertEqual(normalize_idx_sector("-", "Financial Services"), "IDXFINANCE")

    def test_descriptive_fallback_maps_to_official_sector(self):
        self.assertEqual(normalize_idx_sector(None, "Financial Services"), "IDXFINANCE")

    def test_unmappable_fallback_still_others(self):
        self.assertEqual(normalize_idx_sector("-", "Some Made Up Category"), "Others")


if __name__ == "__main__":
    unittest.main()
