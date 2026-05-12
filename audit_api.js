import fetch from 'node-fetch';

async function audit() {
  const endpoints = [
    'http://localhost:3000/api/health',
    'http://localhost:3000/api/payment-config',
    'http://localhost:3000/api/whoami'
  ];

  console.log('--- STARTING LOCAL API AUDIT ---');
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const contentType = res.headers.get('content-type');
      const text = await res.text();
      console.log(`URL: ${url}`);
      console.log(`Status: ${res.status}`);
      console.log(`Content-Type: ${contentType}`);
      console.log(`Body starts with: ${text.substring(0, 50)}...`);
      console.log('---');
    } catch (e) {
      console.error(`Failed to reach ${url}: ${e.message}`);
    }
  }
}

audit();
