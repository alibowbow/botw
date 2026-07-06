'use strict';
/* weapons.js — melee weapon archetypes plus optional elemental variants.
   dmg in hearts-equivalent, reach in world px, arc in radians, dur = durability.
   An elemental key looks like "claymore_fire" (base "_" element). */

const WEAPONS = {
  fists:    { name: 'Bare Hands',        type: 'fists',    icon: 'sword',    dmg: 1, dur: Infinity, maxDur: Infinity, reach: 16, arc: 1.4, swing: 0.26, knock: 60 },
  sword:    { name: "Traveler's Sword",  type: 'sword',    icon: 'sword',    dmg: 3, dur: 24, maxDur: 24, reach: 22, arc: 1.5, swing: 0.28, knock: 130 },
  claymore: { name: "Knight's Claymore", type: 'claymore', icon: 'claymore', dmg: 6, dur: 20, maxDur: 20, reach: 30, arc: 2.1, swing: 0.5, knock: 220 },
  spear:    { name: "Traveler's Spear",  type: 'spear',    icon: 'spear',    dmg: 4, dur: 28, maxDur: 28, reach: 36, arc: 0.7, swing: 0.24, knock: 110 },
};

const ELEMENTS = {
  fire:  { name: 'Flameblade', col: '#ff7a3a', dmg: 2, dur: 8 },
  ice:   { name: 'Frostspire', col: '#7ad0ff', dmg: 1, dur: 8 },
  shock: { name: 'Thunderstorm', col: '#ffe14a', dmg: 3, dur: 8 },
};

function makeWeapon(key) {
  let base = key, element = null;
  const us = key.indexOf('_');
  if (us > 0) { base = key.slice(0, us); element = key.slice(us + 1); }
  const w = WEAPONS[base] || WEAPONS.sword;
  const wep = {
    key, name: w.name, type: base, icon: w.icon,
    dmg: w.dmg, dur: w.dur, maxDur: w.maxDur, reach: w.reach, arc: w.arc, swing: w.swing, knock: w.knock,
    element: null, elemCol: null,
  };
  const E = element && ELEMENTS[element];
  if (E) {
    wep.element = element;
    wep.elemCol = E.col;
    wep.name = E.name + ' ' + w.name;
    wep.dmg = w.dmg + E.dmg;
    wep.dur = w.dur + E.dur;
    wep.maxDur = (isFinite(w.maxDur) ? w.maxDur : 0) + E.dur;
  }
  return wep;
}
