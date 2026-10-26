/* Движок Новиграда: камера, passes, инстансинг, день/ночь, ввод, статистика */

import {
  createFBO,
  createProgram,
  createTexture,
  cubeGeometry,
  cylinderGeometry,
  coneGeometry,
  makeVAO,
  mat4LookAt,
  mat4Mul,
  mat4Perspective,
  prismGeometry,
  quadGeometry,
  type Program,
  type VAOSet,
} from './gl';
import { generateCity, type CityData } from './city';
import { CitizenSim } from './simulation';
import {
  BOX_FS,
  BOX_VS,
  CITIZEN_FS,
  CITIZEN_VS,
  CONE_FS,
  CONE_VS,
  CYL_FS,
  CYL_VS,
  POST_FS,
  POST_VS,
  ROOF_FS,
  ROOF_VS,
  SHADOW_BLOB_FS,
  SHADOW_BLOB_VS,
  SHADOW_BOX_FS,
  SHADOW_BOX_VS,
  SKY_FS,
  SKY_VS,
  SPRITE_FS,
  SPRITE_VS,
  TERRAIN_FS,
  TERRAIN_VS,
  WATER_FS,
  WATER_VS,
} from './shaders';
import type { CameraMode, NovigradEngineAPI, NovigradStats, POI } from './types';

const PALETTE = [
  [0x7a, 0x4a, 0x2e], [0x5b, 0x6b, 0x46], [0x8a, 0x6a, 0x3f], [0x6e, 0x3b, 0x3b],
  [0x55, 0x60, 0x6b], [0x9a, 0x84, 0x59], [0x46, 0x52, 0x3c], [0x70, 0x52, 0x3a],
  [0x8c, 0x5a, 0x44], [0x62, 0x70, 0x7a], [0x8d, 0x7d, 0x68], [0x54, 0x44, 0x3a],
  [0x7d, 0x6a, 0x56], [0x96, 0x68, 0x4a],
].map((c) => c.map((v) => v / 255));

const FOV = (55 * Math.PI) / 180;

const CINE_POS: number[][] = [
  [-190, 62, -170], [-70, 24, -122], [-12, 9, -58], [38, 11, -18],
  [125, 48, 95], [0, 112, 165], [-140, 36, -40], [-95, 16, -98],
];
const CINE_TGT: number[][] = [
  [0, 10, -60], [0, 6, -82], [0, 14, -55], [-10, 6, -4],
  [0, 10, -12], [0, 6, -30], [-40, 8, -32], [0, 4, -86],
];

function catmull(p0: number[], p1: number[], p2: number[], p3: number[], t: number): number[] {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map((i) => {
    const a = 2 * p1[i];
    const b = -p0[i] + p2[i];
    const c = 2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i];
    const d = -p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i];
    return 0.5 * (a + b * t + c * t2 + d * t3);
  });
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mix3 = (a: number[], b: number[], k: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k,
];
const smooth = (t: number) => t * t * (3 - 2 * t);

export class NovigradEngine implements NovigradEngineAPI {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private city: CityData | null = null;
  private sim: CitizenSim | null = null;

  private progs: Record<string, Program> = {};
  private vaos: Record<string, VAOSet> = {};
  private counts = { boxes: 0, roofs: 0, cyls: 0, cones: 0, sprites: 0, terrain: 0, water: 0 };

  private sceneTex: WebGLTexture | null = null;
  private sceneDepth: WebGLRenderbuffer | null = null;
  private sceneFbo: WebGLFramebuffer | null = null;

  private vp = new Float32Array(16);
  private proj = new Float32Array(16);
  private view = new Float32Array(16);

  private camEye: number[] = [150, 80, 150];
  private camTarget: number[] = [0, 8, -20];
  private camFwd: number[] = [0, 0, -1];
  private camRight: number[] = [1, 0, 0];
  private camUp: number[] = [0, 1, 0];

  private yaw = 2.35;
  private pitch = 0.62;
  private dist = 175;
  private orbitTarget: number[] = [0, 8, -20];
  private autoSpin = true;
  private tween: {
    t: number; dur: number;
    ft: number[]; tt: number[]; fd: number; td: number; fp: number; tp: number;
    fy: number; ty: number;
  } | null = null;

  private mode: CameraMode = 'free';
  private followPos: number[] = [0, 0];

  private tod = 10;
  private autoTime = true;
  private timeSpeed = 0.02;
  private citizenSpeed = 1;

  private timeS = 0;
  private lastT = 0;
  private raf = 0;
  private frameNo = 0;
  private readyFired = false;
  private disposed = false;

  private sunDir: number[] = [0.4, 0.8, 0.3];
  private sunCol: number[] = [1, 1, 1];
  private amb: number[] = [0.4, 0.45, 0.5];
  private fogCol: number[] = [0.7, 0.77, 0.83];
  private zenith: number[] = [0.3, 0.5, 0.78];
  private horizon: number[] = [0.7, 0.8, 0.86];
  private waterSky: number[] = [0.5, 0.6, 0.7];
  private dayF = 1;
  private nightF = 0;
  private shadowA = 0.3;

  private paletteArr = new Float32Array(PALETTE.flat());

  private fps = 60;
  private simMs = 0;
  private fpsFrames = 0;
  private fpsT = 0;

  private cbReady: (() => void) | null = null;
  private cbStats: ((s: NovigradStats) => void) | null = null;
  private cbError: ((m: string) => void) | null = null;

  private ro: ResizeObserver | null = null;
  private cleanupFns: (() => void)[] = [];
  private lite = false;

  attach(canvas: HTMLCanvasElement): void {
    try {
      this.canvas = canvas;
      canvas.style.touchAction = 'none';
      canvas.style.cursor = 'grab';
      const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL2 не поддерживается этим браузером');
      this.gl = gl;
      if (!gl.getExtension('EXT_color_buffer_float')) {
        throw new Error('GPU не поддерживает float-рендеринг (EXT_color_buffer_float) — симуляция невозможна');
      }

      const params = new URLSearchParams(window.location.search);
      const liteP = params.get('lite');
      this.lite = liteP === '1';

      this.buildAll();

      const popParam = params.get('pop');
      let pop = 4096;
      if (popParam) pop = clamp(parseInt(popParam, 10) || 4096, 64, 16384);
      this.sim!.uploadCity(this.city!);
      this.sim!.populate(pop, this.city!);

      this.bindInput(canvas);
      this.ro = new ResizeObserver(() => this.ensureSize());
      this.ro.observe(canvas);
      this.ensureSize();

      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.cbError?.(msg);
    }
  }

  /* ---------------- build ---------------- */

  private buildAll() {
    const gl = this.gl!;
    const city = generateCity(1337);
    this.city = city;
    this.counts = {
      boxes: city.boxCount,
      roofs: city.roofCount,
      cyls: city.cylCount,
      cones: city.coneCount,
      sprites: city.spriteCount,
      terrain: city.terrainVerts,
      water: city.waterVerts,
    };

    this.sim = new CitizenSim(gl);

    const P = (k: string, vs: string, fs: string) => { this.progs[k] = createProgram(gl, vs, fs, k); };
    P('sky', SKY_VS, SKY_FS);
    P('terrain', TERRAIN_VS, TERRAIN_FS);
    P('water', WATER_VS, WATER_FS);
    P('box', BOX_VS, BOX_FS);
    P('roof', ROOF_VS, ROOF_FS);
    P('cyl', CYL_VS, CYL_FS);
    P('cone', CONE_VS, CONE_FS);
    P('citizen', CITIZEN_VS, CITIZEN_FS);
    P('shadowBox', SHADOW_BOX_VS, SHADOW_BOX_FS);
    P('shadowBlob', SHADOW_BLOB_VS, SHADOW_BLOB_FS);
    P('sprite', SPRITE_VS, SPRITE_FS);
    P('post', POST_VS, POST_FS);

    const cube = cubeGeometry();
    const prism = prismGeometry();
    const cylG = cylinderGeometry(12);
    const coneG = coneGeometry(12);
    const quad = quadGeometry();

    const instSpec = (data: Float32Array): { data: Float32Array; stride: number; attribs: { loc: number; size: number; offset: number }[] } => ({
      data, stride: 12,
      attribs: [
        { loc: 2, size: 4, offset: 0 },
        { loc: 3, size: 4, offset: 4 },
        { loc: 4, size: 4, offset: 8 },
      ],
    });

    this.vaos.terrain = makeVAO(gl, { data: city.terrain, stride: 6, attribs: [
      { loc: 0, size: 3, offset: 0 }, { loc: 1, size: 2, offset: 3 }, { loc: 2, size: 1, offset: 5 },
    ] });
    this.vaos.water = makeVAO(gl, { data: city.water, stride: 3, attribs: [{ loc: 0, size: 3, offset: 0 }] });
    this.vaos.box = makeVAO(gl, { data: cube, stride: 6, attribs: [
      { loc: 0, size: 3, offset: 0 }, { loc: 1, size: 3, offset: 3 },
    ] }, [instSpec(city.boxes)]);
    this.vaos.roof = makeVAO(gl, { data: prism, stride: 6, attribs: [
      { loc: 0, size: 3, offset: 0 }, { loc: 1, size: 3, offset: 3 },
    ] }, [instSpec(city.roofs)]);
    this.vaos.cyl = makeVAO(gl, { data: cylG, stride: 6, attribs: [
      { loc: 0, size: 3, offset: 0 }, { loc: 1, size: 3, offset: 3 },
    ] }, [instSpec(city.cylinders)]);
    this.vaos.cone = makeVAO(gl, { data: coneG, stride: 6, attribs: [
      { loc: 0, size: 3, offset: 0 }, { loc: 1, size: 3, offset: 3 },
    ] }, [instSpec(city.cones)]);
    this.vaos.citizen = makeVAO(gl, { data: cube, stride: 6, attribs: [
      { loc: 0, size: 3, offset: 0 }, { loc: 1, size: 3, offset: 3 },
    ] });
    this.vaos.shadowBox = makeVAO(gl, { data: cube, stride: 6, attribs: [
      { loc: 0, size: 3, offset: 0 }, { loc: 1, size: 3, offset: 3 },
    ] }, [instSpec(city.boxes)]);
    this.vaos.shadowBlob = makeVAO(gl, { data: quad, stride: 2, attribs: [{ loc: 0, size: 2, offset: 0 }] });
    this.vaos.sprite = makeVAO(gl, { data: quad, stride: 2, attribs: [{ loc: 0, size: 2, offset: 0 }] }, [{
      data: city.sprites, stride: 8,
      attribs: [
        { loc: 2, size: 4, offset: 0 },
        { loc: 3, size: 4, offset: 4 },
      ],
    }]);
  }

  /* ---------------- input ---------------- */

  private bindInput(canvas: HTMLCanvasElement) {
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinch = 0;

    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      this.autoSpin = false;
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        if (this.mode === 'free') {
          this.yaw -= dx * 0.005;
          this.pitch = clamp(this.pitch + dy * 0.004, 0.12, 1.45);
          this.tween = null;
        }
      } else if (pointers.size === 2 && this.mode === 'free') {
        const pts = [...pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (lastPinch > 0) this.dist = clamp(this.dist * (lastPinch / d), 18, 340);
        lastPinch = d;
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      lastPinch = 0;
      canvas.style.cursor = 'grab';
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (this.mode !== 'free') return;
      this.dist = clamp(this.dist * Math.exp(e.deltaY * 0.0012), 18, 340);
      this.tween = null;
    };
    const ctx = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', ctx);
    this.cleanupFns.push(() => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', ctx);
    });
  }

  /* ---------------- frame ---------------- */

  private frame = (now: number) => {
    if (this.disposed || !this.gl) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.lastT) / 1000, 0.05);
    this.lastT = now;
    this.timeS += dt;
    this.frameNo++;

    if (this.autoTime) this.tod = (this.tod + dt * this.timeSpeed) % 24;
    this.updateSky();

    const t0 = performance.now();
    this.sim!.step(dt, this.citizenSpeed, this.city!.plazaC, this.city!.plaza0, this.city!.plaza1, this.timeS);
    this.simMs = this.simMs * 0.9 + (performance.now() - t0) * 0.1;

    this.updateCamera(dt);
    if (this.mode === 'follow' && this.frameNo % 4 === 0) {
      this.followPos = this.sim!.readFollow();
    }

    try {
      this.render();
    } catch (e) {
      if (e instanceof Error && !this.readyFired) {
        this.cbError?.(e.message);
        this.disposed = true;
        return;
      }
    }

    if (!this.readyFired) {
      this.readyFired = true;
      this.cbReady?.();
    }

    this.fpsFrames++;
    if (now - this.fpsT > 500) {
      this.fps = (this.fpsFrames * 1000) / (now - this.fpsT);
      this.fpsFrames = 0;
      this.fpsT = now;
      const h = Math.floor(this.tod);
      const m = Math.floor((this.tod % 1) * 60);
      this.cbStats?.({
        fps: Math.round(this.fps),
        population: this.sim?.n ?? 0,
        clock: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        simMs: this.simMs,
      });
    }
  };

  /* ---------------- sky / light ---------------- */

  private updateSky() {
    const phi = ((this.tod - 6) / 12) * Math.PI;
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    let sd = [0.55 * cosP, sinP, 0.83 * cosP];
    const l = Math.hypot(...sd) || 1;
    sd = sd.map((v) => v / l);
    this.sunDir = sd;

    const dayF = 1 - clamp((0.10 - sinP) / 0.22, 0, 1);
    const nightF = 1 - dayF;
    const duskF = Math.exp(-Math.pow(sinP * 4, 2));
    this.dayF = dayF;
    this.nightF = nightF;

    const noon = clamp(sinP * 2.2, 0, 1);
    this.sunCol = mix3([1.0, 0.45, 0.2], [1.02, 0.96, 0.86], noon).map((v) => v * dayF * 1.3);
    this.amb = mix3(
      mix3([0.10, 0.13, 0.20], [0.42, 0.47, 0.52], dayF), [0.30, 0.14, 0.05], duskF * 0.35,
    );
    this.fogCol = mix3(
      mix3([0.035, 0.05, 0.08], [0.70, 0.77, 0.83], dayF), [0.9, 0.45, 0.2], duskF * 0.28,
    );
    this.zenith = mix3([0.012, 0.02, 0.05], [0.30, 0.52, 0.78], dayF);
    this.horizon = mix3(
      mix3([0.05, 0.075, 0.12], [0.72, 0.80, 0.86], dayF), [0.95, 0.5, 0.25], duskF * 0.55,
    );
    this.waterSky = mix3(this.horizon, this.zenith, 0.35);
    this.shadowA = 0.30 * clamp((sinP - 0.06) * 5, 0, 1);
  }

  /* ---------------- camera ---------------- */

  private updateCamera(dt: number) {
    if (this.mode === 'cinematic') {
      const K = CINE_POS.length;
      const u = (this.timeS * 0.0135) % K;
      const i = Math.floor(u);
      const f = smooth(u - i);
      const pos = catmull(
        CINE_POS[(i - 1 + K) % K], CINE_POS[i], CINE_POS[(i + 1) % K], CINE_POS[(i + 2) % K], f,
      );
      const tgt = catmull(
        CINE_TGT[(i - 1 + K) % K], CINE_TGT[i], CINE_TGT[(i + 1) % K], CINE_TGT[(i + 2) % K], f,
      );
      this.camEye = pos;
      this.camTarget = tgt;
    } else if (this.mode === 'follow') {
      this.yaw += dt * 0.3;
      this.pitch = 0.5;
      this.dist = 9;
      this.orbitTarget = [this.followPos[0], 1.4, this.followPos[1]];
      this.applyOrbit();
    } else {
      if (this.autoSpin) this.yaw += dt * 0.06;
      if (this.tween) {
        this.tween.t += dt;
        const k = smooth(clamp(this.tween.t / this.tween.dur, 0, 1));
        this.orbitTarget = mix3(this.tween.ft, this.tween.tt, k);
        this.dist = this.tween.fd + (this.tween.td - this.tween.fd) * k;
        this.pitch = this.tween.fp + (this.tween.tp - this.tween.fp) * k;
        this.yaw = this.tween.fy + (this.tween.ty - this.tween.fy) * k;
        if (k >= 1) this.tween = null;
      }
      this.applyOrbit();
    }
  }

  private applyOrbit() {
    const cp = Math.cos(this.pitch);
    this.camEye = [
      this.orbitTarget[0] + this.dist * cp * Math.sin(this.yaw),
      this.orbitTarget[1] + this.dist * Math.sin(this.pitch),
      this.orbitTarget[2] + this.dist * cp * Math.cos(this.yaw),
    ];
    this.camTarget = this.orbitTarget;
  }

  private computeMatrices() {
    const aspect = (this.canvas!.width || 1) / (this.canvas!.height || 1);
    mat4Perspective(this.proj, FOV, aspect, 0.5, 900);
    mat4LookAt(this.view, this.camEye, this.camTarget, [0, 1, 0]);
    mat4Mul(this.vp, this.proj, this.view);

    let fx = this.camTarget[0] - this.camEye[0];
    let fy = this.camTarget[1] - this.camEye[1];
    let fz = this.camTarget[2] - this.camEye[2];
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    this.camFwd = [fx, fy, fz];
    // right = normalize(cross(fwd, worldUp)); up = cross(right, fwd)
    let rx = -fz, ry = 0, rz = fx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    this.camRight = [rx, ry, rz];
    this.camUp = [
      ry * fz - rz * fy,
      rz * fx - rx * fz,
      rx * fy - ry * fx,
    ];
  }

  /* ---------------- render ---------------- */

  private setScene(p: Program) {
    const gl = this.gl!;
    gl.uniformMatrix4fv(p.u('uVP'), false, this.vp);
    gl.uniform3fv(p.u('uSunDir'), this.sunDir);
    gl.uniform3fv(p.u('uSunColor'), this.sunCol);
    gl.uniform3fv(p.u('uAmbient'), this.amb);
    gl.uniform3fv(p.u('uFogColor'), this.fogCol);
    gl.uniform1f(p.u('uFogDensity'), 0.0026);
    gl.uniform3fv(p.u('uCamPos'), this.camEye);
    gl.uniform1f(p.u('uNight'), this.nightF);
    gl.uniform1f(p.u('uTime'), this.timeS);
  }

  private ensureSize() {
    const gl = this.gl!;
    const canvas = this.canvas!;
    const dpr = this.lite ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h && this.sceneFbo) return;
    canvas.width = w;
    canvas.height = h;
    if (this.sceneTex) gl.deleteTexture(this.sceneTex);
    if (this.sceneDepth) gl.deleteRenderbuffer(this.sceneDepth);
    if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo);
    this.sceneTex = createTexture(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    this.sceneDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.sceneDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    this.sceneFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.sceneDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private render() {
    this.computeMatrices();
    const gl = this.gl!;
    this.ensureSize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
    gl.clearColor(this.fogCol[0], this.fogCol[1], this.fogCol[2], 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // sky
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    {
      const p = this.progs.sky;
      gl.useProgram(p.program);
      gl.uniform3fv(p.u('uCamFwd'), this.camFwd);
      gl.uniform3fv(p.u('uCamRight'), this.camRight);
      gl.uniform3fv(p.u('uCamUp'), this.camUp);
      gl.uniform1f(p.u('uTanHalfFov'), Math.tan(FOV / 2));
      gl.uniform1f(p.u('uAspect'), this.canvas!.width / this.canvas!.height);
      gl.uniform3fv(p.u('uSunDir'), this.sunDir);
      gl.uniform3fv(p.u('uZenith'), this.zenith);
      gl.uniform3fv(p.u('uHorizon'), this.horizon);
      gl.uniform3fv(p.u('uSunColor'), this.sunCol);
      gl.uniform3f(p.u('uGlowColor'), 1.0, 0.5, 0.22);
      gl.uniform1f(p.u('uDayF'), this.dayF);
      gl.uniform1f(p.u('uNightF'), this.nightF);
      gl.uniform1f(p.u('uTime'), this.timeS);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // terrain
    {
      const p = this.progs.terrain;
      gl.useProgram(p.program);
      this.setScene(p);
      gl.bindVertexArray(this.vaos.terrain.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.counts.terrain);
    }

    // building shadows (day)
    if (this.shadowA > 0.01) {
      const p = this.progs.shadowBox;
      gl.useProgram(p.program);
      this.setScene(p);
      gl.uniform1f(p.u('uAlpha'), this.shadowA);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthFunc(gl.LESS);
      gl.bindVertexArray(this.vaos.shadowBox.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, this.counts.boxes);
      gl.depthFunc(gl.LEQUAL);
      // citizen blobs
      const pb = this.progs.shadowBlob;
      gl.useProgram(pb.program);
      this.setScene(pb);
      gl.uniform1f(pb.u('uAlpha'), this.shadowA * 0.85);
      gl.uniform1i(pb.u('uTexW'), this.sim!.texW);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sim!.cur!.s0);
      gl.uniform1i(pb.u('uS0'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.sim!.cur!.t);
      gl.uniform1i(pb.u('uT'), 1);
      gl.depthMask(false);
      gl.bindVertexArray(this.vaos.shadowBlob.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.sim!.n);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // opaque instanced
    const drawInst = (key: string, count: number) => {
      const p = this.progs[key];
      gl.useProgram(p.program);
      this.setScene(p);
      gl.bindVertexArray(this.vaos[key].vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, key === 'roof' ? 18 : key === 'cyl' ? 144 : key === 'cone' ? 36 : 36, count);
    };
    drawInst('box', this.counts.boxes);
    drawInst('roof', this.counts.roofs);
    drawInst('cyl', this.counts.cyls);
    drawInst('cone', this.counts.cones);

    // citizens
    {
      const p = this.progs.citizen;
      gl.useProgram(p.program);
      this.setScene(p);
      gl.uniform1i(p.u('uTexW'), this.sim!.texW);
      gl.uniform3fv(p.u('uPalette'), this.paletteArr);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sim!.cur!.s0); gl.uniform1i(p.u('uS0'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.sim!.cur!.s1); gl.uniform1i(p.u('uS1'), 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.sim!.cur!.t); gl.uniform1i(p.u('uT'), 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.sim!.cTex!); gl.uniform1i(p.u('uC'), 3);
      gl.bindVertexArray(this.vaos.citizen.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, this.sim!.n * 4);
    }

    // water
    {
      const p = this.progs.water;
      gl.useProgram(p.program);
      this.setScene(p);
      gl.uniform3fv(p.u('uWaterSky'), this.waterSky);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.bindVertexArray(this.vaos.water.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.counts.water);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // sprites
    if (this.counts.sprites > 0) {
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      const p = this.progs.sprite;
      gl.useProgram(p.program);
      this.setScene(p);
      gl.uniform3fv(p.u('uCamRight'), this.camRight);
      gl.uniform3fv(p.u('uCamUp'), this.camUp);
      gl.bindVertexArray(this.vaos.sprite.vao);
      gl.uniform1i(p.u('uPass'), 0);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.counts.sprites);
      gl.uniform1i(p.u('uPass'), 1);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.counts.sprites);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // post to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
    gl.disable(gl.DEPTH_TEST);
    const pp = this.progs.post;
    gl.useProgram(pp.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(pp.u('uScene'), 0);
    gl.uniform2f(pp.u('uTexel'), 1 / this.canvas!.width, 1 / this.canvas!.height);
    gl.uniform1f(pp.u('uTime'), this.timeS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------------- public API ---------------- */

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
    this.ro?.disconnect();
    const gl = this.gl;
    if (gl) {
      for (const k of Object.keys(this.vaos)) this.vaos[k].dispose();
      for (const k of Object.keys(this.progs)) gl.deleteProgram(this.progs[k].program);
      if (this.sceneTex) gl.deleteTexture(this.sceneTex);
      if (this.sceneDepth) gl.deleteRenderbuffer(this.sceneDepth);
      if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo);
    }
    this.sim?.dispose();
  }

  onReady(cb: () => void): void { this.cbReady = cb; }
  onStats(cb: (s: NovigradStats) => void): void { this.cbStats = cb; }
  onError(cb: (msg: string) => void): void { this.cbError = cb; }

  setPopulation(n: number): void {
    const pop = clamp(Math.round(n), 64, 16384);
    this.sim?.populate(pop, this.city!);
    if (this.mode === 'follow') this.followPos = [0, 0];
  }

  setAutoTime(v: boolean): void { this.autoTime = v; }
  setTimeOfDay(t: number): void { this.tod = clamp(t, 0, 24); }
  setTimeSpeed(v: number): void { this.timeSpeed = clamp(v, 0, 0.25); }
  setCitizenSpeed(v: number): void { this.citizenSpeed = clamp(v, 0.25, 3); }

  setCameraMode(m: CameraMode): void {
    this.mode = m;
    if (m === 'follow') {
      this.followPos = this.sim ? this.sim.readFollow() : [0, 0];
    }
    if (m === 'free') {
      this.orbitTarget = [0, 8, -10];
      this.dist = clamp(this.dist, 30, 260);
      this.pitch = clamp(this.pitch, 0.2, 1.4);
    }
  }

  focusPOI(p: POI): void {
    this.mode = 'free';
    const presets: Record<POI, { t: number[]; d: number; p: number; y: number }> = {
      plaza: { t: [0, 4, 0], d: 78, p: 0.58, y: 0.7 },
      temple: { t: [0, 10, -52], d: 72, p: 0.42, y: 0.45 },
      harbor: { t: [0, 2, -84], d: 105, p: 0.5, y: Math.PI },
      walls: { t: [0, 12, 0], d: 168, p: 0.72, y: 0.9 },
      lighthouse: { t: [-88, 6, -98], d: 58, p: 0.38, y: 0.65 },
    };
    const pr = presets[p];
    // кратчайшая дуга по yaw
    let y0 = this.yaw % (Math.PI * 2);
    if (y0 > Math.PI) y0 -= Math.PI * 2;
    if (y0 < -Math.PI) y0 += Math.PI * 2;
    let dy = pr.y - y0;
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    this.tween = {
      t: 0, dur: 1.6,
      ft: [...this.orbitTarget], tt: pr.t,
      fd: this.dist, td: pr.d,
      fp: this.pitch, tp: pr.p,
      fy: y0, ty: y0 + dy,
    };
    this.autoSpin = false;
  }

  nextCitizen(): void {
    this.sim?.nextCitizen();
    this.followPos = this.sim ? this.sim.readFollow() : [0, 0];
  }
}
