import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseAmount, formatINR, daysUntil } from '../public/shared.js';
import { layout, pickProfile, insertionIndex, CARD_W } from '../public/layout.js';
import { Store, applyOps } from '../lib/store.js';
import { fallbackPlan } from '../lib/claude.js';

test('parseAmount handles Indian shorthand', () => {
  assert.equal(parseAmount('5 lakh'), 500000);
  assert.equal(parseAmount('₹1.5 Cr'), 15000000);
  assert.equal(parseAmount('50k'), 50000);
  assert.equal(parseAmount('2,50,000'), 250000);
  assert.equal(parseAmount(1200), 1200);
  assert.equal(parseAmount('lots'), undefined);
  assert.equal(parseAmount(-5), undefined);
});

test('formatINR', () => {
  assert.equal(formatINR(800000), '₹8 L');
  assert.equal(formatINR(12500000), '₹1.25 Cr');
  assert.equal(formatINR(45000), '₹45,000');
});

test('daysUntil', () => {
  assert.equal(daysUntil('2026-10-10', new Date(2026, 9, 8, 15)), 2);
  assert.equal(daysUntil('2026-10-07', new Date(2026, 9, 8)), -1);
});

test('layout packs frames into the shortest lane and flows cards', () => {
  const sections = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const cardIds = { a: ['1', '2', '3'], b: ['4'], c: [] };
  const heights = { 1: 100, 2: 100, 3: 100, 4: 100 };
  const L = layout({ sections, cardIds, heights, cols: 2, lanes: 2 });
  assert.equal(L.frames.a.x, 0);
  assert.ok(L.frames.b.x > 0, 'b goes to the second lane');
  assert.equal(L.frames.c.x, L.frames.b.x, 'c goes under b (shorter lane)');
  assert.notEqual(L.cards[1].x, L.cards[2].x, 'two columns inside a frame');
  assert.ok(L.cards[3].y > L.cards[1].y, 'third card flows under the first');
  assert.ok(L.height > 0 && L.width > 0);
});

test('collapsed sections only take their header', () => {
  const L = layout({ sections: [{ id: 'a', collapsed: true }], cardIds: { a: ['1'] }, heights: { 1: 200 }, cols: 1, lanes: 1 });
  assert.equal(L.frames.a.h, 48);
  assert.equal(L.cards[1], undefined);
});

test('pickProfile gives one narrow column on phones', () => {
  assert.deepEqual(pickProfile(390), { cols: 1, lanes: 1 });
  assert.equal(pickProfile(1440).cols, 2);
  assert.ok(pickProfile(1440).lanes >= 2);
});

test('insertionIndex', () => {
  const pos = { a: { x: 0, y: 0 }, b: { x: 0, y: 112 } };
  const hs = { a: 100, b: 100 };
  assert.equal(insertionIndex([], pos, hs, 0, 0), 0);
  assert.equal(insertionIndex(['a', 'b'], pos, hs, 10, 5), 0);
  assert.equal(insertionIndex(['a', 'b'], pos, hs, 10, 300), 2);
  assert.equal(insertionIndex(['a', 'b'], pos, hs, 10, 100), 1);
  assert.equal(CARD_W, 232);
});

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wb-'));

test('store seeds, applies ops, undoes, and persists', () => {
  const dir = tmp();
  const s = new Store(dir);
  assert.ok(s.data.cards.some((c) => c.title === 'Mehendi'));
  const r = s.apply([
    { op: 'add_card', card: { section: 'Venues', title: 'Taj Falaknuma', estimate: '12 lakh', count: 250, tags: 'Sangeet, Pheras', status: 'booked', side: 'both', date: '2027-02-14' } },
    { op: 'add_card', card: { section: 'nope', title: 'Orphan' } },
    { op: 'add_card', card: { section: 'venues' } },
    { op: 'bogus' },
  ]);
  assert.equal(r.applied.length, 2);
  assert.equal(r.errors.length, 2);
  const v = s.data.cards.find((c) => c.title === 'Taj Falaknuma');
  assert.equal(v.section, 'venues');
  assert.equal(v.estimate, 1200000);
  assert.deepEqual(v.tags, ['Sangeet', 'Pheras']);
  assert.equal(s.data.cards.find((c) => c.title === 'Orphan').section, 'ideas', 'unknown section lands in the inbox');

  s.apply([{ op: 'update_card', id: v.id, patch: { paid: '2 lakh', status: null, section: 'vendors' } }]);
  const u = s.data.cards.find((c) => c.id === v.id);
  assert.equal(u.paid, 200000);
  assert.equal(u.status, undefined);
  assert.equal(u.section, 'vendors');

  assert.ok(s.undo());
  assert.equal(s.data.cards.find((c) => c.id === v.id).section, 'venues');

  const again = new Store(dir);
  assert.ok(again.data.cards.some((c) => c.title === 'Taj Falaknuma'), 'persisted to disk');
});

test('move_card places at the requested index within a section', () => {
  const board = { sections: [{ id: 'x', title: 'X' }, { id: 'y', title: 'Y' }], cards: [], settings: {} };
  applyOps(board, ['a', 'b', 'c'].map((t) => ({ op: 'add_card', card: { section: 'x', title: t } })));
  applyOps(board, [{ op: 'add_card', card: { section: 'y', title: 'z' } }]);
  const id = (t) => board.cards.find((c) => c.title === t).id;
  applyOps(board, [{ op: 'move_card', id: id('c'), section_id: 'x', index: 0 }]);
  assert.deepEqual(board.cards.filter((c) => c.section === 'x').map((c) => c.title), ['c', 'a', 'b']);
  applyOps(board, [{ op: 'move_card', id: id('a'), section_id: 'y', index: 0 }]);
  assert.deepEqual(board.cards.filter((c) => c.section === 'y').map((c) => c.title), ['a', 'z']);
});

test('images must be our own uploads; attachments resolve by index', () => {
  const board = { sections: [{ id: 'outfits', title: 'Outfits' }], cards: [], settings: {} };
  applyOps(board, [
    { op: 'add_card', card: { section: 'outfits', title: 'Bad', img: { url: 'http://evil.example/x.png' } } },
    { op: 'add_card', card: { section: 'outfits', title: 'Peach lehenga', attachment: 0 } },
  ], { attachments: [{ url: '/uploads/abc-123.jpg', w: 900, h: 1200 }] });
  assert.equal(board.cards[0].img, undefined);
  assert.deepEqual(board.cards[1].img, { url: '/uploads/abc-123.jpg', w: 900, h: 1200 });
});

test('deleting a section moves its cards to the inbox', () => {
  const s = new Store(tmp());
  const n = s.data.cards.filter((c) => c.section === 'events').length;
  s.apply([{ op: 'delete_section', id: 'events' }]);
  assert.ok(!s.data.sections.some((x) => x.id === 'events'));
  assert.equal(s.data.cards.filter((c) => c.section === 'ideas').length, n);
  s.apply([{ op: 'delete_section', id: 'overview' }]);
  assert.ok(s.data.sections.some((x) => x.id === 'overview'), 'dashboard cannot be deleted');
});

test('fallback routes by keyword and extracts amounts', () => {
  const p = fallbackPlan('Found a lehenga at Frontier Raas for 8 lakh');
  assert.equal(p.ops[0].card.section, 'outfits');
  assert.equal(p.ops[0].card.estimate, 800000);
  assert.equal(fallbackPlan('', [{ url: '/uploads/a.jpg' }]).ops[0].card.attachment, 0);
});
