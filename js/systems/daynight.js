'use strict';
/* daynight.js — advances a day/night clock and yields a colour tint plus a
   night factor used for spawns. Triggers a blood moon on some nights. */

class DayNight {
  constructor(startHour) {
    this.dayLength = 200;         // real seconds per 24h
    this.time = startHour === undefined ? 8 : startHour; // hours 0..24
    this.day = 1;
    this.bloodMoon = 0;           // 0..1 intensity
    this._lastBloodDay = -1;      // day value the event last fired on (latch)
    this.onBloodMoon = null;
  }

  update(dt) {
    const prev = this.time;
    this.time += (dt / this.dayLength) * 24;
    if (this.time >= 24) { this.time -= 24; this.day++; }

    // Blood moon on every 3rd night, around midnight.
    const isBloodNight = (this.day % 3 === 0);
    const inWindow = (this.time >= 23.2 || this.time <= 0.6);
    if (isBloodNight && inWindow) {
      this.bloodMoon = Math.min(1, this.bloodMoon + dt * 0.5);
      // Day 3's window spans two midnights (start and end of the same day),
      // so latch on the day value to fire the event exactly once per blood night.
      if (this.bloodMoon > 0.85 && this._lastBloodDay !== this.day) {
        this._lastBloodDay = this.day;
        if (this.onBloodMoon) this.onBloodMoon();
      }
    } else {
      this.bloodMoon = Math.max(0, this.bloodMoon - dt * 0.5);
    }
  }

  // 0 = full day, 1 = deepest night
  get night() {
    const h = this.time;
    // light level curve
    let light;
    if (h >= 8 && h <= 17) light = 1;
    else if (h > 17 && h < 20) light = lerp(1, 0.12, (h - 17) / 3);
    else if (h >= 20 || h < 5) light = 0.12;
    else if (h >= 5 && h < 8) light = lerp(0.12, 1, (h - 5) / 3);
    else light = 1;
    return clamp(1 - light, 0, 1);
  }

  get phase() {
    const h = this.time;
    if (h >= 5 && h < 8) return 'Dawn';
    if (h >= 8 && h < 17) return 'Day';
    if (h >= 17 && h < 20) return 'Dusk';
    return 'Night';
  }

  // Returns a colour tint {r,g,b,a} to multiply over the scene.
  tint() {
    const n = this.night;
    // base darkening toward cool night blue
    let r = lerp(255, 70, n), g = lerp(255, 84, n), b = lerp(255, 140, n);
    // warm dawn/dusk
    const h = this.time;
    let warm = 0;
    if (h > 17 && h < 20) warm = 1 - Math.abs((h - 18.5) / 1.5);
    if (h >= 5 && h < 8) warm = 1 - Math.abs((h - 6.5) / 1.5);
    if (warm > 0) { r = lerp(r, 255, warm * 0.5); g = lerp(g, 170, warm * 0.4); b = lerp(b, 120, warm * 0.5); }
    // blood moon reddening
    if (this.bloodMoon > 0) { r = lerp(r, 200, this.bloodMoon); g = lerp(g, 40, this.bloodMoon); b = lerp(b, 40, this.bloodMoon); }
    return { r, g, b };
  }
}
