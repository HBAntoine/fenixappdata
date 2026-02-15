#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Convertit Events.csv en data.js pour la webapp handball.
Genere : const HANDBALL_DATA = [ ... ];

UTILISATION :
    python generer-data-js.py
    (ou appele automatiquement par Publier-MAJ.bat)

DEDUPLICATION :
    - Chaque ligne recoit un hash MD5 base sur :
      Position + [M] rencontre + #14 joueurs + #15 gardiens + #08 resultat + Nom
    - Les doublons sont ignores automatiquement
"""

import csv
import json
import hashlib
import sys
from pathlib import Path


def calculer_hash(row):
    """Calcule le hash MD5 d'une ligne CSV (meme logique que le JS)."""
    composants = '|'.join([
        row.get('Position', ''),
        row.get('[M] rencontre', ''),
        row.get('#14 joueurs', ''),
        row.get('#15 gardiens', ''),
        row.get('#08 r\u00e9sultat', ''),
        row.get('Nom', '')
    ])
    return hashlib.md5(composants.encode('utf-8')).hexdigest()


def ligne_est_vide(row):
    """Verifie si une ligne est entierement vide."""
    return all(not v or v.strip() == '' for v in row.values())


def lire_csv(chemin_csv):
    """Lit le CSV et retourne les lignes dedupliquees."""
    lignes = []
    hashes_vus = set()
    doublons = 0

    # Detecter le BOM UTF-8
    with open(chemin_csv, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)

        for row in reader:
            # Ignorer les lignes vides
            if ligne_est_vide(row):
                continue

            # Deduplication par hash
            h = calculer_hash(row)
            if h in hashes_vus:
                doublons += 1
                continue

            hashes_vus.add(h)
            lignes.append(dict(row))

    return lignes, doublons


def generer_data_js(lignes, chemin_sortie):
    """Genere le fichier data.js avec les donnees en JSON."""
    # Serialiser en JSON avec indentation lisible
    json_data = json.dumps(lignes, ensure_ascii=False, indent=2)

    contenu = f"""// Auto-genere par generer-data-js.py - ne pas modifier manuellement
// {len(lignes)} lignes de donnees
var HANDBALL_DATA = {json_data};
"""

    with open(chemin_sortie, 'w', encoding='utf-8') as f:
        f.write(contenu)

    return len(contenu)


def main():
    print("=" * 70)
    print("  GENERATION DE data.js DEPUIS Events.csv")
    print("=" * 70)
    print()

    script_dir = Path(__file__).parent.absolute()
    chemin_csv = script_dir / 'Events.csv'
    chemin_js = script_dir / 'data.js'

    # Verifier que le CSV existe
    if not chemin_csv.exists():
        print(f"ERREUR : {chemin_csv} introuvable !")
        print("  Placez Events.csv dans le meme dossier que ce script.")
        print()
        sys.exit(1)

    print(f"  CSV source  : {chemin_csv}")
    print(f"  JS sortie   : {chemin_js}")
    print()

    # Lire et dedupliquer
    print("  Lecture du CSV...")
    lignes, doublons = lire_csv(chemin_csv)

    if len(lignes) == 0:
        print("  ERREUR : aucune ligne valide trouvee dans le CSV !")
        sys.exit(1)

    print(f"  -> {len(lignes)} lignes uniques")
    if doublons > 0:
        print(f"  -> {doublons} doublon(s) ignore(s)")

    # Generer data.js
    print("  Generation de data.js...")
    taille = generer_data_js(lignes, chemin_js)
    taille_ko = taille / 1024

    print(f"  -> data.js genere ({taille_ko:.1f} Ko)")

    # Detecter les equipes (meme logique que le JS)
    equipes = set()
    if lignes:
        for cle in lignes[0].keys():
            if '#03 Phase ' in cle:
                equipe = cle.replace('#03 Phase ', '').strip()
                if equipe:
                    equipes.add(equipe)

    if equipes:
        print(f"  -> Equipes detectees : {', '.join(sorted(equipes))}")

    print()
    print("=" * 70)
    print(f"  TERMINE : {len(lignes)} lignes -> data.js ({taille_ko:.1f} Ko)")
    print("=" * 70)
    print()


if __name__ == "__main__":
    main()
