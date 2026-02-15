// ============================================================
// NETLIFY FUNCTION : upload-data
//
// Recoit les donnees CSV parsees en JSON depuis le navigateur,
// genere data.js et commit + push vers GitHub via l'API.
//
// Variables d'environnement requises (dans Netlify > Site >
// Environment variables) :
//   GITHUB_TOKEN  - Personal Access Token GitHub
//   GITHUB_REPO   - "HBAntoine/fenixappdata"
// ============================================================

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Preflight
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

    // ---------------------------------------------------------
    // ETAPE 1 : Recuperer le data.js actuel sur GitHub
    //           pour obtenir son SHA (necessaire pour update)
    // ---------------------------------------------------------
    const filePath = 'data.js';
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;

    let existingSha = null;
    let existingData = [];

    const getResp = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'FenixStats-Netlify-Function'
      }
    });

    if (getResp.ok) {
      const fileInfo = await getResp.json();
      existingSha = fileInfo.sha;

      // Decoder le contenu actuel (base64)
      const currentContent = Buffer.from(fileInfo.content, 'base64').toString('utf-8');

      // Extraire le JSON existant
      const match = currentContent.match(/var\s+HANDBALL_DATA\s*=\s*(\[[\s\S]*\])\s*;/);
      if (match && match[1]) {
        try {
          existingData = JSON.parse(match[1]);
        } catch (e) {
          existingData = [];
        }
      }
    }

    // ---------------------------------------------------------
    // ETAPE 2 : Fusionner anciennes + nouvelles donnees
    //           avec deduplication par hash
    // ---------------------------------------------------------
    const hashSet = new Set();

    // Fonction de hash identique au JS client
    function rowHash(row) {
      const components = [
        row['Position'] || '',
        row['[M] rencontre'] || '',
        row['#14 joueurs'] || '',
        row['#15 gardiens'] || '',
        row['#08 résultat'] || row['#08 resultat'] || '',
        row['Nom'] || ''
      ].join('|');
      // Hash simple sans crypto (pas besoin de MD5 ici, juste dedup)
      let h = 0;
      for (let i = 0; i < components.length; i++) {
        const ch = components.charCodeAt(i);
        h = ((h << 5) - h) + ch;
        h |= 0;
      }
      return String(h);
    }

    // Ajouter les donnees existantes
    const mergedData = [];
    for (const row of existingData) {
      const h = rowHash(row);
      if (!hashSet.has(h)) {
        hashSet.add(h);
        mergedData.push(row);
      }
    }

    // Ajouter les nouvelles donnees (seules les uniques)
    let newCount = 0;
    for (const row of data) {
      // Ignorer les lignes vides
      if (Object.values(row).every(v => !v || String(v).trim() === '')) continue;

      const h = rowHash(row);
      if (!hashSet.has(h)) {
        hashSet.add(h);
        mergedData.push(row);
        newCount++;
      }
    }

    // ---------------------------------------------------------
    // ETAPE 3 : Generer le contenu de data.js
    // ---------------------------------------------------------
    const jsonContent = JSON.stringify(mergedData, null, 2);
    const dataJsContent = `// Auto-genere par Netlify Function - ne pas modifier manuellement\n// ${mergedData.length} lignes de donnees\nvar HANDBALL_DATA = ${jsonContent};\n`;

    // Encoder en base64
    const contentBase64 = Buffer.from(dataJsContent, 'utf-8').toString('base64');

    // ---------------------------------------------------------
    // ETAPE 4 : Commit vers GitHub via l'API
    // ---------------------------------------------------------
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR') + ' ' +
      now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const commitBody = {
      message: `MAJ donnees via web ${dateStr} (+${newCount} lignes)`,
      content: contentBase64,
      branch: 'main'
    };

    if (existingSha) {
      commitBody.sha = existingSha;
    }

    const putResp = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'FenixStats-Netlify-Function',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commitBody)
    });

    if (!putResp.ok) {
      const errText = await putResp.text();
      console.error('GitHub API error:', putResp.status, errText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'Erreur GitHub API',
          status: putResp.status,
          details: errText
        })
      };
    }

    const result = await putResp.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `${newCount} nouvelles lignes ajoutees, ${mergedData.length} total`,
        newCount: newCount,
        totalCount: mergedData.length,
        commitSha: result.commit ? result.commit.sha : null,
        commitUrl: result.commit ? result.commit.html_url : null
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
