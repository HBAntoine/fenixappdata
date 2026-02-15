# Handball Analytics - Webapp

Application web d'analyse de matchs de handball (Starligue / EHF European League).

## Structure du projet

```
WEBAPP/
  index.html               <- Application principale (ouvrir dans le navigateur)
  Events.csv                <- Donnees de matchs
  generer-index.py          <- Script Python de generation des index photos
  generer-index.bat         <- Lanceur Windows (double-clic)
  Effectifs/
    Fenix/
      index.json            <- Genere automatiquement
      photo1.png
      ...
    Cesson/
      index.json
      ...
    (autres equipes)/
```

## Utilisation

### 1. Ouvrir l'application

Ouvrir `index.html` dans un navigateur. Un serveur local est necessaire pour charger les photos (restriction CORS sur `file://`).

Avec Python :

```bash
cd D:\WEBAPP
python -m http.server 8000
```

Puis ouvrir http://localhost:8000

### 2. Ajouter des photos de joueurs

1. Placer les photos (PNG/JPG) dans `Effectifs/<NomEquipe>/`
2. Double-cliquer sur `generer-index.bat` (ou lancer `python generer-index.py`)
3. Un fichier `index.json` est genere dans chaque dossier d'equipe

### 3. Ajouter une equipe

1. Creer un dossier dans `Effectifs/` avec le nom de l'equipe
2. Y placer les photos des joueurs
3. Relancer `generer-index.bat`

## Prerequis

- Navigateur web moderne (Chrome, Firefox, Edge)
- Python 3.x (pour la generation des index et le serveur local)
