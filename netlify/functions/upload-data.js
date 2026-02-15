// ============================================================
// NETLIFY FUNCTION : upload-data  (v3 - Git Blobs API)
//
// Recoit les donnees CSV parsees en JSON depuis le navigateur,
// genere data.js et commit + push vers GitHub.
//
// Utilise l'API Git de bas niveau (Blobs/Trees/Commits)
// pour supporter les fichiers > 1 Mo (pas de limite).
//
// Variables d'environnement requises :
//   GITHUB_TOKEN  - Personal Access Token GitHub (scope: repo)
//   GITHUB_REPO   - "HBAntoine/fenixappdata"
// ============================================================

const GITHUB_API = 'https://api.github.com';

async function githubFetch(endpoint, token, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API}${endpoint}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'FenixStats-Netlify-Function',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = null; }

  if (!resp.ok) {
    const msg = json ? (json.message || text) : text;
    throw new Error(`GitHub ${resp.status}: ${msg}`);
  }

  return json;
}

// Hash simple pour deduplication (identique cote serveur)
function rowHash(row) {
  const components = [
    row['Position'] || '',
    row['[M] rencontre'] || '',
    row['#14 joueurs'] || '',
    row['#15 gardiens'] || '',
    row['#08 résultat'] || row['#08 resultat'] || '',
    row['Nom'] || ''
  ].join('|');
  let h = 0;
  for (let i = 0; i < components.length; i++) {
    const ch = components.charCodeAt(i);
    h = ((h << 5) - h) + ch;
    h |= 0;
  }
  return String(h);
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
    const { data } = JSON.parse(event.body);

    if (!data || !Array.isArray(data) || data.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Donnees manquantes ou vides' }) };
    }

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'HBAntoine/fenixappdata';

    if (!token) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'GITHUB_TOKEN non configure' }) };
    }

    console.log(`[upload-data] Debut - ${data.length} lignes recues, repo: ${repo}`);

    // ---------------------------------------------------------
    // ETAPE 1 : Recuperer le data.js existant via download_url
    //           (contourne la limite 1 Mo de l'API Contents)
    // ---------------------------------------------------------
    let existingData = [];

    try {
      // D'abord obtenir les metadata du fichier (pas le contenu)
      const fileInfo = await githubFetch(`/repos/${repo}/contents/data.js`, token);

      if (fileInfo.download_url) {
        // Telecharger le fichier brut directement
        const rawResp = await fetch(fileInfo.download_url);
        if (rawResp.ok) {
          const rawText = await rawResp.text();
          const match = rawText.match(/var\s+HANDBALL_DATA\s*=\s*(\[[\s\S]*\])\s*;/);
          if (match && match[1]) {
            existingData = JSON.parse(match[1]);
            console.log(`[upload-data] data.js existant: ${existingData.length} lignes`);
          }
        }
      }
    } catch (e) {
      console.log('[upload-data] Pas de data.js existant ou erreur lecture:', e.message);
      existingData = [];
    }

    // ---------------------------------------------------------
    // ETAPE 2 : Fusionner avec deduplication
    // ---------------------------------------------------------
    const hashSet = new Set();
    const mergedData = [];

    // D'abord les donnees existantes
    for (const row of existingData) {
      const h = rowHash(row);
      if (!hashSet.has(h)) {
        hashSet.add(h);
        mergedData.push(row);
      }
    }

    // Puis les nouvelles (seules les uniques)
    let newCount = 0;
    for (const row of data) {
      if (Object.values(row).every(v => !v || String(v).trim() === '')) continue;
      const h = rowHash(row);
      if (!hashSet.has(h)) {
        hashSet.add(h);
        mergedData.push(row);
        newCount++;
      }
    }

    console.log(`[upload-data] Fusion: ${mergedData.length} total, ${newCount} nouvelles`);

    // ---------------------------------------------------------
    // ETAPE 3 : Generer le contenu data.js
    // ---------------------------------------------------------
    const dataJsContent = [
      '// Auto-genere par Netlify Function - ne pas modifier manuellement',
      `// ${mergedData.length} lignes de donnees`,
      'var HANDBALL_DATA = ' + JSON.stringify(mergedData, null, 2) + ';',
      ''
    ].join('\n');

    console.log(`[upload-data] data.js genere: ${(dataJsContent.length / 1024).toFixed(0)} Ko`);

    // ---------------------------------------------------------
    // ETAPE 4 : Commit via l'API Git bas niveau
    //           (supporte fichiers > 1 Mo)
    // ---------------------------------------------------------

    // 4a. Creer un Blob avec le contenu
    const blob = await githubFetch(`/repos/${repo}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({
        content: Buffer.from(dataJsContent, 'utf-8').toString('base64'),
        encoding: 'base64'
      })
    });
    console.log(`[upload-data] Blob cree: ${blob.sha}`);

    // 4b. Obtenir la reference HEAD (dernier commit)
    const ref = await githubFetch(`/repos/${repo}/git/ref/heads/main`, token);
    const lastCommitSha = ref.object.sha;
    console.log(`[upload-data] Dernier commit: ${lastCommitSha}`);

    // 4c. Obtenir l'arbre du dernier commit
    const lastCommit = await githubFetch(`/repos/${repo}/git/commits/${lastCommitSha}`, token);
    const baseTreeSha = lastCommit.tree.sha;

    // 4d. Creer un nouvel arbre avec le fichier modifie
    const newTree = await githubFetch(`/repos/${repo}/git/trees`, token, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [{
          path: 'data.js',
          mode: '100644',
          type: 'blob',
          sha: blob.sha
        }]
      })
    });
    console.log(`[upload-data] Arbre cree: ${newTree.sha}`);

    // 4e. Creer le commit
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR') + ' ' +
      now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const newCommit = await githubFetch(`/repos/${repo}/git/commits`, token, {
      method: 'POST',
      body: JSON.stringify({
        message: `MAJ donnees via web ${dateStr} (+${newCount} lignes)`,
        tree: newTree.sha,
        parents: [lastCommitSha]
      })
    });
    console.log(`[upload-data] Commit cree: ${newCommit.sha}`);

    // 4f. Mettre a jour la reference HEAD
    await githubFetch(`/repos/${repo}/git/refs/heads/main`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        sha: newCommit.sha
      })
    });
    console.log(`[upload-data] Ref main mise a jour`);

    // ---------------------------------------------------------
    // SUCCES
    // ---------------------------------------------------------
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `${newCount} nouvelles lignes ajoutees, ${mergedData.length} total`,
        newCount: newCount,
        totalCount: mergedData.length,
        commitSha: newCommit.sha
      })
    };

  } catch (error) {
    console.error('[upload-data] ERREUR:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
