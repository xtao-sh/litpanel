"""Compute and store embeddings for all papers and atoms."""
import logging
logging.basicConfig(level=logging.INFO)

from database import init_db
from embeddings import compute_paper_embeddings, compute_atom_embeddings

if __name__ == "__main__":
    init_db()
    n_papers = compute_paper_embeddings()
    n_atoms = compute_atom_embeddings()
    print(f"Done: {n_papers} paper embeddings + {n_atoms} atom embeddings")
