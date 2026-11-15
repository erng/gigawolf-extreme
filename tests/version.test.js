import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../js/config.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('APP_VERSION, package.json and index.html all carry the same semver', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(read('package.json')).version, APP_VERSION);
  assert.equal(read('index.html').match(/id="version" data-html-version="([^"]+)"/)?.[1], APP_VERSION);
});
