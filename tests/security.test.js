import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('browser code contains no Gnani credentials, header names or endpoint', () => {
  const files = fs.readdirSync(path.join(root, 'src'), { recursive: true }).filter((f) => /\.(jsx?|css)$/.test(f));
  assert.ok(files.length > 5);
  for (const f of files) {
    const text = read(path.join('src', f));
    for (const forbidden of ['X-API-Key-ID', 'GNANI_API_KEY', 'vachana.ai']) assert.ok(!text.includes(forbidden), `${f} contains ${forbidden}`);
  }
  assert.ok(!read('index.html').includes('vachana'));
});

test('.env is git-ignored and .env.example holds placeholders only', () => {
  assert.match(read('.gitignore'), /^\.env$/m);
  const ex = read('.env.example');
  assert.match(ex, /^GNANI_API_KEY=your_key_goes_here\s*$/m);
  assert.ok(!/GNANI_API_KEY=(?!your_key_goes_here)\S/m.test(ex));
});

test('only the backend reads the key from the environment', () => {
  const users = fs.readdirSync(root, { recursive: true }).filter((f) => /\.(js|jsx)$/.test(f) && !f.includes('node_modules') && !f.startsWith('tests'))
    .filter((f) => read(f).includes('GNANI_API_KEY'));
  assert.ok(users.length > 0);
  for (const f of users) assert.ok(f.split(path.sep)[0] === 'server', `${f} reads the key but is not backend code`);
});
