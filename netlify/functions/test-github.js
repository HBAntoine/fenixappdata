// Test simple : verifie que le token GitHub fonctionne (v2 - force redeploy)
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'HBAntoine/fenixappdata';

  const results = {
    token_present: !!token,
    token_prefix: token ? token.substring(0, 8) + '...' : 'ABSENT',
    repo: repo,
    tests: {}
  };

  if (!token) {
    return { statusCode: 200, headers, body: JSON.stringify(results) };
  }

  // Test 1 : GET /user
  try {
    const r1 = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'FenixStats-Test',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const d1 = await r1.json();
    results.tests.user = { status: r1.status, login: d1.login || d1.message };
  } catch (e) {
    results.tests.user = { error: e.message };
  }

  // Test 2 : GET /repos/{repo}
  try {
    const r2 = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'FenixStats-Test',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const d2 = await r2.json();
    results.tests.repo = { status: r2.status, full_name: d2.full_name || d2.message };
  } catch (e) {
    results.tests.repo = { error: e.message };
  }

  // Test 3 : GET /repos/{repo}/git/ref/heads/main
  try {
    const r3 = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/main`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'FenixStats-Test',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const d3 = await r3.json();
    results.tests.git_ref = { status: r3.status, sha: d3.object ? d3.object.sha : d3.message };
  } catch (e) {
    results.tests.git_ref = { error: e.message };
  }

  // Test 4 : POST /repos/{repo}/git/blobs (petit test d'ecriture)
  try {
    const r4 = await fetch(`https://api.github.com/repos/${repo}/git/blobs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'FenixStats-Test',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: 'test', encoding: 'utf-8' })
    });
    const d4 = await r4.json();
    results.tests.create_blob = { status: r4.status, sha: d4.sha || d4.message };
  } catch (e) {
    results.tests.create_blob = { error: e.message };
  }

  return { statusCode: 200, headers, body: JSON.stringify(results, null, 2) };
};
