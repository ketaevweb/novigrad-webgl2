/* WebGL2 helpers: programs, VAOs, textures, FBOs, geometry, mat4 */

export interface Program {
  program: WebGLProgram;
  u(name: string): WebGLUniformLocation | null;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string, label: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? '';
    throw new Error(`[${label}] shader compile: ${log}`);
  }
  return sh;
}

export function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string, label = ''): Program {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource, label);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource, label);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '';
    throw new Error(`[${label}] program link: ${log}`);
  }
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    program,
    u(name: string) {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
      return cache.get(name) ?? null;
    },
  };
}

export interface VAOSet {
  vao: WebGLVertexArrayObject;
  dispose(): void;
}

interface BufSpec {
  data: Float32Array;
  stride: number; // floats per vertex
  attribs: { loc: number; size: number; offset?: number }[];
}

export function makeVAO(gl: WebGL2RenderingContext, base: BufSpec | null, instances?: BufSpec[]): VAOSet {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const bufs: WebGLBuffer[] = [];
  const add = (spec: BufSpec, divisor: number) => {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, spec.data, gl.STATIC_DRAW);
    const strideBytes = spec.stride * 4;
    for (const a of spec.attribs) {
      gl.enableVertexAttribArray(a.loc);
      gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, strideBytes, a.offset !== undefined ? a.offset * 4 : 0);
      gl.vertexAttribDivisor(a.loc, divisor);
    }
    bufs.push(buf);
  };
  if (base) add(base, 0);
  if (instances) for (const inst of instances) add(inst, 1);
  gl.bindVertexArray(null);
  return {
    vao,
    dispose() {
      for (const b of bufs) gl.deleteBuffer(b);
      gl.deleteVertexArray(vao);
    },
  };
}

export function createTexture(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number,
  filter: number,
  data: ArrayBufferView | null = null,
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export function createFBO(gl: WebGL2RenderingContext, colors: WebGLTexture[]): WebGLFramebuffer {
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const attachments: number[] = [];
  colors.forEach((tex, i) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
    attachments.push(gl.COLOR_ATTACHMENT0 + i);
  });
  gl.drawBuffers(attachments);
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`FBO incomplete: 0x${st.toString(16)}`);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

/* ---------- geometry ---------- */

/** cube: x,z in [-0.5,0.5], y in [0,1]; interleaved pos(3)+normal(3) */
export function cubeGeometry(): Float32Array {
  const faces: { n: number[]; verts: number[][] }[] = [
    { n: [0, 0, 1], verts: [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]] },
    { n: [0, 0, -1], verts: [[0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]] },
    { n: [1, 0, 0], verts: [[0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5]] },
    { n: [-1, 0, 0], verts: [[-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5]] },
    { n: [0, 1, 0], verts: [[-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5]] },
    { n: [0, -1, 0], verts: [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]] },
  ];
  const quadIdx = [0, 1, 2, 0, 2, 3];
  const out: number[] = [];
  for (const f of faces) {
    for (const i of quadIdx) {
      const v = f.verts[i];
      out.push(v[0], v[1], v[2], f.n[0], f.n[1], f.n[2]);
    }
  }
  return new Float32Array(out);
}

/** roof prism: base x,z in [-0.5,0.5] at y=0, ridge y=1 along z axis */
export function prismGeometry(): Float32Array {
  const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5];
  const R0 = [0, 1, -0.5], R1 = [0, 1, 0.5];
  const tris = [
    [B, C, R1], [B, R1, R0],      // right slope
    [A, R0, R1], [A, R1, D],      // left slope
    [A, B, R0],                   // gable back
    [D, R1, C],                   // gable front
  ];
  const out: number[] = [];
  for (const t of tris) {
    const [p0, p1, p2] = t;
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const p of t) out.push(p[0], p[1], p[2], nx, ny, nz);
  }
  return new Float32Array(out);
}

/** cylinder: radius 0.5, y in [0,1] */
export function cylinderGeometry(seg: number): Float32Array {
  const out: number[] = [];
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number) =>
    out.push(x, y, z, nx, ny, nz);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const r = 0.5;
    // side
    push(c0 * r, 0, s0 * r, c0, 0, s0);
    push(c1 * r, 0, s1 * r, c1, 0, s1);
    push(c1 * r, 1, s1 * r, c1, 0, s1);
    push(c0 * r, 0, s0 * r, c0, 0, s0);
    push(c1 * r, 1, s1 * r, c1, 0, s1);
    push(c0 * r, 1, s0 * r, c0, 0, s0);
    // top cap
    push(0, 1, 0, 0, 1, 0);
    push(c1 * r, 1, s1 * r, 0, 1, 0);
    push(c0 * r, 1, s0 * r, 0, 1, 0);
    // bottom cap
    push(0, 0, 0, 0, -1, 0);
    push(c0 * r, 0, s0 * r, 0, -1, 0);
    push(c1 * r, 0, s1 * r, 0, -1, 0);
  }
  return new Float32Array(out);
}

/** cone: radius 0.5 base at y=0, apex y=1 */
export function coneGeometry(seg: number): Float32Array {
  const out: number[] = [];
  const apex = [0, 1, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = [0.5 * Math.cos(a0), 0, 0.5 * Math.sin(a0)];
    const p1 = [0.5 * Math.cos(a1), 0, 0.5 * Math.sin(a1)];
    const ux = p1[0] - p0[0], uy = 0, uz = p1[2] - p0[2];
    const vx = apex[0] - p0[0], vy = 1, vz = apex[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    out.push(p0[0], p0[1], p0[2], nx, ny, nz);
    out.push(p1[0], p1[1], p1[2], nx, ny, nz);
    out.push(apex[0], apex[1], apex[2], nx, ny, nz);
  }
  return new Float32Array(out);
}

/** centered 2d quad, pos(2): [-0.5..0.5]^2; also used as (s,t) patch via y+0.5 */
export function quadGeometry(): Float32Array {
  return new Float32Array([
    -0.5, -0.5, 0.5, -0.5, 0.5, 0.5,
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
  ]);
}

/* ---------- mat4 ---------- */

export function mat4Perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function mat4LookAt(out: Float32Array, eye: number[], center: number[], up: number[]): Float32Array {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

export function mat4Mul(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  out.set(o);
  return out;
}
