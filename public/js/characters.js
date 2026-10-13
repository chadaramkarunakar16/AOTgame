/* =========================================================================
   Factions and the character roster.
   Each character is a skin + a small perk. `titan` names the titan form a
   character could shift into: the data and the transform hook exist now, and
   shifting is gated behind the lobby's experimental switch (SHIFTING).
   ========================================================================= */

export const FACTIONS = {
  corps:    { name: 'Skyward Legion', short: 'LEGION', color: '#7dffb0', weapon: 'blades', desc: 'Twin blades and Vector Gear. Deflect bullets with a well-timed slash.' },
  interior: { name: 'Interior Squad', short: 'INTERIOR', color: '#ff8a7a', weapon: 'guns', desc: 'Vector Gear rigged with twin single-shot pistols. Two shots, then reload.' },
  titans:   { name: 'Titans', short: 'TITANS', color: '#ffb070', weapon: 'titan', desc: 'Champion titans. Smash the district, devour scouts.' }
};

// perks: gas (consumption multiplier), speed (max-speed multiplier), cut (cut-depth speed multiplier),
// spin (spin-cut threshold multiplier), hp, swap (blade swap time multiplier), pickup (fuel pickup radius mult),
// sense (nape-sense range bonus), reload (gun reload multiplier)
export const CHARACTERS = {
  // ---------------------------------------------------------------- Skyward Legion
  recruit: { faction: 'corps', name: 'Recruit', title: 'Legion cadet', perk: 'No perk. Pure skill.', pal: {}, opts: {} },
  leroy: { faction: 'corps', name: 'Leroy', title: "The Legion's sharpest blade", perk: 'Spin cuts at lower speed, 20% better gas use, faster blade swaps.',
    gas: 0.8, spin: 0.7, swap: 0.6,
    pal: { hair: [22, 20, 22], eye: [70, 80, 90], skin: [232, 206, 182], shirt: [246, 246, 240] }, opts: { cravat: true } },
  misaki: { faction: 'corps', name: 'Misaki', title: 'The silent blade', perk: 'Deep cuts at lower speed. +10 health.',
    cut: 1.3, hp: 110,
    pal: { hair: [20, 18, 22], eye: [40, 40, 50], skin: [238, 214, 192] }, opts: { scarf: 0x5e2a6e, longHair: true } },
  ezra: { faction: 'corps', name: 'Ezra', title: 'The furious one', perk: 'Faster top speed. Titan form: Fury Titan.',
    speed: 1.08, titan: 'attack',
    pal: { hair: [70, 46, 28], eye: [60, 160, 110], skin: [232, 196, 162] }, opts: {} },
  arlo: { faction: 'corps', name: 'Arlo', title: 'The strategist', perk: 'Nape sense reaches 25 m further. Titan form: Behemoth Titan.',
    sense: 25, titan: 'colossal',
    pal: { hair: [230, 200, 110], eye: [70, 130, 200], skin: [240, 214, 190] }, opts: { longHair: true } },
  jules: { faction: 'corps', name: 'Jules', title: 'Squad leader', perk: '15% better gas use. +5 health.',
    gas: 0.85, hp: 105,
    pal: { hair: [120, 90, 56], eye: [110, 90, 60], skin: [232, 200, 170] }, opts: {} },
  sadie: { faction: 'corps', name: 'Sadie', title: 'Hunter', perk: 'Grabs fuel canisters from much further away.',
    pickup: 1.8,
    pal: { hair: [110, 66, 36], eye: [120, 80, 40], skin: [236, 200, 168] }, opts: { longHair: true } },
  cody: { faction: 'corps', name: 'Cody', title: 'Quick feet', perk: 'Faster on the ground and quicker blade swaps.',
    run: 1.2, swap: 0.8,
    pal: { hair: [60, 60, 64], eye: [80, 70, 60], skin: [226, 190, 160] }, opts: { buzz: true } },
  harper: { faction: 'corps', name: 'Harper', title: 'Titan researcher', perk: 'Nape sense reaches 15 m further. Limb cuts score double.',
    sense: 15, limb: 2,
    pal: { hair: [96, 62, 40], eye: [120, 90, 60], skin: [234, 200, 172] }, opts: { glasses: true, longHair: true } },
  edmund: { faction: 'corps', name: 'Edmund', title: 'Commander', perk: '+15 health. Assists score double.',
    hp: 115, assist: 2,
    pal: { hair: [222, 196, 120], eye: [80, 130, 200], skin: [236, 206, 180] }, opts: { bolo: true } },
  // ---------------------------------------------------------------- Interior Squad
  officer: { faction: 'interior', name: 'Interior Officer', title: 'Squad regular', perk: 'No perk. Pure aim.', pal: {}, opts: {} },
  kurt: { faction: 'interior', name: 'Kurt', title: 'The Cutthroat', perk: 'Reloads 35% faster. 15% better gas use.',
    reload: 0.65, gas: 0.85,
    pal: { hair: [40, 34, 30], eye: [60, 70, 80], skin: [226, 196, 170] }, opts: { hat: 0x2a2626 } },
  trudy: { faction: 'interior', name: 'Trudy', title: 'Squad captain', perk: 'Bullets fly 15% faster.',
    bullet: 1.15,
    pal: { hair: [200, 180, 150], eye: [80, 90, 110], skin: [236, 210, 188] }, opts: { longHair: true } },
  // ---------------------------------------------------------------- shifter humans (play as human, titan form for the future)
  anika: { faction: 'interior', name: 'Anika', title: 'The quiet one', perk: 'Faster top speed. Titan form: Huntress Titan.',
    speed: 1.06, titan: 'female',
    pal: { hair: [230, 206, 140], eye: [90, 130, 170], skin: [240, 216, 196] }, opts: {} },
  ryker: { faction: 'corps', name: 'Ryker', title: 'The soldier', perk: '+20 health. Titan form: Ironclad Titan.',
    hp: 120, titan: 'armored',
    pal: { hair: [214, 186, 110], eye: [140, 120, 70], skin: [230, 196, 166] }, opts: { buzz: true } },
  yara: { faction: 'corps', name: 'Yara', title: 'The wildcard', perk: 'Faster on the ground. Titan form: Fang Titan.',
    run: 1.2, titan: 'jaw',
    pal: { hair: [70, 46, 30], eye: [120, 90, 50], skin: [214, 170, 136] }, opts: { longHair: true } }
};

export const CORPS_ROSTER = ['recruit', 'leroy', 'misaki', 'ezra', 'arlo', 'jules', 'sadie', 'cody', 'harper', 'edmund', 'ryker', 'yara'];
export const INTERIOR_ROSTER = ['officer', 'kurt', 'trudy', 'anika'];

// faction outfits layered under each character's own palette
const OUTFIT = {
  corps: { jacket: [168, 124, 78], pants: [196, 190, 176], cape: [38, 62, 104], strap: [72, 48, 30], boot: [60, 42, 30] },
  interior: { jacket: [34, 34, 40], pants: [52, 50, 58], cape: [34, 34, 40], strap: [20, 20, 24], boot: [24, 22, 24], shirt: [200, 196, 190] }
};
export function charLook(id) {
  const c = CHARACTERS[id] || CHARACTERS.recruit;
  const pal = Object.assign({}, OUTFIT[c.faction] || OUTFIT.corps, c.pal);
  const opts = Object.assign({ gear: true }, c.opts);
  if (c.faction === 'interior') { opts.cape = false; opts.coat = true; opts.guns = true; }
  return { pal, opts };
}
export function charStats(id) {
  const c = CHARACTERS[id] || CHARACTERS.recruit;
  return { gas: c.gas || 1, speed: c.speed || 1, cut: c.cut || 1, spin: c.spin || 1, hp: c.hp || 100, swap: c.swap || 1, pickup: c.pickup || 1,
    sense: c.sense || 0, run: c.run || 1, limb: c.limb || 1, assist: c.assist || 1, reload: c.reload || 1, bullet: c.bullet || 1 };
}

// experimental: lobby switch that lets characters with a titan form transform mid-match (key T)
export const SHIFTING = { enabled: false, cooldown: 90, duration: 60 };
