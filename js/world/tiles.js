'use strict';
/* tiles.js — terrain tile definitions (data-driven).
   T holds integer ids; TILES[id] holds the tile's properties. */

const T = {
  DEEP_WATER: 0,
  WATER: 1,
  SAND: 2,
  GRASS: 3,
  GRASS_DARK: 4,
  FOREST: 5,
  DIRT: 6,
  PATH: 7,
  ROCK: 8,
  CLIFF: 9,
  SNOW: 10,
  SNOW_ROCK: 11,
  FLOWERS: 12,
  SHRINE_FLOOR: 13,
};

// col = base color, col2 = speckle/detail color.
const TILES = [];
function defTile(id, name, col, col2, opt) {
  opt = opt || {};
  TILES[id] = {
    id, name, col, col2,
    solid: !!opt.solid,          // blocks all movement
    deep: !!opt.deep,            // deep water -> swim
    shallow: !!opt.shallow,      // shallow water -> splash + slight slow
    climb: !!opt.climb,          // cliff -> climbable with stamina
    cold: !!opt.cold,            // contributes to chill
    speed: opt.speed === undefined ? 1 : opt.speed, // movement multiplier
    noise: opt.noise || 0.06,    // per-tile brightness variation amount
  };
}

defTile(T.DEEP_WATER, 'Deep Water', { r: 34, g: 78, b: 148 }, { r: 60, g: 120, b: 200 }, { deep: true, speed: 0.55, noise: 0.1 });
defTile(T.WATER, 'Water', { r: 64, g: 132, b: 200 }, { r: 120, g: 190, b: 235 }, { shallow: true, speed: 0.75, noise: 0.12 });
defTile(T.SAND, 'Sand', { r: 224, g: 206, b: 145 }, { r: 205, g: 184, b: 120 }, { speed: 0.9, noise: 0.05 });
defTile(T.GRASS, 'Grass', { r: 106, g: 168, b: 79 }, { r: 128, g: 186, b: 92 }, { noise: 0.07 });
defTile(T.GRASS_DARK, 'Meadow', { r: 84, g: 146, b: 66 }, { r: 104, g: 164, b: 80 }, { noise: 0.07 });
defTile(T.FOREST, 'Woods', { r: 66, g: 118, b: 58 }, { r: 82, g: 134, b: 68 }, { noise: 0.08 });
defTile(T.DIRT, 'Dirt', { r: 138, g: 110, b: 74 }, { r: 120, g: 94, b: 62 }, { noise: 0.06 });
defTile(T.PATH, 'Path', { r: 176, g: 154, b: 112 }, { r: 158, g: 136, b: 96 }, { speed: 1.08, noise: 0.04 });
defTile(T.ROCK, 'Rock', { r: 128, g: 122, b: 116 }, { r: 148, g: 142, b: 136 }, { speed: 0.85, noise: 0.08 });
defTile(T.CLIFF, 'Cliff', { r: 92, g: 84, b: 78 }, { r: 70, g: 63, b: 58 }, { solid: true, climb: true, noise: 0.1 });
defTile(T.SNOW, 'Snow', { r: 236, g: 240, b: 246 }, { r: 214, g: 224, b: 236 }, { cold: true, speed: 0.85, noise: 0.05 });
defTile(T.SNOW_ROCK, 'Frozen Rock', { r: 176, g: 186, b: 198 }, { r: 150, g: 162, b: 176 }, { cold: true, speed: 0.8, noise: 0.08 });
defTile(T.FLOWERS, 'Flower Field', { r: 112, g: 174, b: 84 }, { r: 210, g: 120, b: 170 }, { noise: 0.09 });
defTile(T.SHRINE_FLOOR, 'Ancient Tile', { r: 44, g: 52, b: 66 }, { r: 90, g: 150, b: 168 }, { speed: 1.0, noise: 0.04 });

function tileInfo(id) { return TILES[id] || TILES[T.GRASS]; }
function tileSolid(id) { const t = TILES[id]; return t ? t.solid : true; }
function tileDeep(id) { const t = TILES[id]; return t ? t.deep : false; }
