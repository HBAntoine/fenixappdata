// ============================================================
// NETLIFY FUNCTION : upload-photos  (Git Blobs API)
// Upload/suppression de photos d'equipe + regeneration photos-index.js
// ============================================================

const GITHUB_API = 'https://api.github.com';

async function githubFetch(endpoint, token, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API}${endpoint}`;

  console.log(`[github] ${options.method || 'GET'} ${url}`);

  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'FenixStats-Netlify-Function',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await resp.text();
  console.log(`[github] -> ${resp.status} (${text.length} chars)`);

  let json;
  try { json = JSON.parse(text); } catch (e) { json = null; }

  if (!resp.ok) {
    const msg = json ? (json.message || text) : text;
    throw new Error(`GitHub ${resp.status}: ${msg}`);
  }

  return json;
}

// Extensions image valides
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function isImageFile(path) {
  const ext = '.' + path.split('.').pop().toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

// Construire PHOTOS_INDEX a partir des entrees de l'arbre Git
function buildPhotosIndex(treeEntries) {
  const index = {};

  for (const entry of treeEntries) {
    if (entry.type !== 'blob') continue;
    if (!entry.path.startsWith('Effectifs/')) continue;
    if (!isImageFile(entry.path)) continue;
    // Ignorer index.json
    if (entry.path.endsWith('/index.json')) continue;

    // entry.path = "Effectifs/Fenix/baky.png" ou "Effectifs/Sesvete/PNG/1 Peric.png"
    const parts = entry.path.split('/');
    if (parts.length < 3) continue;

    const teamName = parts[1];
    const fileName = parts.slice(2).join('/'); // gere les sous-dossiers

    if (!index[teamName]) index[teamName] = [];
    index[teamName].push(fileName);
  }

  // Trier chaque equipe
  for (const team of Object.keys(index)) {
    index[team].sort();
  }

  return index;
}

// Generer le contenu de photos-index.js
function generatePhotosIndexJS(index) {
  const lines = ['// Auto-genere par Netlify Function - ne pas modifier'];
  lines.push('var PHOTOS_INDEX = {');

  const teamNames = Object.keys(index).sort();
  teamNames.forEach((team, i) => {
    lines.push(`  ${JSON.stringify(team)}: [`);
    index[team].forEach((photo, j) => {
      const comma = j < index[team].length - 1 ? ',' : '';
      lines.push(`    ${JSON.stringify(photo)}${comma}`);
    });
    const teamComma = i < teamNames.length - 1 ? ',' : '';
    lines.push(`  ]${teamComma}`);
  });

  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST uniquement' }) };
  }

  try {
    const { teamName, photos, deletions } = JSON.parse(event.body);

    if (!teamName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'teamName requis' }) };
    }

    const hasPhotos = photos && Array.isArray(photos) && photos.length > 0;
    const hasDeletions = deletions && Array.isArray(deletions) && deletions.length > 0;

    if (!hasPhotos && !hasDeletions) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Aucune photo a ajouter ou supprimer' }) };
    }

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'HBAntoine/fenixappdata';

    if (!token) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'GITHUB_TOKEN non configure' }) };
    }

    console.log(`[upload-photos] Debut - equipe: ${teamName}, ajouts: ${hasPhotos ? photos.length : 0}, suppressions: ${hasDeletions ? deletions.length : 0}`);

    // ---------------------------------------------------------
    // TEST : Verifier que le token fonctionne
    // ---------------------------------------------------------
    try {
      const user = await githubFetch('/user', token);
      console.log(`[upload-photos] Token OK - utilisateur: ${user.login}`);
    } catch (e) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: `Token GitHub invalide. ${e.message}`,
          hint: 'Verifiez que le token est un "Classic token" avec le scope "repo"'
        })
      };
    }

    // ---------------------------------------------------------
    // ETAPE 1 : Obtenir HEAD ref + commit + arbre de base
    // ---------------------------------------------------------
    console.log('[upload-photos] 1. Lecture ref main...');
    const ref = await githubFetch(`/repos/${repo}/git/ref/heads/main`, token);
    const lastCommitSha = ref.object.sha;
    console.log(`[upload-photos] HEAD: ${lastCommitSha}`);

    const lastCommit = await githubFetch(`/repos/${repo}/git/commits/${lastCommitSha}`, token);
    const baseTreeSha = lastCommit.tree.sha;

    // ---------------------------------------------------------
    // ETAPE 2 : Lire l'arbre complet (recursif)
    // ---------------------------------------------------------
    console.log('[upload-photos] 2. Lecture arbre recursif...');
    const fullTree = await githubFetch(
      `/repos/${repo}/git/trees/${baseTreeSha}?recursive=1`, token
    );
    console.log(`[upload-photos] Arbre: ${fullTree.tree.length} entrees`);

    // ---------------------------------------------------------
    // ETAPE 3 : Creer des blobs pour les nouvelles photos
    // ---------------------------------------------------------
    const newPhotoBlobs = [];
    if (hasPhotos) {
      console.log(`[upload-photos] 3. Creation de ${photos.length} blob(s)...`);
      for (const photo of photos) {
        const blob = await githubFetch(`/repos/${repo}/git/blobs`, token, {
          method: 'POST',
          body: JSON.stringify({
            content: photo.base64data,
            encoding: 'base64'
          })
        });
        const path = `Effectifs/${teamName}/${photo.filename}`;
        newPhotoBlobs.push({ path, sha: blob.sha });
        console.log(`[upload-photos] Blob cree: ${path} -> ${blob.sha.substring(0, 8)}`);
      }
    }

    // ---------------------------------------------------------
    // ETAPE 4 : Construire le nouvel arbre
    // ---------------------------------------------------------
    console.log('[upload-photos] 4. Construction du nouvel arbre...');

    let treeEntries;
    let newTreePayload;

    if (hasDeletions) {
      // Avec suppressions : on doit reconstruire l'arbre complet sans les fichiers supprimes
      const deletionPaths = new Set(
        deletions.map(f => `Effectifs/${teamName}/${f}`)
      );
      console.log(`[upload-photos] Suppressions: ${Array.from(deletionPaths).join(', ')}`);

      // Filtrer l'arbre existant (garder tout sauf les fichiers supprimes)
      treeEntries = fullTree.tree
        .filter(entry => entry.type === 'blob')
        .filter(entry => !deletionPaths.has(entry.path))
        .map(entry => ({
          path: entry.path,
          mode: entry.mode,
          type: 'blob',
          sha: entry.sha
        }));

      // Ajouter les nouvelles photos
      for (const photo of newPhotoBlobs) {
        // Retirer une eventuelle entree existante avec le meme chemin
        treeEntries = treeEntries.filter(e => e.path !== photo.path);
        treeEntries.push({
          path: photo.path,
          mode: '100644',
          type: 'blob',
          sha: photo.sha
        });
      }

      // PAS de base_tree (remplacement complet)
      newTreePayload = { tree: treeEntries };
    } else {
      // Sans suppressions : utiliser base_tree + ajouts seulement (plus simple et rapide)
      treeEntries = newPhotoBlobs.map(p => ({
        path: p.path,
        mode: '100644',
        type: 'blob',
        sha: p.sha
      }));

      newTreePayload = {
        base_tree: baseTreeSha,
        tree: treeEntries
      };
    }

    // ---------------------------------------------------------
    // ETAPE 5 : Regenerer photos-index.js
    // ---------------------------------------------------------
    console.log('[upload-photos] 5. Regeneration photos-index.js...');

    // Construire la liste finale des fichiers pour l'index
    // Partir de l'arbre existant, appliquer les modifications
    let finalTreeEntries;
    if (hasDeletions) {
      // On a deja treeEntries qui est l'arbre complet filtre
      finalTreeEntries = treeEntries;
    } else {
      // Combiner l'arbre existant + les nouveaux blobs
      finalTreeEntries = [
        ...fullTree.tree,
        ...newPhotoBlobs.map(p => ({ path: p.path, type: 'blob' }))
      ];
    }

    const photosIndex = buildPhotosIndex(finalTreeEntries);
    const photosIndexContent = generatePhotosIndexJS(photosIndex);
    console.log(`[upload-photos] photos-index.js: ${Object.keys(photosIndex).length} equipes`);

    // Creer le blob pour photos-index.js
    const indexBlob = await githubFetch(`/repos/${repo}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({
        content: Buffer.from(photosIndexContent, 'utf-8').toString('base64'),
        encoding: 'base64'
      })
    });

    // Ajouter photos-index.js a l'arbre
    if (hasDeletions) {
      // Retirer l'ancienne entree photos-index.js
      newTreePayload.tree = newTreePayload.tree.filter(e => e.path !== 'photos-index.js');
    }
    // Ajouter la nouvelle
    if (!newTreePayload.tree) newTreePayload.tree = [];
    newTreePayload.tree.push({
      path: 'photos-index.js',
      mode: '100644',
      type: 'blob',
      sha: indexBlob.sha
    });

    // ---------------------------------------------------------
    // ETAPE 6 : Creer l'arbre, le commit, et mettre a jour la ref
    // ---------------------------------------------------------
    console.log('[upload-photos] 6. Creation arbre...');
    const newTree = await githubFetch(`/repos/${repo}/git/trees`, token, {
      method: 'POST',
      body: JSON.stringify(newTreePayload)
    });
    console.log(`[upload-photos] Arbre: ${newTree.sha}`);

    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR') + ' ' +
      now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const actions = [];
    if (hasPhotos) actions.push(`+${photos.length} photo(s)`);
    if (hasDeletions) actions.push(`-${deletions.length} photo(s)`);

    console.log('[upload-photos] 6b. Creation commit...');
    const newCommit = await githubFetch(`/repos/${repo}/git/commits`, token, {
      method: 'POST',
      body: JSON.stringify({
        message: `MAJ photos ${teamName} ${dateStr} (${actions.join(', ')})`,
        tree: newTree.sha,
        parents: [lastCommitSha]
      })
    });
    console.log(`[upload-photos] Commit: ${newCommit.sha}`);

    console.log('[upload-photos] 6c. Mise a jour ref...');
    await githubFetch(`/repos/${repo}/git/refs/heads/main`, token, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommit.sha })
    });
    console.log('[upload-photos] SUCCES !');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Photos ${teamName} mises a jour (${actions.join(', ')})`,
        photosIndex: photosIndex,
        commitSha: newCommit.sha
      })
    };

  } catch (error) {
    console.error('[upload-photos] ERREUR:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
