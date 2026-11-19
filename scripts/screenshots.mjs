// Regenerates docs/screenshots/*. Needs: npm i --no-save playwright && npx playwright install chromium
// Usage: node scripts/screenshots.mjs   (starts its own server on a temp data dir with demo cards)
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = 3999, base = `http://localhost:${PORT}`;
const dir = mkdtempSync(path.join(tmpdir(), 'ideax-'));
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, WB_DATA_DIR: dir, WB_UPLOADS_DIR: dir, LITELLM_API_KEY: 'demo' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const card = (section, title, body, extra = {}) => ({ op: 'add_card', card: { section, title, body, ...extra } });
const ops = [
  card('product', 'Supplier risk scoring', 'Score vendors on delivery, financial and compliance signals before renewal.', { tags: ['procurement', 'q1'], stage: 'discuss' }),
  card('product', 'Self-service access requests', 'Replace the ticket queue with a request portal and manager approval.', { tags: ['it'], stage: 'locked' }),
  card('product', 'Contract clause library', 'Searchable, pre-approved clauses for legal review.', { tags: ['legal'] }),
  card('design', 'One design system across teams', 'Shared components for the internal tools portfolio.', { tags: ['platform'] }),
  card('design', 'Replace the 14-step onboarding form', '', { look: 'quote' }),
  card('marketing', 'Customer advisory council', 'Quarterly sessions with ten strategic accounts.', { tags: ['customers'], stage: 'locked' }),
  card('marketing', 'Partner enablement kit', 'Playbook and demo environment for reseller teams.'),
  card('research', 'Interview findings: field service', 'Technicians re-enter the same data in three systems.', { tags: ['research'] }),
  card('todo', 'Confirm data residency requirements', '', { look: 'task', status: 'done' }),
  card('todo', 'Book security review for pilot', '', { look: 'task' }),
  card('ideas', 'Could the agent merge near-duplicate ideas across teams?', '', { stage: 'parked' }),
];
await fetch(`${base}/api/ops`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops }) });

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const out = 'docs/screenshots';
const desk = await (await b.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: 'light' })).newPage();
await desk.goto(base); await desk.waitForTimeout(1200);
await desk.screenshot({ path: `${out}/overview.png` });
const dk = await (await b.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: 'dark' })).newPage();
await dk.goto(base); await dk.waitForTimeout(1200);
await dk.screenshot({ path: '/tmp/claude-1000/dark.png' });
await b.close(); srv.kill();
