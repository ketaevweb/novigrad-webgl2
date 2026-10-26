/* GPU-симуляция горожан: ping-pong RGBA32F текстуры, MRT-апдейт, readback для follow-cam */

import { createFBO, createProgram, createTexture } from './gl';
import { ENCODE_FS, ENCODE_VS, SIM_FS, SIM_VS } from './shaders';
import type { CityData } from './city';

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
  cur: StateSet | null = null;           // текущее (только что записанное) состояние
  cTex: WebGLTexture | null = null;      // статические атрибуты горожан
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
    this.occTex = createTexture(gl, 256, 256, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, city.occ);
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

    // начальные данные
    const s0 = new Float32Array(W * W * 4);
    const s1 = new Float32Array(W * W * 4);
    const td = new Float32Array(W * W * 4);
    const c = new Uint8Array(W * W * 4);
    const wpCount = city.wpCount;
    for (let i = 0; i < n; i++) {
      // 14% начинают на площади
      const wpI = Math.random() < 0.14
        ? city.plaza0 + Math.floor(Math.random() * (city.plaza1 - city.plaza0))
        : Math.floor(Math.random() * wpCount);
      const wx = city.wpData[wpI * 4];
      const wz = city.wpData[wpI * 4 + 1];
      const cnt = city.wpData[wpI * 4 + 2];
      const off = city.wpData[wpI * 4 + 3];
      const tgt = cnt > 0
        ? city.neData[(off + Math.floor(Math.random() * cnt)) * 4]
        : wpI;
      s0[i * 4] = wx + (Math.random() - 0.5) * 2.4;
      s0[i * 4 + 1] = wz + (Math.random() - 0.5) * 2.4;
      s0[i * 4 + 2] = 0;
      s0[i * 4 + 3] = 0;
      s1[i * 4] = 1.1 + Math.random() * 0.85;      // speed
      s1[i * 4 + 1] = Math.random() * Math.PI * 2; // phase
      s1[i * 4 + 2] = 0;                            // state: walk
      s1[i * 4 + 3] = 0;                            // timer
      td[i * 4] = Math.random() * Math.PI * 2;      // facing
      td[i * 4 + 1] = tgt;
      c[i * 4] = Math.floor((Math.random() * 255) / 16);   // colorIdx 0..15
      c[i * 4 + 1] = Math.floor(Math.random() * 256);      // height scale
      c[i * 4 + 2] = Math.floor(Math.random() * 256);      // seed
      c[i * 4 + 3] = Math.random() < 0.07 ? 255 : 0;       // guard
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

  step(dt: number, ts: number, plazaC: [number, number], plaza0: number, plaza1: number, timeS: number) {
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
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.wpTex!); gl.uniform1i(p.u('uWP'), 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.neTex!); gl.uniform1i(p.u('uNE'), 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.occTex!); gl.uniform1i(p.u('uOcc'), 5);
    gl.uniform1f(p.u('uDt'), Math.min(dt, 0.05));
    gl.uniform1f(p.u('uTime'), timeS);
    gl.uniform1f(p.u('uNf'), this.n);
    gl.uniform1f(p.u('uTS'), ts);
    gl.uniform1i(p.u('uTexW'), this.texW);
    gl.uniform1i(p.u('uN'), this.n);
    gl.uniform1i(p.u('uPlaza0'), plaza0);
    gl.uniform1i(p.u('uPlaza1'), plaza1);
    gl.uniform2f(p.u('uPlazaC'), plazaC[0], plazaC[1]);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.cur = dst;
  }

  /** readback позиции follow-горожанина */
  readFollow(): [number, number] {
    if (!this.cur) return [0, 0];
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
    gl.uniform1i(this.progEncode.u('uTexW'), this.texW);
    gl.uniform1i(this.progEncode.u('uIdx'), this.followIdx);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.encodePix);
    const x = (this.encodePix[0] / 255) * 260 - 130;
    const z = (this.encodePix[1] / 255) * 260 - 130;
    return [x, z];
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
