// ============================================================
// NETLIFY FUNCTION : upload-data  (v4 - debug + Git Blobs API)
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

    console.log(`[upload-data] Debut - ${data.length} lignes, repo: ${repo}`);
    console.log(`[upload-data] Token commence par: ${token.substring(0, 8)}...`);

    // ---------------------------------------------------------
    // TEST : Verifier que le token fonctionne
    // ---------------------------------------------------------
    try {
      const user = await githubFetch('/user', token);
      console.log(`[upload-data] Token OK - utilisateur: ${user.login}`);
    } catch (e) {
      console.error(`[upload-data] Token INVALIDE: ${e.message}`);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: `Token GitHub invalide ou sans permissions. ${e.message}`,
          hint: 'Verifiez que le token est un "Classic token" avec le scope "repo"'
        })
      };
    }

    // ---------------------------------------------------------
    // ETAPE 1 : Recuperer data.js existant
    // ---------------------------------------------------------
    let existingData = [];

    try {
      // Telecharger le fichier brut depuis GitHub (pas de limite de taille)
      const rawUrl = `https://raw.githubusercontent.com/${repo}/main/data.js`;
      console.log(`[upload-data] Telechargement ${rawUrl}`);
      const rawResp = await fetch(rawUrl);

      if (rawResp.ok) {
        const rawText = await rawResp.text();
        console.log(`[upload-data] data.js telecharge: ${(rawText.length / 1024).toFixed(0)} Ko`);
        const match = rawText.match(/var\s+HANDBALL_DATA\s*=\s*(\[[\s\S]*\])\s*;/);
        if (match && match[1]) {
          existingData = JSON.parse(match[1]);
          console.log(`[upload-data] data.js existant: ${existingData.length} lignes`);
        }
      } else {
        console.log(`[upload-data] Pas de data.js existant (${rawResp.status})`);
      }
    } catch (e) {
      console.log('[upload-data] Erreur lecture data.js:', e.message);
    }

    // ---------------------------------------------------------
    // ETAPE 2 : Fusionner avec deduplication
    // ---------------------------------------------------------
    const hashSet = new Set();
    const mergedData = [];

    for (const row of existingData) {
      const h = rowHash(row);
      if (!hashSet.has(h)) {
        hashSet.add(h);
        mergedData.push(row);
      }
    }

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
    // ETAPE 3 : Generer data.js
    // ---------------------------------------------------------
    const dataJsContent = [
      '// Auto-genere par Netlify Function - ne pas modifier manuellement',
      `// ${mergedData.length} lignes de donnees`,
      'var HANDBALL_DATA = ' + JSON.stringify(mergedData, null, 2) + ';',
      ''
    ].join('\n');

    console.log(`[upload-data] data.js genere: ${(dataJsContent.length / 1024).toFixed(0)} Ko`);

    // ---------------------------------------------------------
    // ETAPE 4 : Commit via Git Blobs API
    // ---------------------------------------------------------

    // 4a. Creer un Blob
    console.log('[upload-data] 4a. Creation blob...');
    const blob = await githubFetch(`/repos/${repo}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({
        content: Buffer.from(dataJsContent, 'utf-8').toString('base64'),
        encoding: 'base64'
      })
    });
    console.log(`[upload-data] Blob: ${blob.sha}`);

    // 4b. Obtenir la ref HEAD
    console.log('[upload-data] 4b. Lecture ref main...');
    const ref = await githubFetch(`/repos/${repo}/git/ref/heads/main`, token);
    const lastCommitSha = ref.object.sha;
    console.log(`[upload-data] HEAD: ${lastCommitSha}`);

    // 4c. Obtenir l'arbre du commit
    console.log('[upload-data] 4c. Lecture commit...');
    const lastCommit = await githubFetch(`/repos/${repo}/git/commits/${lastCommitSha}`, token);
    const baseTreeSha = lastCommit.tree.sha;

    // 4d. Creer un nouvel arbre
    console.log('[upload-data] 4d. Creation arbre...');
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
    console.log(`[upload-data] Arbre: ${newTree.sha}`);

    // 4e. Creer le commit
    console.log('[upload-data] 4e. Creation commit...');
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
    console.log(`[upload-data] Commit: ${newCommit.sha}`);

    // 4f. Mettre a jour la ref
    console.log('[upload-data] 4f. Mise a jour ref...');
    await githubFetch(`/repos/${repo}/git/refs/heads/main`, token, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommit.sha })
    });
    console.log('[upload-data] SUCCES !');

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
    console.error('[upload-data] ERREUR FINALE:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
