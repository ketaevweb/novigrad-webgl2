/* Процедурная генерация Новиграда: стены, дороги, кварталы, порт, храм,
   граф waypoints для симуляции и occupancy-карта коллизий. */

export const T_HOUSE = 0;
export const T_WALL = 1;
export const T_TOWER = 2;
export const T_TEMPLE = 3;
export const T_WOOD = 4;
export const T_WARE = 5;
export const T_AWNING = 6;
export const T_SAIL = 7;
export const T_STONE = 8;
export const T_QUAY = 9;
export const T_ROCK = 10;

export const C_STONE = 1;   // cyl/cone type: stone
export const C_TEMPLE = 3;
export const C_WOOD = 4;
export const C_TRUNK = 5;
export const C_BARREL = 6;
export const C_QUAY = 7;
export const C_ROCK = 8;
export const C_WATER = 9;
export const CN_ROOF = 0;   // cone: shingle roof
export const CN_FOLIAGE = 1;
export const CN_SPIRE = 2;

export const S_FLAME = 0;
export const S_GLOW = 1;
export const S_POOL = 2;
export const S_GULL = 3;
export const S_ETERNAL = 4;
export const S_EGLOW = 5;
export const S_LHGLOW = 6;

export interface RoadSeg { x1: number; z1: number; x2: number; z2: number; w: number }

export interface CityData {
  terrain: Float32Array;      // pos3, uv2, kind1 (kind: 0 grass, 1 cobble, 2 wood, 3 dark floor)
  terrainVerts: number;
  water: Float32Array;        // pos3
  waterVerts: number;
  boxes: Float32Array;        // instanced 12 floats
  boxCount: number;
  roofs: Float32Array;
  roofCount: number;
  cylinders: Float32Array;
  cylCount: number;
  cones: Float32Array;
  coneCount: number;
  sprites: Float32Array;      // instanced 8 floats
  spriteCount: number;
  wpData: Float32Array;       // RGBA32F pixels: x,z,count,offset
  wpW: number;
  wpH: number;
  wpCount: number;
  neData: Float32Array;       // RGBA32F: neighbor index in r
  neCount: number;
  plaza0: number;
  plaza1: number;
  plazaC: [number, number];
  occ: Uint8Array;            // 256*256, 1 = blocked
  occSpan: number;            // world span 260
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distToSeg(px: number, pz: number, s: RoadSeg): number {
  const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
  const l2 = dx * dx + dz * dz;
  let t = 0;
  if (l2 > 0) t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (pz - s.z1) * dz) / l2));
  const cx = s.x1 + dx * t, cz = s.z1 + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

export function generateCity(seed = 1337): CityData {
  const rnd = mulberry32(seed);

  /* ---------- roads ---------- */
  const roadSegs: RoadSeg[] = [];
  const RING_R = 95, WALL_R = 100, PLAZA_R = 30;
  const ringPts: [number, number][] = [];
  const RING_N = 48;
  for (let i = 0; i < RING_N; i++) {
    const a = (i / RING_N) * Math.PI * 2;
    ringPts.push([Math.cos(a) * RING_R, Math.sin(a) * RING_R]);
  }
  for (let i = 0; i < RING_N; i++) {
    const a = ringPts[i], b = ringPts[(i + 1) % RING_N];
    roadSegs.push({ x1: a[0], z1: a[1], x2: b[0], z2: b[1], w: 6 });
  }
  const gateAngles = [0, 45, 90, 135, 180, 225, 315].map((d) => (d * Math.PI) / 180);
  const radialDirs = gateAngles;
  for (const a of radialDirs) {
    roadSegs.push({
      x1: Math.cos(a) * PLAZA_R, z1: Math.sin(a) * PLAZA_R,
      x2: Math.cos(a) * (RING_R + 1), z2: Math.sin(a) * (RING_R + 1), w: 5.5,
    });
  }
  // temple bypass roads
  roadSegs.push({ x1: 18, z1: -30, x2: 18, z2: -77, w: 5 });
  roadSegs.push({ x1: -18, z1: -30, x2: -18, z2: -77, w: 5 });
  // quay corridor
  roadSegs.push({ x1: -86, z1: -73, x2: 86, z2: -73, w: 10 });
  // piers (walkable roads)
  const pierX = [-40, -20, 0, 20, 40];
  for (const x of pierX) roadSegs.push({ x1: x, z1: -77, x2: x, z2: -90, w: 4.5 });

  /* ---------- terrain mesh ---------- */
  const ter: number[] = [];
  const pushQuad = (
    ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number,
    y: number, kind: number, uvScale = 1,
  ) => {
    const uv = (x: number, z: number) => [x * uvScale, z * uvScale];
    const v = [
      [ax, az], [bx, bz], [cx, cz],
      [ax, az], [cx, cz], [dx, dz],
    ];
    for (const p of v) {
      const [u, vv] = uv(p[0], p[1]);
      ter.push(p[0], y, p[1], u, vv, kind);
    }
  };
  const pushSegQuad = (s: RoadSeg, y: number, kind: number) => {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    const l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * (s.w / 2), pz = (dx / l) * (s.w / 2);
    const quads: [number, number][] = [
      [s.x1 - px, s.z1 - pz], [s.x1 + px, s.z1 + pz],
      [s.x2 + px, s.z2 + pz], [s.x2 - px, s.z2 - pz],
    ];
    ter.push(
      quads[0][0], y, quads[0][1], 0, 0, kind,
      quads[1][0], y, quads[1][1], s.w, 0, kind,
      quads[2][0], y, quads[2][1], s.w, l, kind,
      quads[0][0], y, quads[0][1], 0, 0, kind,
      quads[2][0], y, quads[2][1], s.w, l, kind,
      quads[3][0], y, quads[3][1], 0, l, kind,
    );
  };
  // ground
  pushQuad(-210, -76, 210, -76, 210, 170, -210, 170, 0, 0);
  // harbor floor
  pushQuad(-210, -185, 210, -185, 210, -76, -210, -76, -2.6, 3);
  // ring road
  for (let i = 0; i < RING_N; i++) {
    const a = ringPts[i], b = ringPts[(i + 1) % RING_N];
    pushSegQuad({ x1: a[0], z1: a[1], x2: b[0], z2: b[1], w: 6 }, 0.04, 1);
  }
  // radials + gate aprons
  for (const a of radialDirs) {
    pushSegQuad({
      x1: Math.cos(a) * PLAZA_R, z1: Math.sin(a) * PLAZA_R,
      x2: Math.cos(a) * (RING_R + 1), z2: Math.sin(a) * (RING_R + 1), w: 5.5,
    }, 0.04, 1);
    pushSegQuad({
      x1: Math.cos(a) * RING_R, z1: Math.sin(a) * RING_R,
      x2: Math.cos(a) * (WALL_R + 2.5), z2: Math.sin(a) * (WALL_R + 2.5), w: 6,
    }, 0.04, 1);
  }
  // bypass
  pushSegQuad({ x1: 18, z1: -30, x2: 18, z2: -77, w: 5 }, 0.04, 1);
  pushSegQuad({ x1: -18, z1: -30, x2: -18, z2: -77, w: 5 }, 0.04, 1);
  // docks apron
  pushQuad(-86, -78, 86, -78, 86, -66, -86, -66, 0.06, 1);
  // piers
  for (const x of pierX) pushSegQuad({ x1: x, z1: -77, x2: x, z2: -90, w: 3.6 }, 0.32, 2);
  // temple front plaza
  pushQuad(-16, -38, 16, -38, 16, -29, -16, -29, 0.05, 1);
  // market plaza (fan)
  const FAN = 40;
  for (let i = 0; i < FAN; i++) {
    const a0 = (i / FAN) * Math.PI * 2, a1 = ((i + 1) / FAN) * Math.PI * 2;
    ter.push(
      0, 0.04, 0, 0, 0, 1,
      Math.cos(a0) * PLAZA_R, 0.04, Math.sin(a0) * PLAZA_R, Math.cos(a0) * PLAZA_R, Math.sin(a0) * PLAZA_R, 1,
      Math.cos(a1) * PLAZA_R, 0.04, Math.sin(a1) * PLAZA_R, Math.cos(a1) * PLAZA_R, Math.sin(a1) * PLAZA_R, 1,
    );
  }
  const terrain = new Float32Array(ter);

  /* ---------- water ---------- */
  const wat: number[] = [];
  wat.push(-210, -0.35, -77, 210, -0.35, -77, 210, -0.35, -185,
    -210, -0.35, -77, 210, -0.35, -185, -210, -0.35, -185);
  const water = new Float32Array(wat);

  /* ---------- instance builders ---------- */
  const boxes: number[] = [];
  const roofs: number[] = [];
  const cyls: number[] = [];
  const cones: number[] = [];
  const sprites: number[] = [];
  const addBox = (x: number, y: number, z: number, w: number, h: number, d: number, rot: number, seed: number, type: number, bob = 0) => {
    boxes.push(x, y, z, rot, w, h, d, seed, type, bob, 0, 0);
  };
  const addRoof = (x: number, y: number, z: number, w: number, h: number, d: number, rot: number, seed: number) => {
    roofs.push(x, y, z, rot, w, h, d, seed, 0, 0, 0, 0);
  };
  const addCyl = (x: number, y: number, z: number, r: number, h: number, rot: number, seed: number, type: number) => {
    cyls.push(x, y, z, rot, r * 2, h, r * 2, seed, type, 0, 0, 0);
  };
  const addCone = (x: number, y: number, z: number, r: number, h: number, rot: number, seed: number, type: number) => {
    cones.push(x, y, z, rot, r * 2, h, r * 2, seed, type, 0, 0, 0);
  };
  const addSprite = (x: number, y: number, z: number, type: number, size: number, seed: number) => {
    sprites.push(x, y, z, type, size, seed, 0, 0);
  };

  /* ---------- occupancy ---------- */
  const OCC = 256, SPAN = 260;
  const occ = new Uint8Array(OCC * OCC);
  const toCell = (w: number) => Math.floor(((w + 130) / SPAN) * OCC);
  const markCircle = (cx: number, cz: number, r: number, val: number) => {
    const x0 = toCell(cx - r), x1 = toCell(cx + r), z0 = toCell(cz - r), z1 = toCell(cz + r);
    for (let z = Math.max(0, z0); z <= Math.min(OCC - 1, z1); z++) {
      for (let x = Math.max(0, x0); x <= Math.min(OCC - 1, x1); x++) {
        const wx = ((x + 0.5) / OCC) * SPAN - 130, wz = ((z + 0.5) / OCC) * SPAN - 130;
        if ((wx - cx) ** 2 + (wz - cz) ** 2 <= r * r) occ[z * OCC + x] = val;
      }
    }
  };
  const markBox = (cx: number, cz: number, w: number, d: number, rot: number, val: number) => {
    const rr = Math.hypot(w, d) / 2;
    const x0 = toCell(cx - rr), x1 = toCell(cx + rr), z0 = toCell(cz - rr), z1 = toCell(cz + rr);
    const c = Math.cos(-rot), s = Math.sin(-rot);
    for (let z = Math.max(0, z0); z <= Math.min(OCC - 1, z1); z++) {
      for (let x = Math.max(0, x0); x <= Math.min(OCC - 1, x1); x++) {
        const wx = ((x + 0.5) / OCC) * SPAN - 130, wz = ((z + 0.5) / OCC) * SPAN - 130;
        const lx = (wx - cx) * c - (wz - cz) * s;
        const lz = (wx - cx) * s + (wz - cz) * c;
        if (Math.abs(lx) <= w / 2 && Math.abs(lz) <= d / 2) occ[z * OCC + x] = val;
      }
    }
  };
  const markSeg = (x1: number, z1: number, x2: number, z2: number, halfW: number, val: number) => {
    const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.8);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      markCircle(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, halfW, val);
    }
  };

  // 1) water + outside walls blocked
  for (let z = 0; z < OCC; z++) {
    const wz = ((z + 0.5) / OCC) * SPAN - 130;
    for (let x = 0; x < OCC; x++) {
      const wx = ((x + 0.5) / OCC) * SPAN - 130;
      occ[z * OCC + x] = wz < -77 || wx * wx + wz * wz > (WALL_R - 0.5) ** 2 ? 1 : 0;
    }
  }
  // 2) free: roads
  for (const s of roadSegs) markSeg(s.x1, s.z1, s.x2, s.z2, s.w / 2 + 0.7, 0);
  markCircle(0, 0, PLAZA_R - 0.5, 0);
  markBox(0, -33.5, 32, 9, 0, 0); // temple front
  markBox(0, -72, 172, 12, 0, 0); // quay apron
  for (const x of pierX) markBox(x, -83.5, 4.4, 14, 0, 0);

  /* ---------- city walls & towers ---------- */
  const WALL_N = 64;
  for (let i = 0; i < WALL_N; i++) {
    const a0 = (i / WALL_N) * Math.PI * 2, a1 = ((i + 1) / WALL_N) * Math.PI * 2;
    const amid = (a0 + a1) / 2;
    const nearGate = gateAngles.some((g) => {
      let d = Math.abs(amid - g);
      d = Math.min(d, Math.PI * 2 - d);
      return d < 0.065;
    });
    if (nearGate) continue;
    const x0 = Math.cos(a0) * WALL_R, z0 = Math.sin(a0) * WALL_R;
    const x1 = Math.cos(a1) * WALL_R, z1 = Math.sin(a1) * WALL_R;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(x1 - x0, z1 - z0);
    addBox((x0 + x1) / 2, 0, (z0 + z1) / 2, 2.4, 8, len + 0.4, rot, rnd(), T_WALL);
    markSeg(x0, z0, x1, z1, 1.9, 1);
    if (i % 5 === 2) {
      const tx = (x0 + x1) / 2, tz = (z0 + z1) / 2;
      addCyl(tx, 0, tz, 2.7, 10.5, 0, rnd(), C_STONE);
      addCone(tx, 10.5, tz, 3.6, 4.2, 0, rnd(), CN_ROOF);
      markCircle(tx, tz, 3.4, 1);
    }
  }
  // gate towers
  for (const g of gateAngles) {
    for (const side of [-1, 1]) {
      const a = g + side * 0.062;
      const tx = Math.cos(a) * WALL_R, tz = Math.sin(a) * WALL_R;
      addCyl(tx, 0, tz, 3.2, 11.5, 0, rnd(), C_STONE);
      addCone(tx, 11.5, tz, 4.4, 4.6, 0, rnd(), CN_ROOF);
      markCircle(tx, tz, 3.9, 1);
    }
  }

  /* ---------- temple of the Eternal Fire ---------- */
  addBox(0, 0, -55, 24, 15, 34, 0, 0.42, T_TEMPLE);
  markBox(0, -55, 24.8, 34.8, 0, 1);
  addRoof(0, 15, -55, 25.6, 6.5, 35.6, 0, 0.42);
  addCyl(0, 14, -55, 4.6, 26, 0, 0.1, C_TEMPLE);
  addCone(0, 40, -55, 5.8, 8, 0, 0.1, CN_SPIRE);
  for (const sx of [-10.5, 10.5]) {
    addCyl(sx, 0, -37.5, 2.6, 17, 0, rnd(), C_TEMPLE);
    addCone(sx, 17, -37.5, 3.4, 4, 0, 0.2, CN_SPIRE);
    markCircle(sx, -37.5, 3.2, 1);
  }
  // stairs
  addBox(0, 0, -37.1, 14, 1.5, 1.8, 0, 0.3, T_STONE);
  addBox(0, 0, -35.6, 15, 1.0, 1.8, 0, 0.3, T_STONE);
  addBox(0, 0, -34.1, 16, 0.5, 1.8, 0, 0.3, T_STONE);
  markBox(0, -36, 16.5, 5, 0, 1);
  // eternal fire sprites
  addSprite(0, 49.5, -55, S_ETERNAL, 3.6, 0.13);
  addSprite(0, 47.5, -55, S_EGLOW, 13, 0.13);
  addSprite(0, 0.15, -30, S_POOL, 17, 0.13);

  /* ---------- fountain ---------- */
  addCyl(0, 0, 0, 3.4, 1.0, 0, 0.5, C_STONE);
  addCyl(0, 0.9, 0, 3.0, 0.14, 0, 0.5, C_WATER);
  addCyl(0, 1.0, 0, 0.55, 2.0, 0, 0.5, C_STONE);
  addCyl(0, 3.0, 0, 1.5, 0.25, 0, 0.5, C_STONE);
  markCircle(0, 0, 3.8, 1);

  /* ---------- plaza ring shops ---------- */
  const placed: { x: number; z: number; w: number; d: number }[] = [];
  const clearOfRoads = (x: number, z: number, half: number) => {
    for (const s of roadSegs) if (distToSeg(x, z, s) < s.w / 2 + half + 0.8) return false;
    return true;
  };
  const clearOfBuildings = (x: number, z: number, half: number) => {
    for (const p of placed) {
      if (Math.hypot(x - p.x, z - p.z) < half + Math.max(p.w, p.d) / 2 + 0.7) return false;
    }
    return true;
  };
  const faceRot = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2 + 0.16;
    const r = 36.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 6.5 + rnd() * 2.5, d = 6.5 + rnd() * 2.5, h = 8.5 + rnd() * 4;
    const rot = faceRot(x, z, 0, 0) + Math.PI; // face the plaza
    const sd = rnd();
    const type = sd < 0.55 ? T_HOUSE : T_HOUSE;
    addBox(x, 0, z, w, h, d, rot, sd, type);
    addRoof(x, h, z, w + 1.3, h * 0.3 + 1.4, d + 1.3, d > w ? rot + Math.PI / 2 : rot, sd);
    placed.push({ x, z, w, d });
    markBox(x, z, w + 0.7, d + 0.7, rot, 1);
    if (sd < 0.55) {
      const fx = x + Math.sin(rot) * (d / 2 + 1.1);
      const fz = z + Math.cos(rot) * (d / 2 + 1.1);
      addBox(fx, 2.75, fz, w * 0.8, 0.16, 2.2, rot, rnd(), T_AWNING);
    }
  }

  /* ---------- harbor warehouses ---------- */
  for (let i = 0; i < 16; i++) {
    const x = -64 + rnd() * 128;
    const z = -66 + rnd() * 10;
    const w = 9 + rnd() * 7, d = 8 + rnd() * 4, h = 7 + rnd() * 3.5;
    const half = Math.max(w, d) / 2;
    if (!clearOfRoads(x, z, half)) continue;
    if (!clearOfBuildings(x, z, half)) continue;
    if (Math.abs(x - 18) < half + 4 || Math.abs(x + 18) < half + 4) continue;
    const rot = faceRot(x, z, x, -73);
    addBox(x, 0, z, w, h, d, rot, rnd(), T_WARE);
    addRoof(x, h, z, w + 1.2, h * 0.25 + 1.1, d + 1.2, d > w ? rot + Math.PI / 2 : rot, rnd());
    placed.push({ x, z, w, d });
    markBox(x, z, w + 0.7, d + 0.7, rot, 1);
  }

  /* ---------- regular buildings ---------- */
  let attempts = 0;
  let count = 0;
  while (attempts < 9000 && count < 560) {
    attempts++;
    const r = 33 + Math.sqrt(rnd()) * 57;
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // keep off temple zone / harbor / wall
    if (Math.abs(x) < 19 && z < -32) continue;
    if (z < -56 && Math.abs(x) < 70) continue;
    if (Math.hypot(x, z) > 91) continue;
    const w = 6 + rnd() * 6.5, d = 6 + rnd() * 6.5;
    const h = 8 + rnd() * 6 + (rnd() < 0.12 ? 4 : 0);
    const half = Math.max(w, d) / 2;
    if (!clearOfRoads(x, z, half)) continue;
    if (!clearOfBuildings(x, z, half)) continue;
    // face nearest road
    let best = 1e9, bx = 0, bz = 0;
    for (const s of roadSegs) {
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
      const l2 = dx * dx + dz * dz;
      let t = 0;
      if (l2 > 0) t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / l2));
      const cx = s.x1 + dx * t, cz = s.z1 + dz * t;
      const dd = Math.hypot(x - cx, z - cz);
      if (dd < best) { best = dd; bx = cx; bz = cz; }
    }
    const rot = faceRot(x, z, bx, bz) + (rnd() - 0.5) * 0.12;
    const sd = rnd();
    const nearRoad = best < half + 5.5;
    const isShop = nearRoad && sd < 0.4;
    addBox(x, 0, z, w, h, d, rot, sd, T_HOUSE);
    addRoof(x, h, z, w + 1.3, h * 0.3 + 1.3, d + 1.3, d > w ? rot + Math.PI / 2 : rot, sd);
    placed.push({ x, z, w, d });
    markBox(x, z, w + 0.6, d + 0.6, rot, 1);
    if (isShop) {
      const fx = x + Math.sin(rot) * (d / 2 + 1.0);
      const fz = z + Math.cos(rot) * (d / 2 + 1.0);
      addBox(fx, 2.7, fz, w * 0.75, 0.16, 2.1, rot, rnd(), T_AWNING);
    }
    count++;
  }

  /* ---------- market stalls / barrels / crates / trees / torches ---------- */
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 21, z = Math.sin(a) * 21;
    const rot = faceRot(x, z, 0, 0);
    addBox(x, 0.45, z, 2.6, 0.95, 1.4, rot, rnd(), T_WOOD);
    addBox(x + Math.sin(rot) * 0.2, 2.15, z + Math.cos(rot) * 0.2, 3.1, 0.18, 2.0, rot, rnd(), T_AWNING);
    markBox(x, z, 3.2, 2.4, rot, 1);
    for (let b = 0; b < 2; b++) {
      const bx = x + Math.cos(a + 1.57) * (2.6 + b * 1.2), bz = z + Math.sin(a + 1.57) * (2.6 + b * 1.2);
      addCyl(bx, 0, bz, 0.45, 0.9, 0, rnd(), C_BARREL);
      markCircle(bx, bz, 0.6, 1);
    }
  }
  for (let i = 0; i < 12; i++) {
    const x = -60 + rnd() * 120, z = -67.5;
    addCyl(x, 0, z, 0.45, 0.9, 0, rnd(), C_BARREL);
    markCircle(x, z, 0.6, 1);
  }
  for (let i = 0; i < 18; i++) {
    const x = -58 + rnd() * 116, z = -65 - rnd() * 1.5;
    const s = 0.9 + rnd() * 0.5;
    addBox(x, 0, z, s, s, s, rnd() * 3.14, rnd(), T_WOOD);
    markCircle(x, z, 0.8, 1);
  }
  // trees inside
  let trees = 0, att = 0;
  while (trees < 42 && att < 900) {
    att++;
    const r = 34 + Math.sqrt(rnd()) * 56;
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < -56 && Math.abs(x) < 70) continue;
    if (Math.abs(x) < 19 && z < -32) continue;
    if (!clearOfRoads(x, z, 2.4)) continue;
    if (!clearOfBuildings(x, z, 3.4)) continue;
    addCyl(x, 0, z, 0.28, 2.4, 0, rnd(), C_TRUNK);
    addCone(x, 1.7, z, 1.6, 2.8, 0, rnd(), CN_FOLIAGE);
    addCone(x, 3.3, z, 1.15, 2.1, 0, rnd() + 0.3, CN_FOLIAGE);
    markCircle(x, z, 1.0, 1);
    trees++;
  }
  // trees outside south walls
  for (let i = 0; i < 9; i++) {
    const a = 0.2 + rnd() * 2.7;
    const r = 105 + rnd() * 14;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    addCyl(x, 0, z, 0.3, 2.6, 0, rnd(), C_TRUNK);
    addCone(x, 1.8, z, 1.7, 3.0, 0, rnd(), CN_FOLIAGE);
    addCone(x, 3.5, z, 1.2, 2.2, 0, rnd(), CN_FOLIAGE);
  }

  // torches: plaza ring
  const torches: [number, number][] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    torches.push([Math.cos(a) * 24.5, Math.sin(a) * 24.5]);
  }
  for (const ga of gateAngles) {
    for (let i = 0; i < 4; i++) {
      const r = 36 + i * 17;
      const side = i % 2 === 0 ? 1 : -1;
      const px = Math.cos(ga) * r + Math.cos(ga + Math.PI / 2) * 3.6 * side;
      const pz = Math.sin(ga) * r + Math.sin(ga + Math.PI / 2) * 3.6 * side;
      torches.push([px, pz]);
    }
  }
  for (let i = 0; i < 11; i++) torches.push([-80 + i * 16, -75.4]);
  torches.push([-5, -32.5], [5, -32.5]);
  for (const ga of gateAngles) {
    torches.push([Math.cos(ga + 0.09) * 94.5, Math.sin(ga + 0.09) * 94.5]);
    torches.push([Math.cos(ga - 0.09) * 94.5, Math.sin(ga - 0.09) * 94.5]);
  }
  for (const [tx, tz] of torches) {
    addCyl(tx, 0, tz, 0.09, 2.4, 0, rnd(), C_WOOD);
    const sd = rnd();
    addSprite(tx, 2.62, tz, S_FLAME, 0.5 + sd * 0.3, sd);
    addSprite(tx, 2.8, tz, S_GLOW, 3.2, sd);
    addSprite(tx, 0.15, tz, S_POOL, 6, sd);
    markCircle(tx, tz, 0.4, 1);
  }

  /* ---------- harbor: quay, piers, ships, lighthouse ---------- */
  addBox(0, -2.6, -78, 172, 3.2, 2.4, 0, 0.2, T_QUAY);
  for (const x of pierX) {
    addBox(x, -2.4, -83.5, 3.6, 2.75, 13.6, 0, rnd(), T_WOOD);
    for (const dz of [-6.4, 6.4]) for (const dx of [-1.5, 1.5]) {
      addCyl(x + dx, -2.4, -83.5 + dz, 0.22, 3.1, 0, rnd(), C_WOOD);
    }
  }
  // crane
  addCyl(-46, 0, -69.5, 0.3, 9, 0, 0.4, C_WOOD);
  addBox(-46, 8.4, -70.9, 0.28, 0.28, 5.2, 0, 0.4, T_WOOD);
  markCircle(-46, -69.5, 0.8, 1);
  // ships
  const ships: [number, number, number][] = [
    [-34, -108, 0.3], [-6, -119, -0.2], [26, -103, 0.12], [54, -123, -0.4],
  ];
  for (const [sx, sz, sr] of ships) {
    addBox(sx, -1.3, sz, 10, 2.8, 3.8, sr, rnd(), T_WOOD, 0.14);
    addBox(sx - Math.sin(sr) * 3.2, 1.5, sz - Math.cos(sr) * 3.2, 3.2, 2.0, 3.4, sr, rnd(), T_WOOD, 0.14);
    addCyl(sx, 1.5, sz, 0.15, 7.5, 0, rnd(), C_WOOD);
    addBox(sx + Math.sin(sr) * 0.8, 2.2, sz + Math.cos(sr) * 0.8, 4.8, 3.4, 0.12, sr, rnd(), T_SAIL, 0.14);
  }
  // rowboats
  addBox(-70, -0.7, -92, 3.6, 1.1, 1.5, 0.4, rnd(), T_WOOD, 0.22);
  addBox(44, -0.7, -88, 3.2, 1.0, 1.4, -0.3, rnd(), T_WOOD, 0.22);
  // lighthouse
  addCyl(-88, -2.5, -98, 7.5, 4.2, 0, 0.6, C_ROCK);
  addCyl(-88, 1.7, -98, 2.2, 13, 0, 0.6, C_STONE);
  addCyl(-88, 14.7, -98, 2.6, 1.3, 0, 0.6, C_QUAY);
  addCyl(-88, 16.0, -98, 1.7, 1.7, 0, 0.6, C_TEMPLE);
  addCone(-88, 17.7, -98, 2.5, 1.8, 0, 0.6, CN_ROOF);
  addSprite(-88, 16.9, -98, S_FLAME, 1.1, 0.4);
  addSprite(-88, 17, -98, S_LHGLOW, 9, 0.4);

  // seagulls
  for (let i = 0; i < 24; i++) {
    addSprite(-70 + rnd() * 140, 20 + rnd() * 22, -85 - rnd() * 40, S_GULL, 14 + rnd() * 26, rnd());
  }

  /* ---------- waypoints ---------- */
  const wps: [number, number][] = [];
  // plaza block [0..plaza1)
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    wps.push([Math.cos(a) * 27, Math.sin(a) * 27]);
  }
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + 0.2;
    wps.push([Math.cos(a) * 17, Math.sin(a) * 17]);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.4;
    wps.push([Math.cos(a) * 8, Math.sin(a) * 8]);
  }
  wps.push([-9, -34], [-3, -33.5], [3, -33.5], [9, -34]);
  const plaza1 = wps.length;
  // ring
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    wps.push([Math.cos(a) * RING_R, Math.sin(a) * RING_R]);
  }
  // radials
  for (const ga of gateAngles) {
    for (let r = 41; r <= 86; r += 9) wps.push([Math.cos(ga) * r, Math.sin(ga) * r]);
  }
  // bypass
  for (const bx of [18, -18]) {
    for (let z = -33; z >= -76; z -= 8.6) wps.push([bx, z]);
  }
  // quay
  for (let x = -80; x <= 80; x += 10) wps.push([x, -73]);
  // piers
  for (const x of pierX) wps.push([x, -80], [x, -84.5], [x, -89]);

  const wpCount = wps.length;
  const MAXNB = 8;
  const neighborLists: number[][] = wps.map(() => []);
  for (let i = 0; i < wpCount; i++) {
    for (let j = i + 1; j < wpCount; j++) {
      const dx = wps[i][0] - wps[j][0], dz = wps[i][1] - wps[j][1];
      const d2 = dx * dx + dz * dz;
      if (d2 > 13.2 * 13.2 || d2 < 1) continue;
      const mx = (wps[i][0] + wps[j][0]) / 2, mz = (wps[i][1] + wps[j][1]) / 2;
      const cellIdx = toCell(mz) * OCC + toCell(mx);
      if (occ[cellIdx] > 0.5) continue;
      if (neighborLists[i].length < MAXNB && neighborLists[j].length < MAXNB) {
        neighborLists[i].push(j);
        neighborLists[j].push(i);
      }
    }
  }
  const neList: number[] = [];
  const wpPixels = new Float32Array(Math.ceil(wpCount / 64) * 64 * 4);
  for (let i = 0; i < wpCount; i++) {
    const off = neList.length;
    for (const n of neighborLists[i]) neList.push(n);
    wpPixels[i * 4] = wps[i][0];
    wpPixels[i * 4 + 1] = wps[i][1];
    wpPixels[i * 4 + 2] = neighborLists[i].length;
    wpPixels[i * 4 + 3] = off;
  }
  const neData = new Float32Array(Math.max(neList.length, 1) * 4);
  for (let i = 0; i < neList.length; i++) neData[i * 4] = neList[i];

  /* ---------- props clear roads again (props placed on them) ---------- */
  // (props already marked after road clearing — nothing to do)

  return {
    terrain,
    terrainVerts: terrain.length / 6,
    water,
    waterVerts: water.length / 3,
    boxes: new Float32Array(boxes),
    boxCount: boxes.length / 12,
    roofs: new Float32Array(roofs),
    roofCount: roofs.length / 12,
    cylinders: new Float32Array(cyls),
    cylCount: cyls.length / 12,
    cones: new Float32Array(cones),
    coneCount: cones.length / 12,
    sprites: new Float32Array(sprites),
    spriteCount: sprites.length / 8,
    wpData: wpPixels,
    wpW: 64,
    wpH: Math.ceil(wpCount / 64),
    wpCount,
    neData,
    neCount: neList.length,
    plaza0: 0,
    plaza1,
    plazaC: [0, 0],
    occ,
    occSpan: SPAN,
  };
}
