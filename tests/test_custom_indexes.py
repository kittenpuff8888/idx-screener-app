import unittest

from scripts.build_custom_indexes import normalize_weights, weighted_index_value


class CustomIndexTests(unittest.TestCase):
    def test_weighted_index_starts_at_100(self):
        constituents = normalize_weights(
            [
                {"ticker": "AAA", "weight": 60},
                {"ticker": "BBB", "weight": 40},
            ]
        )
        value, count, missing = weighted_index_value(
            constituents,
            {"AAA": 100, "BBB": 200},
            {"AAA": 100, "BBB": 200},
        )
        self.assertEqual(value, 100)
        self.assertEqual(count, 2)
        self.assertEqual(missing, [])

    def test_missing_price_renormalizes_remaining_weight(self):
        constituents = normalize_weights(
            [
                {"ticker": "AAA", "weight": 60},
                {"ticker": "BBB", "weight": 40},
            ]
        )
        value, count, missing = weighted_index_value(
            constituents,
            {"AAA": 110},
            {"AAA": 100, "BBB": 200},
        )
        self.assertEqual(value, 110)
        self.assertEqual(count, 1)
        self.assertEqual(missing, ["BBB"])

    def test_equal_fallback_is_deterministic(self):
        result = normalize_weights(
            [
                {"ticker": "AAA", "weight": 0},
                {"ticker": "BBB", "weight": None},
            ]
        )
        self.assertEqual([row["weight"] for row in result], [0.5, 0.5])


if __name__ == "__main__":
    unittest.main()
