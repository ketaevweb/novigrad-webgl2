/* GPU-симуляция горожан: ping-pong RGBA32F текстуры, MRT-апдейт, readback для follow-cam.
   v2: профессии (стража/купцы/кузнецы/грузчики/куртизанки/капюшоны/бандиты),
   суточное расписание, зоны активности. */

import { createFBO, createProgram, createTexture } from './gl';
import { ENCODE_FS, ENCODE_VS, SIM_FS, SIM_VS } from './shaders';
import type { CityData } from './city';

export const P_CITIZEN = 0;
export const P_GUARD = 1;
export const P_MERCHANT = 2;
export const P_SMITH = 3;
export const P_DOCKER = 4;
export const P_COURTESAN = 5;
export const P_HOODED = 6;
export const P_BANDIT = 7;

interface StateSet {
  s0: WebGLTexture;
  s1: WebGLTexture;
  t: WebGLTexture;
  fbo: WebGLFramebuffer;
}

export class CitizenSim {
  private gl: WebGL2RenderingContext;
  private progSim: ReturnType<typeof createProgram>;
  private progEncode: ReturnType<typeof createProgram>;
  private emptyVAO: WebGLVertexArrayObject;
  private setA: StateSet | null = null;
  private setB: StateSet | null = null;
  cur: StateSet | null = null;
  cTex: WebGLTexture | null = null;
  private wpTex: WebGLTexture | null = null;
  private neTex: WebGLTexture | null = null;
  private occTex: WebGLTexture | null = null;
  private encodeTex: WebGLTexture | null = null;
  private encodeFbo: WebGLFramebuffer | null = null;
  private encodePix = new Uint8Array(4);

  texW = 0;
  n = 0;
  followIdx = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.progSim = createProgram(gl, SIM_VS, SIM_FS, 'sim');
    this.progEncode = createProgram(gl, ENCODE_VS, ENCODE_FS, 'encode');
    const vao = gl.createVertexArray();
    this.emptyVAO = vao!;
  }

  /** одиночная загрузка данных города (текстуры waypoint/occ) */
  uploadCity(city: CityData) {
    const gl = this.gl;
    if (this.wpTex) gl.deleteTexture(this.wpTex);
    if (this.neTex) gl.deleteTexture(this.neTex);
    if (this.occTex) gl.deleteTexture(this.occTex);
    this.wpTex = createTexture(gl, city.wpW, city.wpH, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, city.wpData);
    this.neTex = createTexture(gl, city.neCount, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, city.neData);
    this.occTex = createTexture(gl, 512, 512, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, city.occ);
  }

  populate(n: number, city: CityData) {
    const gl = this.gl;
    this.disposeStates();
    this.n = n;
    this.texW = Math.ceil(Math.sqrt(n));
    this.followIdx = Math.floor(Math.random() * n);

    const W = this.texW;
    const mk = (): StateSet => {
      const s0 = createTexture(gl, W, W, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
      const s1 = createTexture(gl, W, W, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
      const t = createTexture(gl, W, W, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
      const fbo = createFBO(gl, [s0, s1, t]);
      return { s0, s1, t, fbo };
    };
    this.setA = mk();
    this.setB = mk();

    const zP = city.zonePairs;
    const zA = (c: number) => zP[c * 2];
    const zB = (c: number) => zP[c * 2 + 1];
    const CAT_PLAZA = 0, CAT_STALL = 1, CAT_ANVIL = 2, CAT_PIER = 3, CAT_WARE = 4,
      CAT_TAVERN = 5, CAT_ALLEY = 6, CAT_COURT = 7, CAT_TEMPLE = 8,
      CAT_PATA = 9, CAT_PATC = 10, CAT_PATD = 11, CAT_STREET = 12;
    const pickIn = (c: number) => {
      const a = zA(c), b = zB(c);
      if (b <= a) return Math.min(a, city.wpCount - 1);
      return a + Math.floor(Math.random() * (b - a));
    };
    const wpX = (i: number) => city.wpData[i * 4];
    const wpZ = (i: number) => city.wpData[i * 4 + 1];

    // начальные данные
    const s0 = new Float32Array(W * W * 4);
    const s1 = new Float32Array(W * W * 4);
    const td = new Float32Array(W * W * 4);
    const c = new Uint8Array(W * W * 4);
    const startCat = (prof: number) => {
      if (prof === P_GUARD) return [CAT_PATA, CAT_PATC, CAT_PATD][Math.floor(Math.random() * 3)];
      if (prof === P_MERCHANT) return CAT_STALL;
      if (prof === P_SMITH) return CAT_ANVIL;
      if (prof === P_DOCKER) return Math.random() < 0.5 ? CAT_PIER : CAT_WARE;
      if (prof === P_COURTESAN) return CAT_COURT;
      if (prof === P_HOODED) return Math.random() < 0.5 ? CAT_ALLEY : CAT_TEMPLE;
      if (prof === P_BANDIT) return CAT_ALLEY;
      const r = Math.random();
      if (r < 0.3) return CAT_STALL;
      if (r < 0.5) return CAT_PLAZA;
      if (r < 0.65) return CAT_STREET;
      if (r < 0.8) return CAT_PIER;
      if (r < 0.9) return CAT_TAVERN;
      return CAT_TEMPLE;
    };
    const profSpeed = (prof: number) => {
      switch (prof) {
        case P_GUARD: return 1.15 + Math.random() * 0.3;
        case P_DOCKER: return 1.2 + Math.random() * 0.35;
        case P_HOODED: return 0.7 + Math.random() * 0.15;
        case P_COURTESAN: return 0.8 + Math.random() * 0.2;
        default: return 1.0 + Math.random() * 0.6;
      }
    };

    for (let i = 0; i < n; i++) {
      // профессия (детерминированно по idx)
      const r = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      let prof = P_CITIZEN;
      if (r < 0.045) prof = P_GUARD;
      else if (r < 0.075) prof = P_MERCHANT;
      else if (r < 0.079) prof = P_SMITH;
      else if (r < 0.139) prof = P_DOCKER;
      else if (r < 0.145) prof = P_COURTESAN;
      else if (r < 0.151) prof = P_HOODED;
      else if (r < 0.159) prof = P_BANDIT;

      // стартовая позиция: на площади или на улице
      const startWp = Math.random() < 0.2 ? pickIn(CAT_PLAZA) : pickIn(CAT_STREET);
      const cat = startCat(prof);
      const tgtWp = pickIn(cat);

      s0[i * 4] = wpX(startWp) + (Math.random() - 0.5) * 2.4;
      s0[i * 4 + 1] = wpZ(startWp) + (Math.random() - 0.5) * 2.4;
      s0[i * 4 + 2] = 0;
      s0[i * 4 + 3] = 0;
      s1[i * 4] = profSpeed(prof);
      s1[i * 4 + 1] = Math.random() * Math.PI * 2;
      s1[i * 4 + 2] = 0;                    // WALK
      s1[i * 4 + 3] = 0;
      td[i * 4] = Math.random() * Math.PI * 2;
      td[i * 4 + 1] = tgtWp;
      td[i * 4 + 2] = 0;                    // intent: прогул
      td[i * 4 + 3] = cat;                  // place
      c[i * 4] = Math.floor((Math.random() * 255) / 16);
      c[i * 4 + 1] = Math.floor(Math.random() * 256);
      c[i * 4 + 2] = Math.floor(Math.random() * 256);
      c[i * 4 + 3] = prof; // байт == значению профессии (шейдер: floor(c.a*255+0.5))
    }

    for (const set of [this.setA, this.setB]) {
      gl.bindTexture(gl.TEXTURE_2D, set.s0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RGBA, gl.FLOAT, s0);
      gl.bindTexture(gl.TEXTURE_2D, set.s1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RGBA, gl.FLOAT, s1);
      gl.bindTexture(gl.TEXTURE_2D, set.t);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RGBA, gl.FLOAT, td);
    }
    if (this.cTex) gl.deleteTexture(this.cTex);
    this.cTex = createTexture(gl, W, W, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST, c);
    this.cur = this.setA;
  }

  step(dt: number, ts: number, tod: number, todSpeed: number, zonePairs: Float32Array, occHalf: number) {
    if (!this.cur || !this.setA || !this.setB) return;
    const gl = this.gl;
    const src = this.cur;
    const dst = this.cur === this.setA ? this.setB : this.setA;

    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, this.texW, this.texW);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.progSim.program);
    const p = this.progSim;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.s0); gl.uniform1i(p.u('uS0'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.s1); gl.uniform1i(p.u('uS1'), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(p.u('uT'), 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.cTex!); gl.uniform1i(p.u('uC'), 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.wpTex!); gl.uniform1i(p.u('uWP'), 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.neTex!); gl.uniform1i(p.u('uNE'), 5);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.occTex!); gl.uniform1i(p.u('uOcc'), 6);
    gl.uniform1f(p.u('uDt'), Math.min(dt, 0.05));
    gl.uniform1f(p.u('uTime'), performance.now() / 1000 % 3600);
    gl.uniform1f(p.u('uNf'), this.n);
    gl.uniform1f(p.u('uTS'), ts);
    gl.uniform1f(p.u('uTod'), tod);
    gl.uniform1f(p.u('uTodSpeed'), Math.max(todSpeed, 0.004));
    gl.uniform1f(p.u('uOccHalf'), occHalf);
    gl.uniform1i(p.u('uTexW'), this.texW);
    gl.uniform1i(p.u('uN'), this.n);
    gl.uniform2fv(p.u('uZones[0]'), zonePairs);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.cur = dst;
  }

  /** readback позиции follow-горожанина: [x, z, visible] */
  readFollow(): [number, number, number] {
    if (!this.cur) return [0, 0, 0];
    const gl = this.gl;
    if (!this.encodeFbo) {
      this.encodeTex = createTexture(gl, 1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
      this.encodeFbo = createFBO(gl, [this.encodeTex]);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.encodeFbo);
    gl.viewport(0, 0, 1, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.progEncode.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cur.s0);
    gl.uniform1i(this.progEncode.u('uS0'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.cur.s1);
    gl.uniform1i(this.progEncode.u('uS1'), 1);
    gl.uniform1i(this.progEncode.u('uTexW'), this.texW);
    gl.uniform1i(this.progEncode.u('uIdx'), this.followIdx);
    gl.uniform1f(this.progEncode.u('uHalf'), 450);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.encodePix);
    const x = (this.encodePix[0] / 255) * 900 - 450;
    const z = (this.encodePix[1] / 255) * 900 - 450;
    return [x, z, this.encodePix[3]];
  }

  nextCitizen() {
    if (this.n > 0) this.followIdx = (this.followIdx + 1) % this.n;
  }

  private disposeStates() {
    const gl = this.gl;
    for (const set of [this.setA, this.setB]) {
      if (!set) continue;
      gl.deleteTexture(set.s0);
      gl.deleteTexture(set.s1);
      gl.deleteTexture(set.t);
      gl.deleteFramebuffer(set.fbo);
    }
    this.setA = this.setB = this.cur = null;
  }

  dispose() {
    const gl = this.gl;
    this.disposeStates();
    if (this.cTex) gl.deleteTexture(this.cTex);
    if (this.wpTex) gl.deleteTexture(this.wpTex);
    if (this.neTex) gl.deleteTexture(this.neTex);
    if (this.occTex) gl.deleteTexture(this.occTex);
    if (this.encodeTex) gl.deleteTexture(this.encodeTex);
    if (this.encodeFbo) gl.deleteFramebuffer(this.encodeFbo);
  }
}
