// The complete planning checklist for an Indian wedding, grouped by how far ahead each step is usually done.
// `months` = months before the wedding by which the phase should be finished (used to show a due date).
// `section` links a step to the board section where the related notes live.

export const PHASES = [
  { id: 'p12', title: 'Foundations', when: '12+ months before', months: 12 },
  { id: 'p9', title: 'Book the big vendors', when: '9 to 12 months before', months: 9 },
  { id: 'p6', title: 'Outfits, music, invitations', when: '6 to 9 months before', months: 6 },
  { id: 'p3', title: 'Details and logistics', when: '3 to 6 months before', months: 3 },
  { id: 'p1', title: 'Confirm everything', when: '1 to 3 months before', months: 1 },
  { id: 'p0', title: 'Final fortnight', when: 'Last 2 weeks', months: 0.5 },
  { id: 'week', title: 'Wedding week', when: 'The week itself', months: 0 },
  { id: 'after', title: 'After the wedding', when: 'First month after', months: -1 },
];

const T = {
  p12: [
    ['Agree the total budget and who pays for what (both families)', 'budget'],
    ['Split the budget across functions and categories', 'budget'],
    ['Decide which functions to hold (roka, mehendi, haldi, sangeet, wedding, reception)', 'events'],
    ['Consult the pandit / families for muhurat and fix the dates', 'events'],
    ['Draft the guest list for each side (A / B / C lists)', 'guests'],
    ['Decide the city and style: home town, destination, palace, banquet, lawn', 'venues'],
    ['Shortlist and visit venues (capacity, parking, rain backup, outside catering, curfew)', 'venues'],
    ['Book the venue(s) and pay the advance', 'venues'],
    ['Decide: wedding planner or family-run, and who is in charge of what', 'vendors'],
    ['Start a shared moodboard: colours, theme, decor, outfits', 'decor'],
  ],
  p9: [
    ['Book the photographer and videographer', 'media'],
    ['Book the caterer (or confirm the venue kitchen) after tastings', 'food'],
    ['Book the decorator / florist and share the theme', 'decor'],
    ['Book the makeup artist and hair stylist after trials', 'jewellery'],
    ['Book the mehendi artist', 'jewellery'],
    ['Block hotel rooms for out-of-town guests', 'travel'],
    ['Send save-the-dates to people who need to travel', 'invites'],
    ['Start bridal outfit research and designer appointments', 'outfits'],
    ['Decide gold and jewellery plan: buy, reuse, exchange', 'jewellery'],
    ['Plan the pre-wedding shoot (location, date, outfits)', 'media'],
  ],
  p6: [
    ['Order the bridal lehenga / sarees (custom work takes 4 to 6 months)', 'outfits'],
    ['Order the groom sherwani and outfits for each function', 'outfits'],
    ['Buy or order jewellery and accessories for each outfit', 'jewellery'],
    ['Book DJ / band / dhol and any performers', 'media'],
    ['Book the sangeet choreographer and pick songs', 'media'],
    ['Confirm the pandit and get the list of rituals', 'events'],
    ['Design invitations (printed and digital) and finalise the wording', 'invites'],
    ['Collect addresses and phone numbers for the full guest list', 'guests'],
    ['Plan the honeymoon; check passports and visas', 'travel'],
    ['Book baraat arrangements: ghodi / car, band, safas', 'events'],
  ],
  p3: [
    ['Send invitations (cards, boxes, WhatsApp e-invites)', 'invites'],
    ['Finalise menus for every function; tasting done', 'food'],
    ['Finalise decor for each function: mandap, stage, entrance, seating', 'decor'],
    ['Outfits for parents, siblings and close family', 'outfits'],
    ['Order return gifts / favours and welcome hampers', 'invites'],
    ['Arrange guest transport: airport and station pickups, shuttles', 'travel'],
    ['Start sangeet rehearsals', 'media'],
    ['Buy rings, varmala, kaleere, chooda and other ceremony items', 'jewellery'],
    ['Book honeymoon flights and stay', 'travel'],
    ['Trousseau and gifts for the in-laws (milni, shagun) decided', 'invites'],
    ['Begin skin, hair and fitness routines', 'jewellery'],
  ],
  p1: [
    ['Chase RSVPs and get a headcount per function', 'guests'],
    ['Allot hotel rooms and share a rooming list with the hotel', 'travel'],
    ['Final outfit fittings for bride, groom and family', 'outfits'],
    ['Write the hour-by-hour run sheet for every function', 'events'],
    ['Get the puja samagri list from the pandit and assign who buys it', 'events'],
    ['Walk through the venue with decorator, caterer and photographer', 'venues'],
    ['Give the photographer a shot list and the family group list', 'media'],
    ['Finalise playlists, entry songs and the sangeet line-up', 'media'],
    ['Seating and stage plan; reserved seating for elders', 'decor'],
    ['Book the marriage registration appointment; gather documents', 'todo'],
    ['Makeup and hair trial with the final look', 'jewellery'],
    ['Write the payment schedule: who is owed what, and when', 'budget'],
  ],
  p0: [
    ['Give final headcounts to the caterer and hotel', 'food'],
    ['Reconfirm timing and arrival with every vendor; share the run sheet', 'vendors'],
    ['Prepare shagun envelopes, tips and cash for the day', 'budget'],
    ['Name one point of contact for vendors on each day (not the couple)', 'vendors'],
    ['Pack an emergency kit: safety pins, sewing kit, medicines, chargers', 'todo'],
    ['Collect all outfits and jewellery; try everything on once', 'outfits'],
    ['Assemble welcome hampers and room notes', 'invites'],
    ['Pack for the honeymoon', 'travel'],
    ['Haircut, facial, mehendi date confirmed', 'jewellery'],
  ],
  week: [
    ['Welcome desk and room check-ins for arriving guests', 'travel'],
    ['Hand each vendor their balance as agreed', 'budget'],
    ['Someone trusted keeps the jewellery, shagun and gifts safe', 'todo'],
    ['Keep a list of gifts and shagun received (for thank-yous)', 'invites'],
    ['Eat, sleep and hand the phone to someone else', 'todo'],
  ],
  after: [
    ['Settle final vendor payments and collect deposits', 'budget'],
    ['Collect the marriage certificate', 'todo'],
    ['Send thank-you notes and photos to guests', 'invites'],
    ['Choose photos for the album; review the video cut', 'media'],
    ['Return rentals; dry-clean and store the outfits', 'outfits'],
    ['Update names and documents if you are changing them', 'todo'],
    ['Review the vendors who did well', 'vendors'],
  ],
};

export function seedPlan() {
  const out = [];
  for (const ph of PHASES) T[ph.id].forEach(([title, section], i) => out.push({ id: `${ph.id}-${i + 1}`, phase: ph.id, title, section }));
  return out;
}
