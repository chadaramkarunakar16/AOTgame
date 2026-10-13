/* Shared mutable game state, so modules can reach each other without circular-import trouble. */
export const G = {
  player: null,
  titans: [],
  projectiles: [],
  civilians: [],
  mission: null,
  time: 0,
  slow: 1,
  districtDamage: 0,
  hooks: {}
};
