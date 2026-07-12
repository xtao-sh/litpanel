import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from search import prepare_search, search_sql


class LibraryScopedSearchTests(unittest.TestCase):
    def test_library_id_keeps_integer_storage_class_for_fts(self) -> None:
        params = prepare_search("health insurance", entity_type="paper", limit=20)
        self.assertIsNotNone(params)
        assert params is not None

        sql, binds = search_sql(params, library_id=1)
        self.assertIsInstance(binds[2], int)

        connection = sqlite3.connect(":memory:")
        connection.execute(
            "CREATE VIRTUAL TABLE search_index USING fts5("
            "library_id UNINDEXED, entity_type UNINDEXED, entity_id UNINDEXED, "
            "title, content)"
        )
        connection.execute(
            "INSERT INTO search_index VALUES (?, ?, ?, ?, ?)",
            (1, "paper", "demo-007", "Health Insurance Networks", "preventive care"),
        )

        rows = connection.execute(sql, binds).fetchall()
        self.assertEqual(rows[0][1], "demo-007")


if __name__ == "__main__":
    unittest.main()
