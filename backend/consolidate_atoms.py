"""Consolidate duplicate and near-duplicate atoms.

Strategy:
1. Find exact title duplicates -> merge immediately
2. Find embedding-similar atoms (cosine > threshold) of same type -> suggest merges
3. For each merge group: keep the atom with the most paper links as canonical,
   redirect others' paper links to the canonical atom
"""

import sqlite3
import numpy as np
import logging
from collections import defaultdict
from pathlib import Path

logger = logging.getLogger("consolidate")

DB_PATH = Path(__file__).parent / "kb.db"


def consolidate_atoms(similarity_threshold=0.85, dry_run=True):
    conn = sqlite3.connect(str(DB_PATH))

    # Snapshot before
    before_count = conn.execute("SELECT COUNT(*) FROM atoms").fetchone()[0]
    before_refs = conn.execute("SELECT COUNT(*) FROM atom_paper_refs").fetchone()[0]
    print(f"BEFORE: {before_count} atoms, {before_refs} atom-paper refs")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE MERGE'}")
    print()

    # Phase 1: Exact title duplicates
    print("=== Phase 1: Exact Title Duplicates ===")
    dupes = conn.execute("""
        SELECT title, type, GROUP_CONCAT(slug, '|') as slugs, COUNT(*) as cnt
        FROM atoms GROUP BY title, type HAVING cnt > 1
    """).fetchall()

    exact_merges = 0
    for title, atype, slugs_str, cnt in dupes:
        slugs = slugs_str.split('|')
        # Keep the slug with most paper refs
        best_slug = None
        best_count = -1
        for s in slugs:
            count = conn.execute(
                "SELECT COUNT(*) FROM atom_paper_refs WHERE atom_slug = ?", (s,)
            ).fetchone()[0]
            if count > best_count:
                best_count = count
                best_slug = s

        # Merge others into best
        for s in slugs:
            if s != best_slug:
                if not dry_run:
                    # Move paper refs to canonical
                    conn.execute("""
                        INSERT OR IGNORE INTO atom_paper_refs (atom_slug, paper_id)
                        SELECT ?, paper_id FROM atom_paper_refs WHERE atom_slug = ?
                    """, (best_slug, s))
                    # Delete old refs and atom
                    conn.execute(
                        "DELETE FROM atom_paper_refs WHERE atom_slug = ?", (s,)
                    )
                    conn.execute("DELETE FROM atoms WHERE slug = ?", (s,))
                    conn.execute(
                        "DELETE FROM embeddings WHERE entity_type = 'atom' AND entity_id = ?",
                        (s,),
                    )
                exact_merges += 1
                print(f"  Merge '{s}' -> '{best_slug}' ({title})")

    if not dry_run:
        conn.commit()
    print(f"Phase 1: {exact_merges} atoms merged ({len(dupes)} duplicate groups)")

    # Phase 2: Embedding-based near-duplicates (same type only)
    print(
        f"\n=== Phase 2: Embedding Near-Duplicates (threshold={similarity_threshold}) ==="
    )

    # Load embeddings
    atom_rows = conn.execute(
        "SELECT entity_id, vector FROM embeddings WHERE entity_type = 'atom'"
    ).fetchall()
    if not atom_rows:
        print("No atom embeddings found. Run compute_embeddings.py first.")
        conn.close()
        return

    slugs = [r[0] for r in atom_rows]
    vectors = np.array([np.frombuffer(r[1], dtype=np.float32) for r in atom_rows])

    # Normalise vectors (embeddings should already be normalised, but be safe)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    vectors = vectors / norms

    # Get type for each atom
    slug_type = {}
    for r in conn.execute("SELECT slug, type FROM atoms").fetchall():
        slug_type[r[0]] = r[1]

    # Find similar pairs (same type, cosine > threshold)
    merge_groups = defaultdict(set)  # canonical_slug -> {slugs to merge}
    processed = set()

    for atype in ["method", "mechanism", "dataset", "puzzle"]:
        type_indices = [i for i, s in enumerate(slugs) if slug_type.get(s) == atype]
        if len(type_indices) < 2:
            continue

        type_vecs = vectors[type_indices]
        type_slugs = [slugs[i] for i in type_indices]

        # Compute pairwise similarities
        sim_matrix = type_vecs @ type_vecs.T

        for i in range(len(type_slugs)):
            if type_slugs[i] in processed:
                continue
            similar = []
            for j in range(i + 1, len(type_slugs)):
                if type_slugs[j] in processed:
                    continue
                if sim_matrix[i][j] >= similarity_threshold:
                    similar.append(type_slugs[j])

            if similar:
                group = [type_slugs[i]] + similar
                # Find canonical (most paper refs)
                best = max(
                    group,
                    key=lambda s: conn.execute(
                        "SELECT COUNT(*) FROM atom_paper_refs WHERE atom_slug = ?",
                        (s,),
                    ).fetchone()[0],
                )
                for s in group:
                    if s != best:
                        merge_groups[best].add(s)
                        processed.add(s)
                processed.add(type_slugs[i])

    embed_merges = sum(len(v) for v in merge_groups.values())
    print(f"Found {len(merge_groups)} merge groups ({embed_merges} atoms to merge)")

    for canonical, to_merge in sorted(
        merge_groups.items(), key=lambda x: -len(x[1])
    )[:20]:
        canon_title = conn.execute(
            "SELECT title FROM atoms WHERE slug = ?", (canonical,)
        ).fetchone()
        print(
            f"  Keep '{canonical}' ({canon_title[0] if canon_title else '?'}), "
            f"merge {len(to_merge)} duplicates:"
        )
        for s in list(to_merge)[:3]:
            t = conn.execute(
                "SELECT title FROM atoms WHERE slug = ?", (s,)
            ).fetchone()
            sim = float(sim_matrix[type_slugs.index(s)][type_slugs.index(canonical)]) if s in type_slugs and canonical in type_slugs else 0
            print(f"    - {s} ({t[0] if t else '?'})")
        if len(to_merge) > 3:
            print(f"    ... and {len(to_merge) - 3} more")

    if not dry_run:
        for canonical, to_merge in merge_groups.items():
            for s in to_merge:
                conn.execute("""
                    INSERT OR IGNORE INTO atom_paper_refs (atom_slug, paper_id)
                    SELECT ?, paper_id FROM atom_paper_refs WHERE atom_slug = ?
                """, (canonical, s))
                conn.execute(
                    "DELETE FROM atom_paper_refs WHERE atom_slug = ?", (s,)
                )
                conn.execute("DELETE FROM atoms WHERE slug = ?", (s,))
                conn.execute(
                    "DELETE FROM embeddings WHERE entity_type = 'atom' AND entity_id = ?",
                    (s,),
                )
        conn.commit()

    # Report final stats
    remaining = conn.execute("SELECT COUNT(*) FROM atoms").fetchone()[0]
    remaining_refs = conn.execute("SELECT COUNT(*) FROM atom_paper_refs").fetchone()[0]
    shared = conn.execute(
        "SELECT COUNT(*) FROM "
        "(SELECT atom_slug FROM atom_paper_refs GROUP BY atom_slug "
        "HAVING COUNT(DISTINCT paper_id) > 1)"
    ).fetchone()[0]

    total_merged = exact_merges + embed_merges
    print(f"\n{'=' * 60}")
    print(f"SUMMARY ({'DRY RUN' if dry_run else 'APPLIED'}):")
    print(f"  Phase 1 (exact title): {exact_merges} atoms merged")
    print(f"  Phase 2 (embeddings):  {embed_merges} atoms merged")
    print(f"  Total merged:          {total_merged}")
    if not dry_run:
        print(f"  Atoms:  {before_count} -> {remaining} (removed {before_count - remaining})")
        print(f"  Refs:   {before_refs} -> {remaining_refs}")
    else:
        print(f"  Would remove:          {total_merged} atoms")
        print(f"  Current atoms:         {remaining}")
    print(f"  Shared across 2+ papers: {shared}")

    conn.close()
    return {
        "before_atoms": before_count,
        "before_refs": before_refs,
        "exact_merges": exact_merges,
        "embed_merges": embed_merges,
        "after_atoms": remaining if not dry_run else remaining,
        "after_refs": remaining_refs if not dry_run else remaining_refs,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # First do a dry run to see what would happen
    print("DRY RUN:")
    consolidate_atoms(similarity_threshold=0.88, dry_run=True)

    print("\n" + "=" * 60)
    print("To actually merge, run: consolidate_atoms(dry_run=False)")

    # Actually merge
    response = input("\nProceed with merge? (y/n): ")
    if response.lower() == "y":
        consolidate_atoms(similarity_threshold=0.88, dry_run=False)
