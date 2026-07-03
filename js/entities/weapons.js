'use strict';
/* weapons.js — melee weapon archetypes. dmg in hearts-equivalent,
   reach in world px, arc in radians (hit sector width), dur = durability. */

const WEAPONS = {
  fists:    { name: 'Bare Hands',        type: 'fists',    icon: 'sword',    dmg: 1, dur: Infinity, maxDur: Infinity, reach: 16, arc: 1.4, swing: 0.26, knock: 60 },
  sword:    { name: "Traveler's Sword",  type: 'sword',    icon: 'sword',    dmg: 3, dur: 24, maxDur: 24, reach: 22, arc: 1.5, swing: 0.28, knock: 130 },
  claymore: { name: "Knight's Claymore", type: 'claymore', icon: 'claymore', dmg: 6, dur: 20, maxDur: 20, reach: 30, arc: 2.1, swing: 0.5, knock: 220 },
  spear:    { name: "Traveler's Spear",  type: 'spear',    icon: 'spear',    dmg: 4, dur: 28, maxDur: 28, reach: 36, arc: 0.7, swing: 0.24, knock: 110 },
};

function makeWeapon(key) {
  const w = WEAPONS[key] || WEAPONS.sword;
  return { key, name: w.name, type: w.type, icon: w.icon, dmg: w.dmg, dur: w.dur, maxDur: w.maxDur, reach: w.reach, arc: w.arc, swing: w.swing, knock: w.knock };
}
