import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from '../js/config.js';
import { randomRoomCode } from '../js/net/host.js';

test('room codes are 8 letters', () => {
  assert.equal(ROOM_CODE_LENGTH, 8);
  for (let i = 0; i < 50; i++) assert.match(randomRoomCode(), /^[A-Z]{8}$/);
});

test('codes are shown in two chunks', () => {
  assert.equal(formatRoomCode('ABCDEFGH'), 'ABCD-EFGH');
  assert.equal(formatRoomCode('ABCDE'), 'ABCD-E');
  assert.equal(formatRoomCode('ABC'), 'ABC');
  assert.equal(formatRoomCode(''), '');
});

test('typed or linked codes are normalized', () => {
  assert.equal(normalizeRoomCode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(normalizeRoomCode(' AbCd eFgH '), 'ABCDEFGH');
  assert.equal(normalizeRoomCode('ABCD-EFGH-XYZ'), 'ABCDEFGH');
  assert.equal(normalizeRoomCode(null), '');
  assert.equal(normalizeRoomCode(undefined), '');
});
