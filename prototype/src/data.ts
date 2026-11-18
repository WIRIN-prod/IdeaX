export type Stage = 'captured' | 'review' | 'hold' | 'approved' | 'duplicate';
export type Kind = 'text' | 'link' | 'image';
export interface Comment { author: string; text: string; t: number }
export interface Card {
  id: string; n: number; title: string; body: string; section: string; stage: Stage; kind: Kind;
  author: string; votes: number; voted?: boolean; comments: Comment[]; tags: string[];
  link?: { domain: string; title: string }; img?: { hue: number; src?: string; caption: string };
  impact: number; effort: number; pinned?: boolean; dupOf?: string; dupScore?: number; updated: number; ai?: boolean;
}
export interface Person { id: string; name: string; hue: number }
export const PEOPLE: Person[] = [
  { id: 'AM', name: 'Alex Morgan', hue: 250 }, { id: 'PN', name: 'Priya Nair', hue: 330 }, { id: 'ML', name: 'Marcus Lee', hue: 170 },
  { id: 'SR', name: 'Sofia Reyes', hue: 30 }, { id: 'DP', name: 'Dev Patel', hue: 205 },
];
export const ME = 'AM';
export const person = (id: string) => PEOPLE.find((p) => p.id === id) ?? PEOPLE[0];
export const STAGES: { id: Stage; label: string; css: string }[] = [
  { id: 'captured', label: 'Captured', css: 'var(--st-captured)' }, { id: 'review', label: 'Under Review', css: 'var(--st-review)' },
  { id: 'hold', label: 'On Hold', css: 'var(--st-hold)' }, { id: 'approved', label: 'Approved', css: 'var(--st-approved)' },
  { id: 'duplicate', label: 'Duplicate Flagged', css: 'var(--st-duplicate)' },
];
export const stageOf = (s: Stage) => STAGES.find((x) => x.id === s)!;
export const SECTIONS = [
  { id: 'customer', title: 'Customer & Market', css: 'var(--sec-customer)', summary: 'Top theme: onboarding friction', words: ['customer', 'user', 'churn', 'nps', 'pain', 'support', 'onboarding', 'market', 'competitor', 'survey'] },
  { id: 'platform', title: 'Platform & Tech', css: 'var(--sec-platform)', summary: 'Top theme: integration and access', words: ['api', 'sso', 'security', 'latency', 'data', 'integration', 'platform', 'migration', 'model', 'infra', 'sdk'] },
  { id: 'ops', title: 'Operations & Cost', css: 'var(--sec-ops)', summary: 'Top theme: manual review effort', words: ['cost', 'procurement', 'vendor', 'process', 'automate', 'compliance', 'audit', 'invoice', 'supply', 'contract'] },
  { id: 'growth', title: 'Growth & GTM', css: 'var(--sec-growth)', summary: 'Top theme: partner channel', words: ['partner', 'pricing', 'launch', 'campaign', 'sales', 'marketing', 'referral', 'expansion', 'channel', 'reseller'] },
];
export const secOf = (id: string) => SECTIONS.find((s) => s.id === id)!;
export const ago = (min: number) => Date.now() - min * 60000;
export const idOf = (n: number) => `IDX-${n}`;

const c = (n: number, p: Partial<Card> & Pick<Card, 'title' | 'body' | 'section' | 'stage' | 'author'>): Card => ({
  id: idOf(n), n, kind: 'text', votes: 0, comments: [], tags: [], impact: 3, effort: 3, updated: ago(60), ...p,
});
export const SEED: Card[] = [
  c(101, { title: 'Replace the 14-step onboarding form with a guided setup', body: 'New admins abandon setup at step 6. Defer optional fields and pre-fill from the identity provider.', section: 'customer', stage: 'review', author: 'PN', votes: 14, tags: ['onboarding', 'activation'], impact: 5, effort: 3, updated: ago(12), comments: [{ author: 'ML', text: 'Support sees this in 1 of 3 tickets.', t: ago(300) }] }),
  c(102, { title: 'Quarterly customer advisory council', body: 'Ten strategic accounts, one working session per quarter, roadmap input before planning.', section: 'customer', stage: 'approved', author: 'SR', votes: 9, tags: ['research', 'strategic'], impact: 4, effort: 2, updated: ago(190) }),
  c(103, { title: 'Why enterprise trials stall after week two', body: 'Interview synthesis from twelve lost trials: no executive sponsor and no import path for existing data.', section: 'customer', stage: 'captured', author: 'AM', votes: 6, kind: 'link', link: { domain: 'research.acme.com', title: 'Trial drop-off study, Q3 interviews' }, tags: ['research', 'activation'], impact: 4, effort: 2, updated: ago(35), ai: true }),
  c(104, { title: 'Self-service SSO setup for customer admins', body: 'Remove the support ticket from SAML configuration with a guided connection tester.', section: 'platform', stage: 'approved', author: 'DP', votes: 18, tags: ['sso', 'security'], impact: 5, effort: 4, pinned: true, updated: ago(400), comments: [{ author: 'AM', text: 'Approved for Q1, security review booked.', t: ago(380) }] }),
  c(105, { title: 'Public API rate-limit dashboard', body: 'Show customers their usage against limits before they hit a 429.', section: 'platform', stage: 'review', author: 'ML', votes: 7, tags: ['api', 'observability'], impact: 3, effort: 2, updated: ago(90) }),
  c(106, { title: 'Streaming ingest architecture reference', body: 'Option B halves p95 latency for the event pipeline; migration path is incremental.', section: 'platform', stage: 'hold', author: 'DP', votes: 4, kind: 'link', link: { domain: 'wiki.acme.com', title: 'Event pipeline: options A, B, C' }, tags: ['data', 'latency'], impact: 4, effort: 5, updated: ago(1500) }),
  c(107, { title: 'Single sign-on wizard for admins', body: 'Guide admins through connecting their identity provider step by step.', section: 'platform', stage: 'duplicate', author: 'SR', votes: 3, tags: ['sso'], impact: 5, effort: 4, dupOf: 'IDX-104', dupScore: 0.91, updated: ago(20), ai: true }),
  c(108, { title: 'Automate vendor contract renewal reminders', body: 'Finance misses auto-renew windows. A 90-day alert with owner and spend would cover most of it.', section: 'ops', stage: 'review', author: 'AM', votes: 11, tags: ['procurement', 'automate'], impact: 4, effort: 1, updated: ago(55) }),
  c(109, { title: 'Invoice exception queue with suggested fixes', body: 'Triage the 8% of invoices that fail three-way match, grouped by cause.', section: 'ops', stage: 'captured', author: 'ML', votes: 5, kind: 'image', img: { hue: 172, caption: 'Whiteboard: exception causes by volume' }, tags: ['finance', 'automate'], impact: 3, effort: 3, updated: ago(130) }),
  c(110, { title: 'Consolidate three approval tools into one', body: 'Same request routed through email, a form, and a ticket. One audit trail would simplify compliance.', section: 'ops', stage: 'hold', author: 'PN', votes: 8, tags: ['compliance', 'process'], impact: 3, effort: 5, updated: ago(2200) }),
  c(111, { title: 'Reseller enablement kit', body: 'Playbook, demo environment and a tiered margin model for the first five partners.', section: 'growth', stage: 'review', author: 'SR', votes: 10, tags: ['partner', 'channel'], impact: 4, effort: 3, updated: ago(75) }),
  c(112, { title: 'Usage-based pricing pilot for the API tier', body: 'Test with 20 accounts before changing list prices.', section: 'growth', stage: 'captured', author: 'AM', votes: 2, kind: 'link', link: { domain: 'pricing.acme.com', title: 'Pilot design and success metrics' }, tags: ['pricing'], impact: 3, effort: 2, updated: ago(15), ai: true }),
  c(113, { title: 'Customer story video: 6 weeks to 6 days', body: 'Logistics customer shortened onboarding. Footage cleared for external use.', section: 'growth', stage: 'approved', author: 'PN', votes: 6, kind: 'image', img: { hue: 28, caption: 'Customer story storyboard' }, tags: ['campaign', 'proof'], impact: 2, effort: 2, updated: ago(600) }),
  c(114, { title: 'Referral credits for existing admins', body: 'Credit applied to the next renewal when a referred team goes live.', section: 'growth', stage: 'hold', author: 'DP', votes: 3, tags: ['referral'], impact: 2, effort: 4, updated: ago(3000) }),
];
