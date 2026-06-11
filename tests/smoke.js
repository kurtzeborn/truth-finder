// Smoke tests for Spot the Lie
// Usage: node tests/smoke.js https://truth.k61.dev

const BASE_URL = process.argv[2] || 'http://localhost:4280';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log(`\nSmoke Tests: ${BASE_URL}\n`);

await test('Landing page loads', async () => {
  const res = await fetch(BASE_URL);
  assert(res.ok, `Status ${res.status}`);
  const html = await res.text();
  assert(html.includes('Spot the Lie'), 'Missing app title');
});

await test('/api/me responds', async () => {
  const res = await fetch(`${BASE_URL}/api/me`);
  assert(res.ok, `Status ${res.status}`);
  const data = await res.json();
  assert('isAuthenticated' in data, 'Missing isAuthenticated field');
  assert('isGameKeeper' in data, 'Missing isGameKeeper field');
});

await test('Invalid game code returns 404', async () => {
  const res = await fetch(`${BASE_URL}/api/games/ZZZZ`);
  assert(res.status === 404, `Expected 404, got ${res.status}`);
});

await test('Static assets load', async () => {
  const res = await fetch(BASE_URL);
  const html = await res.text();
  assert(html.includes('<script'), 'Missing script tags');
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
