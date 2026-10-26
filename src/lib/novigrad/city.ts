/* Процедурная генерация Новиграда по референс-карте игры:
   — главный остров (Hierarch Square, Silverton, The Bits, Glory Lane)
   — храмовый остров Temple Isle с камленной дамбой
   — район Гильдорф за проливом (два моста, Площадь Дубильщиков)
   — серповидная лагуна Harborside с доками, северная гавань, маяк
   — стены с воротами и башнями
   Граф waypoints с КАТЕГОРИЯМИ ЗОН для GPU-симуляции профессий. */

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
export const T_ANVIL = 11;

export const C_STONE = 1;
export const C_TEMPLE = 3;
export const C_WOOD = 4;
export const C_TRUNK = 5;
export const C_BARREL = 6;
export const C_QUAY = 7;
export const C_ROCK = 8;
export const C_WATER = 9;
export const CN_ROOF = 0;
export const CN_FOLIAGE = 1;
export const CN_SPIRE = 2;

export const S_FLAME = 0;
export const S_GLOW = 1;
export const S_POOL = 2;
export const S_GULL = 3;
export const S_ETERNAL = 4;
export const S_EGLOW = 5;
export const S_LHGLOW = 6;

/* Категории зон (индексы в zonePairs, пары [from,to)) */
export const Z_PLAZA = 0;    // Hierarch Square
export const Z_STALLS = 1;   // рыночные прилавки (все площади)
export const Z_ANVIL = 2;    // наковальни
export const Z_PIER = 3;     // концы пирсов
export const Z_WARE = 4;     // двери складов
export const Z_TAVERN = 5;   // двери таверн
export const Z_ALLEY = 6;    // тёмные переулки
export const Z_COURT = 7;    // "Пассифлора", места куртизанок
export const Z_TEMPLE = 8;   // Temple Isle
export const Z_PAT_A = 9;    // патруль: набережная северной гавани
export const Z_PAT_C = 10;   // патруль: Дорога Славы (юг)
export const Z_PAT_D = 11;   // патруль: кольцо Гильдорфа
export const Z_STREET = 12;  // все улицы (прогулки, дома)
export const ZONE_COUNT = 13;

export const WORLD_HALF = 450;   // мир [-450..450]
export const OCC = 512;

export interface RoadSeg { x1: number; z1: number; x2: number; z2: number; w: number }

export interface CityData {
  terrain: Float32Array;
  terrainVerts: number;
  water: Float32Array;
  waterVerts: number;
  boxes: Float32Array;
  boxCount: number;
  roofs: Float32Array;
  roofCount: number;
  cylinders: Float32Array;
  cylCount: number;
  cones: Float32Array;
  coneCount: number;
  sprites: Float32Array;
  spriteCount: number;
  wpData: Float32Array;
  wpW: number;
  wpH: number;
  wpCount: number;
  neData: Float32Array;
  neCount: number;
  zonePairs: Float32Array;    // 2*ZONE_COUNT: [from,to) по категориям
  plaza0: number;
  plaza1: number;
  plazaC: [number, number];
  occ: Uint8Array;
  occSpan: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- геометрия плоскости ---------- */

function inPoly(poly: [number, number][], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const MAIN: [number, number][] = [
  [-84, -82], [-36, -93], [14, -91], [60, -79], [102, -59], [132, -31],
  [149, 0], [156, 36], [151, 74], [133, 110], [103, 139], [64, 157],
  [22, 166], [-22, 168], [-60, 182], [-96, 178], [-122, 152], [-134, 110],
  [-138, 64], [-134, 16], [-126, -30],
];
const GILD: [number, number][] = [
  [196, -96], [238, -84], [266, -52], [274, -10], [268, 32], [246, 62],
  [214, 76], [190, 64], [181, 34], [180, -4], [186, -56],
];
const ISLE_C: [number, number] = [-198, -16];
const ISLE_R = 40;
const LAG_C: [number, number] = [-72, 114];
const LAG_R = 52;

function onLand(x: number, z: number): boolean {
  if (Math.hypot(x - LAG_C[0], z - LAG_C[1]) < LAG_R) return false;
  if (inPoly(MAIN, x, z)) return true;
  if (inPoly(GILD, x, z)) return true;
  if (Math.hypot(x - ISLE_C[0], z - ISLE_C[1]) < ISLE_R) return true;
  if (z > 172 && z < 400 && x > -160 && x < 152) return true; // южные окраины
  return false;
}

function distToSeg2(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1, dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  let t = 0;
  if (l2 > 0) t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / l2));
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

export function generateCity(seed = 4242): CityData {
  const rnd = mulberry32(seed);

  /* ================= УЛИЦЫ ================= */
  const arteries: { pts: [number, number][]; w: number; tag: string }[] = [
    { tag: 'R1', w: 9, pts: [[0, 8], [0, -30], [-14, -60], [-35, -84]] },
    { tag: 'R2', w: 9, pts: [[0, 74], [0, 120], [0, 150], [0, 180], [0, 240], [8, 300]] },
    { tag: 'R3', w: 8, pts: [[-34, 40], [-70, 34], [-100, 22], [-132, 2]] },
    { tag: 'R4', w: 8, pts: [[34, 40], [70, 32], [104, 16], [128, -2], [140, -22]] },
    { tag: 'R5', w: 8, pts: [[26, 64], [56, 80], [88, 90], [118, 78], [144, 56], [154, 40]] },
    { tag: 'R6', w: 9, pts: [[-35, -84], [8, -90], [52, -76], [92, -56], [122, -30], [138, -6], [146, 20], [152, 38]] },
    { tag: 'R7', w: 7, pts: [[-12, 70], [-16, 92], [-20, 114], [-16, 134]] },
    { tag: 'R8', w: 7, pts: [[-16, 134], [-34, 152], [-58, 164], [-84, 170], [-106, 158], [-120, 136], [-128, 112], [-128, 84], [-130, 56]] },
    { tag: 'R9', w: 8, pts: [[182, -24], [194, -52], [214, -70], [238, -76], [258, -60], [268, -30], [272, 0], [264, 30], [246, 52], [222, 64], [200, 60], [186, 44], [181, 20], [183, -4]] },
    { tag: 'R10', w: 7, pts: [[232, 28], [212, 44], [186, 40]] },
    { tag: 'R4b', w: 7, pts: [[182, -24], [202, -32], [222, -20], [232, -2], [232, 14]] },
    { tag: 'R11', w: 8, pts: [[-132, 2], [-148, -2], [-164, -8], [-180, -10], [-188, -12]] },
    { tag: 'R12', w: 5, pts: [[88, 90], [102, 96], [112, 104], [110, 114]] },
    { tag: 'R13', w: 6, pts: [[92, -56], [100, -46], [106, -40]] },
    { tag: 'R14', w: 6, pts: [[0, 120], [-24, 116], [-40, 104], [-44, 88], [-34, 76], [-16, 72]] },
  ];

  const roadSegs: RoadSeg[] = [];
  const segOf = (a: [number, number], b: [number, number], w: number) => {
    const s = { x1: a[0], z1: a[1], x2: b[0], z2: b[1], w };
    roadSegs.push(s);
    return s;
  };

  const plazas: { x: number; z: number; r: number }[] = [
    { x: 0, z: 40, r: 33 },      // Hierarch Square
    { x: 232, z: 8, r: 20 },     // Площадь Дубильщиков (Гильдорф)
    { x: 104, z: -42, r: 14 },   // Рыбный рынок
    { x: -186, z: -12, r: 14 },  // площадь Храма
    { x: 60, z: 122, r: 11 },    // двор "Пассифлоры"
    { x: 110, z: 108, r: 8 },    // закоулок The Bits
  ];

  // второстепенные переулки — органичная застройка
  const lanes: { pts: [number, number][]; w: number }[] = [];
  {
    let tries = 0;
    while (lanes.length < 64 && tries < 6000) {
      tries++;
      const a0 = rnd() * Math.PI * 2;
      const cx = -115 + rnd() * 260, cz = -85 + rnd() * 260;
      const nPts = 2 + Math.floor(rnd() * 3);
      const pts: [number, number][] = [];
      let x = cx, z = cz, dir = a0;
      let ok = true;
      for (let k = 0; k < nPts; k++) {
        if (!onLand(x, z) || Math.hypot(x - LAG_C[0], z - LAG_C[1]) < LAG_R + 5) { ok = false; break; }
        let bad = false;
        for (const p of plazas) if (Math.hypot(x - p.x, z - p.z) < p.r + 4) bad = true;
        for (const s of roadSegs) if (distToSeg2(x, z, s.x1, s.z1, s.x2, s.z2) < 8.5) bad = true;
        for (const l of lanes) for (const q of l.pts) if (Math.hypot(x - q[0], z - q[1]) < 13) bad = true;
        if (bad) { ok = false; break; }
        pts.push([x, z]);
        dir += (rnd() - 0.5) * 1.5;
        x += Math.sin(dir) * (22 + rnd() * 26);
        z += Math.cos(dir) * (22 + rnd() * 26);
      }
      if (ok && pts.length >= 2) lanes.push({ pts, w: 4.5 });
    }
  }

  // сегменты улиц для размещения зданий/occ
  const allStreets: { segs: RoadSeg[]; tag: string }[] = [];
  const pushPoly = (pts: [number, number][], w: number, tag: string) => {
    const segs: RoadSeg[] = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push(segOf(pts[i], pts[i + 1], w));
    allStreets.push({ segs, tag });
  };
  for (const a of arteries) pushPoly(a.pts, a.w, a.tag);
  for (const l of lanes) pushPoly(l.pts, l.w, 'L');

  /* ================= ПЛОЩАДЬ-ФАН ================= */
  const ter: number[] = [];
  const pushQuad = (
    ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number,
    y: number, kind: number,
  ) => {
    const uv = (x: number, z: number) => [x * 0.5, z * 0.5];
    const v = [[ax, az], [bx, bz], [cx, cz], [ax, az], [cx, cz], [dx, dz]];
    for (const p of v) {
      const [u, vv] = uv(p[0], p[1]);
      ter.push(p[0], y, p[1], u, vv, kind);
    }
  };
  const pushSegQuad = (s: RoadSeg, y: number, kind: number) => {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    const l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * (s.w / 2), pz = (dx / l) * (s.w / 2);
    const q = [[s.x1 - px, s.z1 - pz], [s.x1 + px, s.z1 + pz], [s.x2 + px, s.z2 + pz], [s.x2 - px, s.z2 - pz]];
    ter.push(
      q[0][0], y, q[0][1], 0, 0, kind,
      q[1][0], y, q[1][1], s.w, 0, kind,
      q[2][0], y, q[2][1], s.w, l, kind,
      q[0][0], y, q[0][1], 0, 0, kind,
      q[2][0], y, q[2][1], s.w, l, kind,
      q[3][0], y, q[3][1], 0, l, kind,
    );
  };

  // земля: маскируемая сетка 4.5м
  {
    const STEP = 4.5;
    const yLand = 0.3;
    for (let gz = -100; gz < 100; gz++) {
      for (let gx = -100; gx < 100; gx++) {
        const x0 = gx * STEP, z0 = gz * STEP;
        if (!onLand(x0 + STEP / 2, z0 + STEP / 2)) continue;
        const n = (Math.sin(x0 * 0.045) + Math.cos(z0 * 0.05)) * 0.04;
        pushQuad(x0, z0, x0 + STEP, z0, x0 + STEP, z0 + STEP, x0, z0 + STEP, yLand + n, 0);
      }
    }
  }
  // улицы
  for (const s of roadSegs) pushSegQuad(s, 0.36, 1);
  // площади
  for (const p of plazas) {
    const FAN = Math.max(16, Math.round(p.r));
    for (let i = 0; i < FAN; i++) {
      const a0 = (i / FAN) * Math.PI * 2, a1 = ((i + 1) / FAN) * Math.PI * 2;
      ter.push(
        p.x, 0.38, p.z, 0, 0, 1,
        p.x + Math.cos(a0) * p.r, 0.38, p.z + Math.sin(a0) * p.r, Math.cos(a0) * p.r, Math.sin(a0) * p.r, 1,
        p.x + Math.cos(a1) * p.r, 0.38, p.z + Math.sin(a1) * p.r, Math.cos(a1) * p.r, Math.sin(a1) * p.r, 1,
      );
    }
  }

  /* ================= ВОДА ================= */
  const wat: number[] = [];
  wat.push(-460, -0.14, -460, 460, -0.14, -460, 460, -0.14, 460, -460, -0.14, -460, 460, -0.14, 460, -460, -0.14, 460);
  const water = new Float32Array(wat);

  /* ================= ИНСТАНСЫ ================= */
  const boxes: number[] = [];
  const roofs: number[] = [];
  const cyls: number[] = [];
  const cones: number[] = [];
  const sprites: number[] = [];
  const addBox = (x: number, y: number, z: number, w: number, h: number, d: number, rot: number, sd: number, type: number, bob = 0) =>
    boxes.push(x, y, z, rot, w, h, d, sd, type, bob, 0, 0);
  const addRoof = (x: number, y: number, z: number, w: number, h: number, d: number, rot: number, sd: number) =>
    roofs.push(x, y, z, rot, w, h, d, sd, 0, 0, 0, 0);
  const addCyl = (x: number, y: number, z: number, r: number, h: number, rot: number, sd: number, type: number) =>
    cyls.push(x, y, z, rot, r * 2, h, r * 2, sd, type, 0, 0, 0);
  const addCone = (x: number, y: number, z: number, r: number, h: number, rot: number, sd: number, type: number) =>
    cones.push(x, y, z, rot, r * 2, h, r * 2, sd, type, 0, 0, 0);
  const addSprite = (x: number, y: number, z: number, type: number, size: number, sd: number) =>
    sprites.push(x, y, z, type, size, sd, 0, 0);

  /* ================= OCCUPANCY ================= */
  const SPAN = WORLD_HALF * 2;
  const occ = new Uint8Array(OCC * OCC);
  const toCell = (w: number) => Math.floor(((w + WORLD_HALF) / SPAN) * OCC);
  const markCircle = (cx: number, cz: number, r: number, val: number) => {
    const x0 = toCell(cx - r), x1 = toCell(cx + r), z0 = toCell(cz - r), z1 = toCell(cz + r);
    for (let z = Math.max(0, z0); z <= Math.min(OCC - 1, z1); z++) {
      for (let x = Math.max(0, x0); x <= Math.min(OCC - 1, x1); x++) {
        const wx = ((x + 0.5) / OCC) * SPAN - WORLD_HALF;
        const wz = ((z + 0.5) / OCC) * SPAN - WORLD_HALF;
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
        const wx = ((x + 0.5) / OCC) * SPAN - WORLD_HALF;
        const wz = ((z + 0.5) / OCC) * SPAN - WORLD_HALF;
        const lx = (wx - cx) * c - (wz - cz) * s;
        const lz = (wx - cx) * s + (wz - cz) * c;
        if (Math.abs(lx) <= w / 2 && Math.abs(lz) <= d / 2) occ[z * OCC + x] = val;
      }
    }
  };
  const markSeg = (x1: number, z1: number, x2: number, z2: number, halfW: number, val: number) => {
    const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.9);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      markCircle(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, halfW, val);
    }
  };

  // 1) вода/вне мира — блок
  for (let z = 0; z < OCC; z++) {
    const wz = ((z + 0.5) / OCC) * SPAN - WORLD_HALF;
    for (let x = 0; x < OCC; x++) {
      const wx = ((x + 0.5) / OCC) * SPAN - WORLD_HALF;
      occ[z * OCC + x] = onLand(wx, wz) ? 0 : 1;
    }
  }
  // 2) улицы и площади свободны
  for (const s of roadSegs) markSeg(s.x1, s.z1, s.x2, s.z2, s.w / 2 + 0.8, 0);
  for (const p of plazas) markCircle(p.x, p.z, p.r - 0.5, 0);

  /* ================= WAYPOINTS ================= */
  const wps: [number, number][] = [];
  const pushWp = (x: number, z: number) => { wps.push([x, z]); return wps.length - 1; };
  const zFrom: number[] = new Array(ZONE_COUNT).fill(0);
  const zTo: number[] = new Array(ZONE_COUNT).fill(0);
  const beginZone = (cat: number) => { zFrom[cat] = wps.length; };
  const endZone = (cat: number) => { zTo[cat] = wps.length; };

  // — Hierarch Square: три кольца
  beginZone(Z_PLAZA);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    pushWp(Math.cos(a) * 27, 40 + Math.sin(a) * 27);
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + 0.2;
    pushWp(Math.cos(a) * 17, 40 + Math.sin(a) * 17);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.4;
    pushWp(Math.cos(a) * 8, 40 + Math.sin(a) * 8);
  }
  endZone(Z_PLAZA);

  // — прилавки на трёх рынках
  beginZone(Z_STALLS);
  const stallPos: [number, number, number][] = []; // x,z,rot(лицом к центру площади)
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.13;
    const x = Math.cos(a) * 24, z = 40 + Math.sin(a) * 24;
    stallPos.push([x, z, Math.atan2(0 - x, 40 - z)]);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.4;
    const x = 232 + Math.cos(a) * 12.5, z = 8 + Math.sin(a) * 12.5;
    stallPos.push([x, z, Math.atan2(232 - x, 8 - z)]);
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.5;
    const x = 104 + Math.cos(a) * 8.5, z = -42 + Math.sin(a) * 8.5;
    stallPos.push([x, z, Math.atan2(104 - x, -42 - z)]);
  }
  for (const [sx, sz] of stallPos) pushWp(sx + (rnd() - 0.5) * 1.2, sz + (rnd() - 0.5) * 1.2);
  endZone(Z_STALLS);

  // — наковальни (кузницы)
  beginZone(Z_ANVIL);
  const anvils: [number, number, number][] = [
    [198, -56, 0.6], [206, -63, 0.6], [252, -50, -2.2], [258, -38, -2.4],
    [46, 53, Math.PI], [-30, 97, Math.PI / 2], [86, -50, Math.PI], [124, -22, Math.PI * 0.75],
  ];
  for (const [ax, az] of anvils) pushWp(ax, az);
  endZone(Z_ANVIL);

  /* — пирсы — */
  const pierInfo: { x: number; z1: number; z2: number }[] = [];
  const pierXs = [-24, -6, 12, 30, 48];
  const shoreZ = (x: number) => (x < -24 ? -86 : x < 6 ? -89 : x < 24 ? -87 : x < 42 ? -80 : -76);
  for (const px of pierXs) {
    const z1 = shoreZ(px) + 2, z2 = shoreZ(px) - 17;
    pierInfo.push({ x: px, z1, z2 });
  }
  // лагуна: 4 пирса внутрь диска (от берега к воде)
  const lagPiers: { bx: number; bz: number; tx: number; tz: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const a = -0.55 + k * 0.5;
    const ex = LAG_C[0] + Math.cos(a) * (LAG_R + 3), ez = LAG_C[1] + Math.sin(a) * (LAG_R + 3);
    const tx = LAG_C[0] + Math.cos(a) * (LAG_R - 20), tz = LAG_C[1] + Math.sin(a) * (LAG_R - 20);
    lagPiers.push({ bx: ex, bz: ez, tx, tz });
  }

  beginZone(Z_PIER);
  for (const p of pierInfo) if (p.z2 !== undefined) pushWp(p.x, p.z2);
  for (const p of lagPiers) pushWp(p.tx, p.tz);
  endZone(Z_PIER);

  // — двери складов
  beginZone(Z_WARE);
  const wareDoors: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) wareDoors.push([-28 + i * 16, -58, 0]);
  for (let i = 0; i < 5; i++) wareDoors.push([2 + (i % 2) * 10, 90 + i * 13, Math.PI / 2]);
  for (const [wx, wz] of wareDoors) pushWp(wx, wz);
  endZone(Z_WARE);

  // — таверны
  beginZone(Z_TAVERN);
  const taverns: [number, number, number, number][] = [
    [-14, -56, 8, 8],     // «Золотой осётр» — у гавани
    [252, 18, 9, 9],      // таверна Гильдорфа
    [22, 122, 8, 8],      // «Под пассифлорой» — Glory Lane
  ];
  for (const [tx, tz] of taverns) pushWp(tx, tz);
  endZone(Z_TAVERN);

  // — переулки
  beginZone(Z_ALLEY);
  const alleys: [number, number][] = [
    [112, 106], [114, 112], [116, 100],
    [-96, 40], [-100, 48],
    [58, -70],
  ];
  for (const [ax, az] of alleys) pushWp(ax, az);
  endZone(Z_ALLEY);

  // — двор «Пассифлоры»
  beginZone(Z_COURT);
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * 1.15 + (k / 4) * Math.PI * 0.7;
    pushWp(60 + Math.cos(a) * 7, 122 + Math.sin(a) * 7);
  }
  endZone(Z_COURT);

  // — Temple Isle
  beginZone(Z_TEMPLE);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    pushWp(-186 + Math.cos(a) * 10, -12 + Math.sin(a) * 10);
  }
  for (let k = 0; k < 6; k++) pushWp(-150 + k * 7, -3 - k * 0.8);
  endZone(Z_TEMPLE);

  // — улицы (артерии + переулки), запись диапазонов патрулей
  const street0 = wps.length;
  let patA0 = -1, patA1 = -1, patC0 = -1, patC1 = -1, patD0 = -1, patD1 = -1;
  for (const st of allStreets) {
    const isA = st.tag === 'R6', isC = st.tag === 'R2', isD = st.tag === 'R9';
    if (isA && patA0 < 0) patA0 = wps.length;
    if (isC && patC0 < 0) patC0 = wps.length;
    if (isD && patD0 < 0) patD0 = wps.length;
    for (const s of st.segs) {
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
      const nW = Math.max(1, Math.round(len / 9));
      for (let i = 0; i < nW; i++) {
        const t = (i + 0.5) / nW;
        pushWp(s.x1 + (s.x2 - s.x1) * t, s.z1 + (s.z2 - s.z1) * t);
      }
    }
    if (isA) patA1 = wps.length;
    if (isC) patC1 = wps.length;
    if (isD) patD1 = wps.length;
  }
  const street1 = wps.length;
  zFrom[Z_PAT_A] = patA0; zTo[Z_PAT_A] = patA1;
  zFrom[Z_PAT_C] = patC0; zTo[Z_PAT_C] = patC1;
  zFrom[Z_PAT_D] = patD0; zTo[Z_PAT_D] = patD1;
  zFrom[Z_STREET] = street0; zTo[Z_STREET] = street1;
  const plaza0 = 0;
  const plaza1 = zTo[Z_PLAZA];
  zFrom[Z_PLAZA] = plaza0; zTo[Z_PLAZA] = plaza1;

  const wpCount = wps.length;

  /* ================= ЗДАНИЯ ================= */
  const placed: { x: number; z: number; w: number; d: number }[] = [];
  const clearOfBuildings = (x: number, z: number, half: number) => {
    for (const p of placed) {
      if (Math.hypot(x - p.x, z - p.z) < half + Math.max(p.w, p.d) / 2 + 0.35) return false;
    }
    return true;
  };
  const clearOfPlazas = (x: number, z: number, half: number) => {
    for (const p of plazas) if (Math.hypot(x - p.x, z - p.z) < p.r + half + 2.5) return false;
    return true;
  };
  const siteOk = (x: number, z: number, half: number) =>
    onLand(x, z) &&
    Math.hypot(x - LAG_C[0], z - LAG_C[1]) > LAG_R + half + 2 &&
    clearOfPlazas(x, z, half) &&
    clearOfBuildings(x, z, half);

  const addHouse = (x: number, z: number, w: number, d: number, h: number, rot: number, sd: number, awning: boolean) => {
    addBox(x, 0.3, z, w, h, d, rot, sd, T_HOUSE);
    addRoof(x, h + 0.3, z, w + 1.2, h * 0.28 + 1.5, d + 1.2, d > w ? rot + Math.PI / 2 : rot, sd);
    if (awning) {
      const fx = x + Math.sin(rot) * (d / 2 + 1.1);
      const fz = z + Math.cos(rot) * (d / 2 + 1.1);
      addBox(fx, 3.05, fz, w * 0.75, 0.16, 2.2, rot, rnd(), T_AWNING);
    }
    placed.push({ x, z, w, d });
    markBox(x, z, w + 0.7, d + 0.7, rot, 1);
  };

  // вдоль всех улиц, с обеих сторон
  for (const st of allStreets) {
    for (const s of st.segs) {
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
      const len = Math.hypot(dx, dz);
      if (len < 6) continue;
      const ux = dx / len, uz = dz / len;
      const nx = -uz, nz = ux;
      let t = 1.5 + rnd() * 2;
      while (t < len - 3) {
        const w = 6.5 + rnd() * 5.5;
        const gap = 0.6 + rnd() * 1.4;
        const siteT = t + w / 2;
        if (siteT > len - 2) break;
        const cx = s.x1 + ux * siteT, cz = s.z1 + uz * siteT;
        for (const side of [-1, 1]) {
          if (rnd() < 0.05) continue; // редкие разрывы
          const d = 5.5 + rnd() * 3.5;
          const bx = cx + nx * side * (s.w / 2 + d / 2 + 0.4);
          const bz = cz + nz * side * (s.w / 2 + d / 2 + 0.4);
          const half = Math.max(w, d) / 2;
          const rich = Math.hypot(bx - 0, bz - 40) < 75;
          const h = 7.5 + rnd() * 5 + (rich ? rnd() * 5 : 0) + (rnd() < 0.1 ? 4 : 0);
          if (!siteOk(bx, bz, half)) continue;
          const rot = Math.atan2(ux, uz) + (side > 0 ? Math.PI : 0) + (rnd() - 0.5) * 0.1;
          const nearPlaza = plazas.some((p) => Math.hypot(bx - p.x, bz - p.z) < p.r + 30);
          addHouse(bx, bz, w, d, h, rot, rnd(), nearPlaza && rnd() < 0.45);
        }
        t += w + gap;
      }
    }
  }

  // заполнение кварталов: дома внутри блоков (плотный город как на карте)
  {
    let extra = 0, att = 0;
    while (extra < 320 && att < 14000) {
      att++;
      const x = -135 + rnd() * 300, z = -95 + rnd() * 275;
      if (!onLand(x, z)) continue;
      if (Math.hypot(x - LAG_C[0], z - LAG_C[1]) < LAG_R + 4) continue;
      const w = 6 + rnd() * 5, d = 6 + rnd() * 4;
      const half = Math.max(w, d) / 2;
      if (!siteOk(x, z, half)) continue;
      // должен быть рядом со улицей
      let best = 1e9, brot = 0;
      for (const s of roadSegs) {
        const dd = distToSeg2(x, z, s.x1, s.z1, s.x2, s.z2);
        if (dd < best) {
          best = dd;
          brot = Math.atan2(s.x2 - s.x1, s.z2 - s.z1);
        }
      }
      if (best > half + 13) continue;
      const rich = Math.hypot(x - 0, z - 40) < 75;
      const h = 7.5 + rnd() * 5 + (rich ? rnd() * 5 : 0) + (rnd() < 0.1 ? 4 : 0);
      addHouse(x, z, w, d, h, brot + (rnd() - 0.5) * 0.2, rnd(), rnd() < 0.22);
      extra++;
    }
  }

  /* ---- достопримечательности ---- */
  // Храм Вечного Огня (Temple Isle)
  addBox(-212, 0.3, -24, 22, 17, 32, Math.PI / 2, 0.42, T_TEMPLE);
  addRoof(-212, 17.3, -24, 32.6, 7, 22.6, Math.PI / 2, 0.42);
  addCyl(-212, 0.3, -24, 4.4, 30, 0, 0.1, C_TEMPLE);
  addCone(-212, 30.3, -24, 5.6, 9, 0, 0.1, CN_SPIRE);
  for (const [sx, sz] of [[-196, -33], [-196, -15]]) {
    addCyl(sx, 0.3, sz, 2.4, 16, 0, rnd(), C_TEMPLE);
    addCone(sx, 16.3, sz, 3.2, 4.5, 0, 0.2, CN_SPIRE);
    markCircle(sx, sz, 3, 1);
  }
  placed.push({ x: -212, z: -24, w: 34, d: 24 });
  markBox(-212, -24, 34.8, 24.8, Math.PI / 2, 1);
  addSprite(-212, 34, -24, S_ETERNAL, 4, 0.13);
  addSprite(-212, 32, -24, S_EGLOW, 15, 0.13);
  // лестница храма
  addBox(-199.5, 0.3, -24, 12, 1.2, 2, Math.PI / 2, 0.3, T_STONE);
  addBox(-197.8, 0.3, -24, 14, 0.7, 2, Math.PI / 2, 0.3, T_STONE);

  // таверны
  for (const [tx, tz, tw, td] of taverns) {
    addBox(tx, 0.3, tz + 6, tw, 9.5, td, 0, rnd(), T_HOUSE);
    addRoof(tx, 9.8, tz + 6, tw + 1.2, 4, td + 1.2, 0, rnd());
    addBox(tx + 3, 4.1, tz + 3.4, 2.6, 1.4, 0.18, 0, rnd(), T_AWNING);
    placed.push({ x: tx, z: tz + 6, w: tw, d: td });
    markBox(tx, tz + 6, tw + 0.7, td + 0.7, 0, 1);
  }
  // «Пассифлора»
  addBox(60, 0.3, 132, 13, 15, 11, 0, 0.77, T_HOUSE);
  addRoof(60, 15.3, 132, 14.4, 5.5, 12.4, 0, 0.77);
  addBox(60, 4.3, 126.2, 10.5, 0.2, 2.6, 0, 0.66, T_AWNING);
  placed.push({ x: 60, z: 132, w: 13, d: 11 });
  markBox(60, 132, 13.8, 11.8, 0, 1);

  // склады северной гавани
  for (const [wx, wz] of wareDoors.slice(0, 6)) {
    const w = 10 + rnd() * 6, d = 8 + rnd() * 4, h = 7 + rnd() * 3;
    addBox(wx, 0.3, wz - 6, w, h, d, 0, rnd(), T_WARE);
    addRoof(wx, h + 0.3, wz - 6, w + 1.2, h * 0.24 + 1, d + 1.2, 0, rnd());
    placed.push({ x: wx, z: wz - 6, w, d });
    markBox(wx, wz - 6, w + 0.7, d + 0.7, 0, 1);
  }
  // склады лагуны
  for (const [wx, wz] of wareDoors.slice(6)) {
    const w = 8 + rnd() * 4, d = 9 + rnd() * 5, h = 6.5 + rnd() * 2.5;
    addBox(wx - 7, 0.3, wz, d, h, w, 0, rnd(), T_WARE);
    addRoof(wx - 7, h + 0.3, wz, d + 1.2, h * 0.24 + 1, w + 1.2, 0, rnd());
    placed.push({ x: wx - 7, z: wz, w: d, d: w });
    markBox(wx - 7, wz, d + 0.7, w + 0.7, 0, 1);
  }

  // кузницы: дом + наковальня перед ним
  for (const [ax, az, arot] of anvils) {
    const hx = ax + Math.sin(arot) * 5, hz = az + Math.cos(arot) * 5;
    if (siteOk(hx, hz, 5)) {
      addBox(hx, 0.3, hz, 8, 8.5, 7, arot + Math.PI, rnd(), T_HOUSE);
      addRoof(hx, 8.8, hz, 9.2, 3.4, 8.2, 0, rnd());
      placed.push({ x: hx, z: hz, w: 8, d: 7 });
      markBox(hx, hz, 8.7, 7.7, arot + Math.PI, 1);
    }
    addBox(ax, 0.3, az, 1.1, 0.85, 0.55, arot, rnd(), T_ANVIL);
    markBox(ax, az, 1.3, 1.0, arot, 1);
  }

  // фонтан Hierarch Square
  addCyl(0, 0.38, 40, 3.4, 1.0, 0, 0.5, C_STONE);
  addCyl(0, 1.28, 40, 3.0, 0.14, 0, 0.5, C_WATER);
  addCyl(0, 1.38, 40, 0.55, 2.0, 0, 0.5, C_STONE);
  addCyl(0, 3.38, 40, 1.5, 0.25, 0, 0.5, C_STONE);
  markCircle(0, 40, 3.8, 1);
  // беседка на площади Дубильщиков
  addCyl(232, 0.38, 8, 3.4, 3.2, 0, 0.5, C_WOOD);
  addCone(232, 3.58, 8, 4.6, 2.8, 0, 0.5, CN_ROOF);
  markCircle(232, 8, 4.4, 1);

  // прилавки (визуал) + бочки
  for (const [sx, sz, srot] of stallPos) {
    addBox(sx, 0.75, sz, 2.6, 0.95, 1.4, srot, rnd(), T_WOOD);
    addBox(sx + Math.sin(srot) * 0.3, 2.5, sz + Math.cos(srot) * 0.3, 3.2, 0.18, 2.1, srot, rnd(), T_AWNING);
    markBox(sx, sz, 3.0, 2.3, srot, 1);
    if (rnd() < 0.7) {
      const bx = sx + Math.cos(srot) * 2.2, bz = sz - Math.sin(srot) * 2.2;
      addCyl(bx, 0.38, bz, 0.45, 0.9, 0, rnd(), C_BARREL);
      markCircle(bx, bz, 0.6, 1);
    }
  }

  /* ================= СТЕНЫ, БАШНИ, ВОРОТА ================= */
  const gates: [number, number][] = [[-36, -89], [-6, 174], [-133, 3], [138, -24], [184, -24], [155, 40], [185, 40]];
  const nearGate = (x: number, z: number) => gates.some((g) => Math.hypot(x - g[0], z - g[1]) < 15);

  const buildWallRing = (poly: [number, number][], h: number, towerEvery: number, towerH: number) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (nearGate(mx, mz)) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const rot = Math.atan2(b[0] - a[0], b[1] - a[1]);
      addBox(mx, 0.3, mz, 2.6, h, len + 0.5, rot, rnd(), T_WALL);
      markSeg(a[0], a[1], b[0], b[1], 2.0, 1);
      if (i % towerEvery === 0 && !nearGate(a[0], a[1])) {
        addCyl(a[0], 0.3, a[1], 2.7, towerH, 0, rnd(), C_STONE);
        addCone(a[0], towerH + 0.3, a[1], 3.6, 4.4, 0, rnd(), CN_ROOF);
        markCircle(a[0], a[1], 3.4, 1);
      }
    }
  };
  buildWallRing(MAIN, 8.5, 2, 11 + rnd() * 2);
  buildWallRing(GILD, 8, 2, 10 + rnd() * 2);
  // стена храмового острова
  {
    const N = 18;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const mx = ISLE_C[0] + Math.cos((a0 + a1) / 2) * ISLE_R, mz = ISLE_C[1] + Math.sin((a0 + a1) / 2) * ISLE_R;
      if (Math.hypot(mx + 134, mz - 2) < 14) continue;
      const x0 = ISLE_C[0] + Math.cos(a0) * ISLE_R, z0 = ISLE_C[1] + Math.sin(a0) * ISLE_R;
      const x1 = ISLE_C[0] + Math.cos(a1) * ISLE_R, z1 = ISLE_C[1] + Math.sin(a1) * ISLE_R;
      addBox((x0 + x1) / 2, 0.3, (z0 + z1) / 2, 2.2, 6, Math.hypot(x1 - x0, z1 - z0) + 0.4, Math.atan2(x1 - x0, z1 - z0), rnd(), T_WALL);
      markSeg(x0, z0, x1, z1, 1.7, 1);
    }
  }
  // надвратные башни + арки
  for (const [gx, gz] of gates) {
    for (const side of [-1, 1]) {
      const tx = gx + side * 5.6, tz = gz + side * 2.2;
      addCyl(tx, 0.3, tz, 2.8, 12, 0, rnd(), C_STONE);
      addCone(tx, 12.3, tz, 3.8, 4.6, 0, rnd(), CN_ROOF);
      markCircle(tx, tz, 3.4, 1);
    }
    addBox(gx, 8.6, gz, 14, 2.4, 3.4, Math.atan2(3.4, 5.6) + Math.PI / 2, rnd(), T_STONE);
  }

  /* ================= ДАМБА И МОСТЫ ================= */
  const addBridge = (x1: number, z1: number, x2: number, z2: number, w: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(x2 - x1, z2 - z1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    addBox(cx, 0.1, cz, len, 0.8, w, rot, rnd(), T_QUAY);
    // перила
    for (const side of [-1, 1]) {
      const rx = cx + Math.cos(rot + Math.PI / 2) * side * (w / 2 - 0.3);
      const rz = cz + Math.sin(rot + Math.PI / 2) * side * (w / 2 - 0.3);
      addBox(rx, 0.9, rz, len, 1.1, 0.5, rot, rnd(), T_STONE);
    }
    markSeg(x1, z1, x2, z2, w / 2 + 0.5, 0);
  };
  addBridge(-131, 5, -160, -5, 9);      // дамба на Temple Isle
  addBridge(136, -24, 184, -24, 9);     // северный мост (Гильдорф)
  addBridge(153, 40, 184, 40, 8);       // южный мост
  addBridge(150, 38, 156, 42, 8);       // подход

  /* ================= ПИРСЫ (визуал) ================= */
  for (const p of pierInfo) {
    if (p.z2 === undefined) continue;
    addBox(p.x, -0.1, (p.z1 + p.z2) / 2, 3.6, 1.0, Math.abs(p.z2 - p.z1), 0, rnd(), T_WOOD);
    for (const dz of [-0.4, 0.4]) {
      addCyl(p.x - 1.4, -1.5, (p.z1 + p.z2) / 2 + dz * (p.z2 - p.z1), 0.22, 2.2, 0, rnd(), C_WOOD);
      addCyl(p.x + 1.4, -1.5, (p.z1 + p.z2) / 2 + dz * (p.z2 - p.z1), 0.22, 2.2, 0, rnd(), C_WOOD);
    }
    markSeg(p.x, p.z1, p.x, p.z2, 2.4, 0);
  }
  for (const p of lagPiers) {
    const len = Math.hypot(p.tx - p.bx, p.tz - p.bz);
    const rot = Math.atan2(p.tx - p.bx, p.tz - p.bz);
    addBox((p.bx + p.tx) / 2, -0.1, (p.bz + p.tz) / 2, 3.4, 1.0, len, rot, rnd(), T_WOOD);
    markSeg(p.bx, p.bz, p.tx, p.tz, 2.2, 0);
  }
  // краны
  addCyl(28, 0.3, -70, 0.35, 9.5, 0, 0.4, C_WOOD);
  addBox(28, 9.2, -73, 0.3, 0.3, 6, 0, 0.4, T_WOOD);
  markCircle(28, -70, 0.9, 1);
  addCyl(-30, 0.3, 120, 0.35, 8.5, 0, 0.4, C_WOOD);
  addBox(-30, 8.4, 117, 0.3, 0.3, 5.5, Math.PI / 2, 0.4, T_WOOD);
  markCircle(-30, 120, 0.9, 1);

  /* ================= КОРАБЛИ ================= */
  const ships: [number, number, number, number][] = [
    [-24, -112, 0.2, 1], [16, -116, -0.15, 1], [44, -104, 0.1, 0.8],
    [-56, 108, 1.2, 0.8], [-50, 132, 0.9, 0.7], [161, -62, 1.65, 1],
  ];
  for (const [sx, sz, sr, sc] of ships) {
    addBox(sx, -0.9, sz, 10 * sc, 2.6, 3.8 * sc, sr, rnd(), T_WOOD, 0.13);
    addBox(sx - Math.sin(sr) * 3 * sc, 1.4, sz - Math.cos(sr) * 3 * sc, 3 * sc, 1.8, 3.2 * sc, sr, rnd(), T_WOOD, 0.13);
    addCyl(sx, 1.2, sz, 0.16, 7.5 * sc, 0, rnd(), C_WOOD);
    addBox(sx + Math.sin(sr) * 0.8, 2.1, sz + Math.cos(sr) * 0.8, 4.4 * sc, 3 * sc, 0.12, sr, rnd(), T_SAIL, 0.13);
  }
  addBox(-80, -0.5, 100, 3.4, 1, 1.5, 0.5, rnd(), T_WOOD, 0.2);
  addBox(70, -0.5, -96, 3.2, 1, 1.4, -0.4, rnd(), T_WOOD, 0.2);
  addBox(175, -0.5, 8, 3.2, 1, 1.4, 1.9, rnd(), T_WOOD, 0.2);

  /* ================= МАЯК ================= */
  addCyl(-132, -1.2, 172, 7, 4, 0, 0.6, C_ROCK);
  addCyl(-132, 2.6, 172, 2.1, 13, 0, 0.6, C_STONE);
  addCyl(-132, 15.6, 172, 2.5, 1.3, 0, 0.6, C_QUAY);
  addCyl(-132, 16.9, 172, 1.6, 1.7, 0, 0.6, C_TEMPLE);
  addCone(-132, 18.6, 172, 2.4, 1.9, 0, 0.6, CN_ROOF);
  addSprite(-132, 17.8, 172, S_FLAME, 1.1, 0.4);
  addSprite(-132, 17.9, 172, S_LHGLOW, 10, 0.4);

  /* ================= ДЕРЕВЬЯ ================= */
  {
    let trees = 0, att = 0;
    while (trees < 70 && att < 3000) {
      att++;
      const x = -140 + rnd() * 300, z = -90 + rnd() * 300;
      if (!onLand(x, z)) continue;
      if (Math.hypot(x - LAG_C[0], z - LAG_C[1]) < LAG_R + 4) continue;
      if (!clearOfPlazas(x, z, 3)) continue;
      let near = false;
      for (const s of roadSegs) if (distToSeg2(x, z, s.x1, s.z1, s.x2, s.z2) < s.w / 2 + 3.5) near = true;
      if (near || !clearOfBuildings(x, z, 3.5)) continue;
      addCyl(x, 0.3, z, 0.28, 2.4, 0, rnd(), C_TRUNK);
      addCone(x, 2.0, z, 1.6, 2.8, 0, rnd(), CN_FOLIAGE);
      addCone(x, 3.6, z, 1.15, 2.1, 0, rnd() + 0.3, CN_FOLIAGE);
      markCircle(x, z, 1.0, 1);
      trees++;
    }
    // южные окраины: хижины и деревья
    for (let i = 0; i < 5; i++) {
      const x = -30 + rnd() * 80, z = 200 + rnd() * 110;
      if (!onLand(x, z)) continue;
      addBox(x, 0.3, z, 7, 6 + rnd() * 2, 6, rnd() * 3, rnd(), T_HOUSE);
      addRoof(x, 6.3 + rnd() * 2, z, 8, 3, 7, rnd() > 0.5 ? 0 : Math.PI / 2, rnd());
    }
    for (let i = 0; i < 26; i++) {
      const x = -140 + rnd() * 290, z = 190 + rnd() * 160;
      if (!onLand(x, z)) continue;
      addCyl(x, 0.3, z, 0.3, 2.6, 0, rnd(), C_TRUNK);
      addCone(x, 2.2, z, 1.7, 3, 0, rnd(), CN_FOLIAGE);
    }
  }

  /* ================= ФАКЕЛЫ ================= */
  const torches: [number, number][] = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    torches.push([Math.cos(a) * 22, 40 + Math.sin(a) * 22]);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    torches.push([232 + Math.cos(a) * 15, 8 + Math.sin(a) * 15]);
  }
  // вдоль главных дорог
  const torchRoads = ['R1', 'R2', 'R4', 'R6', 'R8'];
  for (const st of allStreets) {
    if (!torchRoads.includes(st.tag)) continue;
    for (const s of st.segs) {
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
      const n = Math.max(1, Math.floor(len / 17));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const dx = (s.x2 - s.x1) / len, dz = (s.z2 - s.z1) / len;
        const side = i % 2 === 0 ? 1 : -1;
        torches.push([s.x1 + (s.x2 - s.x1) * t - dz * 3.4 * side, s.z1 + (s.z2 - s.z1) * t + dx * 3.4 * side]);
      }
    }
  }
  for (const [gx, gz] of gates) torches.push([gx + 6, gz], [gx - 6, gz]);
  torches.push([-178, -14], [-186, -20], [-194, -14], [-186, -4]); // храмовая площадь
  torches.push([-14, -50], [252, 12], [22, 116]);                  // таверны
  torches.push([54, 118], [66, 118]);                              // Пассифлора
  for (const [tx, tz] of torches) {
    if (!onLand(tx, tz)) continue;
    addCyl(tx, 0.3, tz, 0.09, 2.4, 0, rnd(), C_WOOD);
    const sd = rnd();
    addSprite(tx, 2.92, tz, S_FLAME, 0.5 + sd * 0.3, sd);
    addSprite(tx, 3.1, tz, S_GLOW, 3.4, sd);
    addSprite(tx, 0.45, tz, S_POOL, 6.5, sd);
  }

  // чайки
  for (let i = 0; i < 26; i++) {
    const c: [number, number] = i < 10 ? [-10 + rnd() * 80, -100 - rnd() * 25] : i < 18 ? [-72 + (rnd() - 0.5) * 70, 114 + (rnd() - 0.5) * 70] : [165 + (rnd() - 0.5) * 40, -40 + rnd() * 70];
    addSprite(c[0], 16 + rnd() * 18, c[1], S_GULL, 14 + rnd() * 24, rnd());
  }

  /* ================= ГРАФ СОСЕДСТВА ================= */
  const MAXNB = 8;
  const neighborLists: number[][] = wps.map(() => []);
  for (let i = 0; i < wpCount; i++) {
    for (let j = i + 1; j < wpCount; j++) {
      const dx = wps[i][0] - wps[j][0], dz = wps[i][1] - wps[j][1];
      const d2 = dx * dx + dz * dz;
      if (d2 > 14.5 * 14.5 || d2 < 1) continue;
      const mx = (wps[i][0] + wps[j][0]) / 2, mz = (wps[i][1] + wps[j][1]) / 2;
      if (occ[toCell(mz) * OCC + toCell(mx)] > 0.5) continue;
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

  const zonePairs = new Float32Array(ZONE_COUNT * 2);
  for (let c = 0; c < ZONE_COUNT; c++) {
    zonePairs[c * 2] = zFrom[c];
    zonePairs[c * 2 + 1] = zTo[c];
  }

  return {
    terrain: new Float32Array(ter),
    terrainVerts: ter.length / 6,
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
    zonePairs,
    plaza0,
    plaza1,
    plazaC: [0, 40],
    occ,
    occSpan: SPAN,
  };
}
