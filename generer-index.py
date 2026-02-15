#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de generation automatique des index de photos pour la webapp handball.
Scanne tous les dossiers d'equipes dans Effectifs/ et genere :
  - un index.json par equipe (pour serveur HTTP)
  - un photos-index.js global (pour ouverture en file://)

UTILISATION :
    Double-cliquez sur generer-index.bat
    OU
    python generer-index.py
"""

import os
import sys
import json
from pathlib import Path


EXTENSIONS_VALIDES = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}


def lister_photos(dossier_equipe):
    """Retourne la liste des chemins relatifs des photos d'une equipe."""
    photos = []

    for racine, _dirs, fichiers in os.walk(dossier_equipe):
        racine_path = Path(racine)
        for nom_fichier in fichiers:
            ext = Path(nom_fichier).suffix.lower()
            if ext in EXTENSIONS_VALIDES:
                chemin_relatif = (racine_path / nom_fichier).relative_to(dossier_equipe)
                photos.append(str(chemin_relatif).replace('\\', '/'))

    photos.sort()
    return photos


def main():
    print("=" * 70)
    print("  GENERATION DES INDEX DE PHOTOS - WEBAPP HANDBALL")
    print("=" * 70)
    print()

    script_dir = Path(__file__).parent.absolute()
    effectifs_dir = script_dir / 'Effectifs'

    print(f"Repertoire de travail : {script_dir}")
    print(f"Dossier Effectifs     : {effectifs_dir}")
    print()

    if not effectifs_dir.exists():
        print("ERREUR : Le dossier 'Effectifs' n'existe pas !")
        print(f"   Creez le dossier : {effectifs_dir}")
        print()
        sys.exit(1)
        return

    equipes_trouvees = 0
    total_photos = 0
    all_indexes = {}

    for dossier in sorted(effectifs_dir.iterdir()):
        if dossier.is_dir():
            equipes_trouvees += 1
            nom_equipe = dossier.name

            photos = lister_photos(dossier)
            nb_photos = len(photos)
            total_photos += nb_photos

            # index.json par equipe
            index_data = {
                "photos": photos,
                "count": nb_photos,
                "team": nom_equipe
            }
            index_path = dossier / 'index.json'
            with open(index_path, 'w', encoding='utf-8') as f:
                json.dump(index_data, f, indent=2, ensure_ascii=False)

            # Stocker pour le JS global
            all_indexes[nom_equipe] = photos

            status = f"{nb_photos} photo(s)" if nb_photos > 0 else "aucune photo"
            print(f"  {nom_equipe:20s} -> {status}")

    # Generer photos-index.js
    js_path = script_dir / 'photos-index.js'
    js_content = "// Auto-genere par generer-index.py - ne pas modifier\n"
    js_content += "var PHOTOS_INDEX = " + json.dumps(all_indexes, indent=2, ensure_ascii=False) + ";\n"
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(js_content)

    print()
    print(f"  {'photos-index.js':20s} -> genere ({equipes_trouvees} equipe(s))")

    print()
    print("=" * 70)
    if equipes_trouvees == 0:
        print("Aucune equipe trouvee dans Effectifs/")
    else:
        print(f"TERMINE : {equipes_trouvees} equipe(s), {total_photos} photo(s) indexee(s)")
    print("=" * 70)
    print()


if __name__ == "__main__":
    main()
