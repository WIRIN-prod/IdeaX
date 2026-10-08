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

test('layout: banner on top, sections in lanes, empty sections become slim bars at the end', () => {
  const sections = [{ id: 'top', kind: 'dashboard' }, { id: 'empty' }, { id: 'a' }, { id: 'b' }];
  const cardIds = { empty: [], a: ['1', '2', '3'], b: ['4'] };
  const heights = { top: 200, 1: 100, 2: 100, 3: 100, 4: 100 };
  const L = layout({ sections, cardIds, heights, cols: 2, lanes: 2 });
  assert.deepEqual([L.frames.top.x, L.frames.top.y, L.frames.top.w], [0, 0, L.width], 'banner spans the board');
  assert.ok(L.frames.a.y >= 200 && L.frames.b.y >= 200, 'sections start below the banner');
  assert.equal(L.frames.a.x, 0);
  assert.ok(L.frames.b.x > 0, 'b goes to the second lane');
  assert.ok(L.frames.empty.slim && L.frames.empty.h < L.frames.b.h, 'empty section is a slim bar');
  assert.ok(L.frames.empty.y > L.frames.b.y, 'and is placed after the filled ones');
  assert.notEqual(L.cards[1].x, L.cards[2].x, 'two columns inside a section');
  assert.ok(L.cards[3].y > L.cards[1].y, 'third card flows under the first');
});

test('layout: a featured (wide) card takes a full row', () => {
  const L = layout({ sections: [{ id: 'a' }], cardIds: { a: ['1', 'w', '2', '3'] }, heights: { 1: 100, w: 80, 2: 50, 3: 50 }, wide: { w: true }, cols: 2, lanes: 1 });
  assert.equal(L.cards.w.x, L.cards[1].x, 'wide card starts at the left edge');
  assert.ok(L.cards.w.y > L.cards[1].y, 'below what came before');
  assert.equal(L.cards[2].y, L.cards[3].y, 'both columns resume below it');
  assert.ok(L.cards[2].y > L.cards.w.y);
});

test('collapsed sections only take their header', () => {
  const L = layout({ sections: [{ id: 'a', collapsed: true }], cardIds: { a: ['1'] }, heights: { 1: 200 }, cols: 1, lanes: 1 });
  assert.equal(L.frames.a.h, 58);
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

test('deleted cards go to the trash and can be restored', () => {
  const s = new Store(tmp());
  const id = s.data.cards.find((c) => c.title === 'Haldi').id;
  s.apply([{ op: 'delete_card', id }]);
  assert.ok(!s.data.cards.some((c) => c.id === id));
  assert.equal(s.data.trash[0].id, id);
  s.apply([{ op: 'restore_card', id }]);
  assert.equal(s.data.cards.find((c) => c.id === id).section, 'events');
  assert.equal(s.data.trash.length, 0);
});

test('raw captures appear at once, keep the original words, and settle', () => {
  const s = new Store(tmp());
  const long = 'mom wants marigolds everywhere but I really want a pastel palette, need to find a middle ground somehow';
  const ids = s.addRaw([{ text: long }, { img: { url: '/uploads/a-1.jpg', w: 800, h: 600 } }, { text: '   ' }]);
  assert.equal(ids.length, 2);
  const [note, photo] = ids.map((id) => s.data.cards.find((c) => c.id === id));
  assert.equal(note.section, 'ideas');
  assert.equal(note.source, long);
  assert.equal(note.look, 'sticky');
  assert.ok(note.pending && photo.pending && photo.img);
  s.apply([{ op: 'update_card', id: note.id, patch: { title: 'Marigold vs pastel', section: 'decor', look: 'quote', colors: ['#F4A300', 'nope'], featured: true } }]);
  assert.equal(note.source, long, 'original text survives being organised');
  assert.deepEqual([note.section, note.look, note.featured, note.colors], ['decor', 'quote', true, ['#F4A300']]);
  s.settle(ids);
  assert.ok(!s.data.cards.some((c) => c.pending));
});

test('order_section reorders one section and leaves others alone', () => {
  const board = { sections: [{ id: 'x', title: 'X' }, { id: 'y', title: 'Y' }], cards: [], settings: {} };
  applyOps(board, [['x', 'a'], ['y', 'm'], ['x', 'b'], ['x', 'c']].map(([section, title]) => ({ op: 'add_card', card: { section, title } })));
  const id = (t) => board.cards.find((c) => c.title === t).id;
  applyOps(board, [{ op: 'order_section', section_id: 'x', ids: [id('c'), id('a')] }]);
  assert.deepEqual(board.cards.filter((c) => c.section === 'x').map((c) => c.title), ['c', 'a', 'b']);
  assert.deepEqual(board.cards.filter((c) => c.section === 'y').map((c) => c.title), ['m']);
});
