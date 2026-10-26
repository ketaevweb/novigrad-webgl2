/* Все GLSL-шейдеры Новиграда. ВНИМАНИЕ: #version обязан быть первой строкой. */

const COMMON_UNIFORMS_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
`;

/* ================= SIMULATION (MRT: S0, S1, T) ================= */

export const SIM_VS = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SIM_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

/* Новиград v2: профессии и суточное расписание.
   state: 0=WALK 1=IDLE 2=WORK 3=HOME(скрыт) 4=CARRY(грузчик с тюком)
   prof : 0=горожанин 1=стражник 2=купец 3=кузнец 4=грузчик 5=куртизанка 6=калюшон 7=бандит */

layout(location=0) out vec4 o0;  // pos.xy, vel.xy
layout(location=1) out vec4 o1;  // speed, phase, state, timer
layout(location=2) out vec4 o2;  // facing, target, intent, 1

uniform sampler2D uS0;
uniform sampler2D uS1;
uniform sampler2D uT;
uniform sampler2D uC;    // static: r=colorSeed, g=height, b=seed, a=prof/255
uniform sampler2D uWP;
uniform sampler2D uNE;
uniform sampler2D uOcc;

uniform float uDt;
uniform float uTime;
uniform float uNf;
uniform float uTS;
uniform float uTod;      // время суток 0..24
uniform float uTodSpeed; // игровых часов за секунду
uniform float uOccHalf;  // полуширина мира (450)
uniform int uTexW;
uniform int uN;
uniform vec2 uZones[13];

#define CAT_PLAZA 0
#define CAT_STALL 1
#define CAT_ANVIL 2
#define CAT_PIER 3
#define CAT_WARE 4
#define CAT_TAVERN 5
#define CAT_ALLEY 6
#define CAT_COURT 7
#define CAT_TEMPLE 8
#define CAT_PATA 9
#define CAT_PATC 10
#define CAT_PATD 11
#define CAT_STREET 12

float h1(float n) { return fract(sin(n) * 43758.5453123); }
float rndT(float a) { return fract(sin(a * 127.1 + floor(uTime * 0.35) * 311.7) * 43758.5453); }

int pick(int cat, float r) {
  vec2 z = uZones[cat];
  return int(z.x + clamp(r, 0.0, 0.999) * max(z.y - z.x, 1.0));
}
float hoursTo(float h) { return mod(h - uTod + 24.0, 24.0); }

void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  int idx = tc.y * uTexW + tc.x;
  if (idx >= uN) { o0 = vec4(0.0); o1 = vec4(0.0); o2 = vec4(0.0); return; }

  vec4 s0 = texelFetch(uS0, tc, 0);
  vec4 s1 = texelFetch(uS1, tc, 0);
  vec4 td = texelFetch(uT, tc, 0);
  vec4 c = texelFetch(uC, tc, 0);

  vec2 pos = s0.xy;
  vec2 vel = s0.zw;
  float speed = s1.x;
  float phase = s1.y;
  float state = s1.z;
  float timer = s1.w;
  float tgt = td.y;
  float intent = td.z;              // 0=прогул 1=домой 2=на дело

  float prof = floor(c.a * 255.0 + 0.5);
  float dt = uDt * uTS;

  float hs0 = h1(float(idx) * 0.731 + 1.0);
  float hs1 = h1(float(idx) * 1.571 + 2.0);
  float hs2 = h1(float(idx) * 2.913 + 3.0);
  float hs3 = h1(float(idx) * 4.201 + 4.0);
  float hs4 = h1(float(idx) * 5.377 + 5.0);

  bool isNight = uTod < 6.2 || uTod >= 21.0;

  ivec2 wtc = ivec2(int(tgt) & 63, int(tgt) >> 6);
  vec4 wp = texelFetch(uWP, wtc, 0);
  vec2 tp = wp.xy;

  /* ---------- решение: прибытие / конец таймера ---------- */
  // intent: 0 прогул, 1 домой, 1.5 домой (грузчик), 0.25 «на пирсе», 1.0 «с тюком» (грузчик)
  // td.w = категория места текущей цели
  bool arrived = false;
  bool needDecision = false;

  if (state < 0.5 || (state > 3.5 && state < 4.5)) {
    // ================= WALK / CARRY =================
    float spdMult = prof < 0.5 ? 1.0 : prof < 1.5 ? 1.12 : prof < 2.5 ? 0.95 :
                    prof < 3.5 ? 1.0 : prof < 4.5 ? 1.22 : prof < 5.5 ? 0.82 :
                    prof < 6.5 ? 0.6 : 1.0;
    if (state > 3.5) spdMult *= 0.9; // тяжесть тюка
    if (isNight && intent > 0.5 && intent < 1.8) spdMult *= 1.18; // спешит домой

    vec2 dir = tp - pos;
    float dl = max(length(dir), 0.001);
    float wob = (hs1 - 0.5) * 0.55;
    vec2 dw = vec2(dir.x * cos(wob) - dir.y * sin(wob), dir.x * sin(wob) + dir.y * cos(wob));
    vec2 desired = dw / dl * speed * spdMult;
    vel = mix(vel, desired, clamp(dt * 2.2, 0.0, 1.0));

    for (int k = 0; k < 3; k++) {
      float rk = h1(float(idx) * 5.7 + float(k) * 17.0 + floor(uTime * 0.5) * 0.11);
      int oi = int(rk * uNf);
      ivec2 otc = ivec2(oi % uTexW, oi / uTexW);
      vec4 od = texelFetch(uS0, otc, 0);
      vec2 d = pos - od.xy;
      float l = length(d);
      if (l < 1.2 && l > 0.001) { vel += (d / l) * (1.2 - l) * 2.6; }
    }

    vec2 np = pos + vel * dt;
    vec2 ouv = (np + uOccHalf) / (2.0 * uOccHalf);
    float blocked = texture(uOcc, ouv).r;
    if (blocked > 0.5) {
      vec2 nx = vec2(np.x, pos.y);
      vec2 nz = vec2(pos.x, np.y);
      float bx = texture(uOcc, (nx + uOccHalf) / (2.0 * uOccHalf)).r;
      float bz = texture(uOcc, (nz + uOccHalf) / (2.0 * uOccHalf)).r;
      if (bx < 0.5) { np = nx; vel.y *= 0.4; }
      else if (bz < 0.5) { np = nz; vel.x *= 0.4; }
      else {
        np = pos;
        vel *= -0.2;
        int cnt = int(wp.z);
        int off = int(wp.w);
        if (cnt > 0) {
          int pk = off + int(clamp(hs4, 0.0, 0.999) * float(cnt));
          tgt = float(int(texelFetch(uNE, ivec2(pk, 0), 0).r));
        }
      }
    }
    pos = np;
    phase += length(vel) * dt * 2.4;

    vec2 dcur = tp - pos;
    if (dot(dcur, dcur) < 3.6) { arrived = true; needDecision = true; }
  } else if (state < 1.5) {
    // ============ IDLE ============
    vel *= max(1.0 - dt * 3.5, 0.0);
    timer -= dt;
    if (timer <= 0.0) needDecision = true;
  } else if (state < 2.5) {
    // ================= WORK =================
    vel *= 0.0;
    timer -= dt;
    if (timer <= 0.0) needDecision = true;
  } else {
    // ================= HOME (скрыт, ждёт утра) =================
    vel *= 0.0;
    timer -= dt;
    if (timer <= 0.0) needDecision = true;
  }

  if (needDecision) {
    float rA = rndT(float(idx) * 1.13 + 7.0);
    float rB = rndT(float(idx) * 2.17 + 13.0);
    float rC = rndT(float(idx) * 3.71 + 29.0);
    float place = td.w;
    float goHomeTimer = min(hoursTo(6.2 + hs2 * 1.6) / max(uTodSpeed, 0.004), 900.0);

    if (prof < 0.5) {
      // ---------- горожанин ----------
      if (arrived && intent > 0.5 && intent < 1.5) {
        state = 3.0; timer = goHomeTimer;
      } else if (isNight || uTod >= 19.6) {
        intent = 1.0; tgt = float(pick(CAT_STREET, hs2)); td.w = float(CAT_STREET); state = 0.0;
      } else if (arrived) {
        if (place > 11.5) {
          // улица: осмотреться или идти дальше
          if (rC < 0.3) { state = 1.0; timer = 2.0 + rA * 5.0; }
          else { tgt = float(pick(CAT_STREET, rB)); td.w = float(CAT_STREET); intent = 0.0; state = 0.0; }
        } else {
          state = 1.0;
          if (place > 4.5 && place < 5.5) timer = 16.0 + rC * 30.0;   // таверна
          else if (place < 0.5) timer = 8.0 + rC * 14.0;              // площадь
          else timer = 4.0 + rC * 9.0;                                // рынок/храм/пирс
        }
      } else {
        int cat;
        if (uTod < 9.0)       cat = rA < 0.4 ? CAT_STALL : rA < 0.65 ? CAT_TEMPLE : rA < 0.85 ? CAT_PIER : CAT_STREET;
        else if (uTod < 14.0) cat = rA < 0.45 ? CAT_TAVERN : rA < 0.75 ? CAT_PLAZA : CAT_STREET;
        else if (uTod < 18.0) cat = rA < 0.35 ? CAT_STALL : rA < 0.6 ? CAT_STREET : rA < 0.78 ? CAT_PLAZA : rA < 0.9 ? CAT_PIER : CAT_TEMPLE;
        else                  cat = rA < 0.45 ? CAT_TAVERN : rA < 0.8 ? CAT_STREET : CAT_PLAZA;
        tgt = float(pick(cat, rB)); td.w = float(cat);
        intent = cat == CAT_STREET ? 0.0 : 2.0;
        state = 0.0;
      }
    } else if (prof < 1.5) {
      // ---------- стражник ----------
      if (arrived && intent > 0.5 && intent < 1.5) {
        state = 3.0; timer = goHomeTimer;
      } else if (isNight && hs1 > 0.42 && !(intent > 0.5 && intent < 1.5)) {
        intent = 1.0; tgt = float(pick(CAT_STREET, hs2)); td.w = float(CAT_STREET); state = 0.0;
      } else if (arrived) {
        state = 1.0; timer = 1.2 + rB * 3.5;
      } else {
        int zone = hs0 < 0.34 ? CAT_PATA : hs0 < 0.67 ? CAT_PATC : CAT_PATD;
        tgt = float(pick(zone, rA)); td.w = float(zone);
        intent = 2.0; state = 0.0;
      }
    } else if (prof < 2.5) {
      // ---------- купец ----------
      bool offDuty = isNight || uTod >= 19.0 || uTod < 7.5;
      if (arrived && intent > 0.5 && intent < 1.5) {
        state = 3.0; timer = goHomeTimer;
      } else if (offDuty && !(intent > 0.5 && intent < 1.5)) {
        intent = 1.0; tgt = float(pick(CAT_STREET, hs2)); td.w = float(CAT_STREET); state = 0.0;
      } else if (arrived) {
        if (intent > 1.5) { state = 2.0; timer = 35.0 + hs3 * 80.0; }   // торгует за прилавком
        else { state = 1.0; timer = 3.0 + rC * 6.0; }
      } else if (rC < 0.1) {
        tgt = float(pick(CAT_STREET, rB)); td.w = float(CAT_STREET); intent = 2.0; state = 0.0;
      } else {
        tgt = float(pick(CAT_STALL, rA)); td.w = float(CAT_STALL); intent = 2.0; state = 0.0;
      }
    } else if (prof < 3.5) {
      // ---------- кузнец ----------
      bool offDuty = uTod >= 19.0 || uTod < 7.0;
      if (arrived && intent > 0.5 && intent < 1.5) {
        state = 3.0; timer = goHomeTimer;
      } else if (offDuty && !(intent > 0.5 && intent < 1.5)) {
        intent = 1.0; tgt = float(pick(CAT_STREET, hs2)); td.w = float(CAT_STREET); state = 0.0;
      } else if (arrived) {
        if (intent > 1.5) { state = 2.0; timer = 55.0 + hs3 * 120.0; }  // работает у наковальни
        else { state = 1.0; timer = 3.0 + rC * 6.0; }
      } else if (rC < 0.07) {
        tgt = float(pick(CAT_STREET, rB)); td.w = float(CAT_STREET); intent = 2.0; state = 0.0;
      } else {
        tgt = float(pick(CAT_ANVIL, rA)); td.w = float(CAT_ANVIL); intent = 2.0; state = 0.0;
      }
    } else if (prof < 4.5) {
      // ---------- грузчик: пирс <-> склад ----------
      bool offDuty = isNight || uTod < 6.5 || uTod >= 19.5;
      if (arrived && intent > 1.2 && intent < 1.8) {
        state = 3.0; timer = goHomeTimer;
      } else if (offDuty && !(intent > 1.2 && intent < 1.8)) {
        intent = 1.5; tgt = float(pick(CAT_STREET, hs2)); td.w = float(CAT_STREET); state = 0.0;
      } else if (intent < 0.25) {
        tgt = float(pick(CAT_PIER, rA)); td.w = float(CAT_PIER); intent = 0.25; state = 0.0;
      } else if (intent < 0.75) {
        if (arrived) { state = 1.0; timer = 1.0 + rB * 2.5; }            // пауза на пирсе
        else { tgt = float(pick(CAT_WARE, rA)); td.w = float(CAT_WARE); intent = 1.0; state = 4.0; } // тюком к складу
      } else if (intent < 1.25) {
        if (arrived) { state = 2.0; timer = 2.5 + rC * 3.5; }            // разгрузка
        else { tgt = float(pick(CAT_PIER, rA)); td.w = float(CAT_PIER); intent = 0.25; state = 0.0; }
      } else {
        state = 0.0; // уже идёт домой
      }
    } else if (prof < 5.5) {
      // ---------- куртизанка ----------
      bool onDuty = uTod >= 12.0 || uTod < 2.5;
      if (arrived && intent > 0.5 && intent < 1.5) {
        state = 3.0; timer = min(hoursTo(11.8 + hs2) / max(uTodSpeed, 0.004), 900.0);
      } else if (!onDuty && !(intent > 0.5 && intent < 1.5)) {
        intent = 1.0; tgt = float(pick(CAT_STREET, hs2)); td.w = float(CAT_STREET); state = 0.0;
      } else if (arrived) {
        if (intent > 1.5 && place > 6.5 && place < 7.5) { state = 2.0; timer = 22.0 + hs3 * 55.0; }
        else { state = 1.0; timer = 4.0 + rC * 8.0; }
      } else if (rC < 0.2) {
        int cat = rB < 0.5 ? CAT_PLAZA : CAT_STREET;
        tgt = float(pick(cat, rA)); td.w = float(cat); intent = 2.0; state = 0.0;
      } else {
        tgt = float(pick(CAT_COURT, rA)); td.w = float(CAT_COURT); intent = 2.0; state = 0.0;
      }
    } else if (prof < 6.5) {
      // ---------- человек в капюшоне ----------
      bool dayHide = !isNight && uTod >= 5.0;
      if (arrived && intent > 0.5 && intent < 1.5) {
        state = 3.0; timer = min(hoursTo(20.5 + hs2 * 2.0) / max(uTodSpeed, 0.004), 900.0);
      } else if (dayHide && !(intent > 0.5 && intent < 1.5)) {
        intent = 1.0; tgt = float(pick(CAT_STREET, hs2)); td.w = float(CAT_STREET); state = 0.0;
      } else if (arrived) {
        state = 1.0; timer = 6.0 + rC * 16.0;
      } else {
        int cat = rA < 0.55 ? CAT_ALLEY : rA < 0.85 ? CAT_TEMPLE : CAT_COURT;
        tgt = float(pick(cat, rB)); td.w = float(cat); intent = 2.0; state = 0.0;
      }
    } else {
      // ---------- бандит ----------
      bool dayHide = !isNight && hs0 < 0.7;
      if (arrived && intent > 0.5 && intent < 1.5) {
        state = 3.0; timer = min(hoursTo(21.0 + hs2 * 1.5) / max(uTodSpeed, 0.004), 900.0);
      } else if (dayHide && !(intent > 0.5 && intent < 1.5)) {
        intent = 1.0; tgt = float(pick(CAT_STREET, hs2)); td.w = float(CAT_STREET); state = 0.0;
      } else if (arrived) {
        state = 2.0; timer = 8.0 + hs3 * 18.0; // торчит в переулке
      } else if (rC < 0.2) {
        tgt = float(pick(CAT_STREET, rB)); td.w = float(CAT_STREET); intent = 2.0; state = 0.0;
      } else {
        tgt = float(pick(CAT_ALLEY, rA)); td.w = float(CAT_ALLEY); intent = 2.0; state = 0.0;
      }
    }
  }

  // facing follows velocity
  float sp = length(vel);
  if (sp > 0.12) {
    float want = atan(vel.x, vel.y);
    float cur = td.x;
    float d = want - cur;
    d = mod(d + 3.14159265, 6.2831853) - 3.14159265;
    td.x = cur + d * clamp(dt * 6.0, 0.0, 1.0);
  }

  o0 = vec4(pos, vel);
  o1 = vec4(speed, phase, state, timer);
  o2 = vec4(td.x, tgt, intent, 1.0);
}
`;

export const ENCODE_VS = SIM_VS;

/** кодирование позиции горожанина followIdx в RGBA8 1x1 для readPixels */
export const ENCODE_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform sampler2D uS0;
uniform int uTexW;
uniform int uIdx;
uniform float uHalf;
void main() {
  ivec2 tc = ivec2(uIdx % uTexW, uIdx / uTexW);
  vec4 s = texelFetch(uS0, tc, 0);
  float sp = clamp(length(s.zw) / 3.0, 0.0, 1.0);
  fragColor = vec4(clamp((s.x + uHalf) / (2.0 * uHalf), 0.0, 1.0),
                   clamp((s.y + uHalf) / (2.0 * uHalf), 0.0, 1.0),
                   sp, 1.0);
}
`;

/* ================= SKY ================= */

export const SKY_VS = /* glsl */ `#version 300 es
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SKY_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vNdc;
out vec4 fragColor;

uniform vec3 uCamFwd;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uTanHalfFov;
uniform float uAspect;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uGlowColor;
uniform float uDayF;
uniform float uNightF;
uniform float uTime;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 ndc = vNdc;
  vec3 dir = normalize(uCamFwd + uCamRight * (ndc.x * uTanHalfFov * uAspect) + uCamUp * (ndc.y * uTanHalfFov));

  float t = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.55));

  // sun
  float s = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * (pow(s, 900.0) * 1.6 + pow(s, 10.0) * 0.14);
  col += uGlowColor * pow(s, 2.5) * pow(1.0 - t, 2.0) * 0.8;

  // moon (opposite the sun)
  vec3 md = normalize(vec3(-uSunDir.x, max(-uSunDir.y, 0.15), -uSunDir.z));
  float m = max(dot(dir, md), 0.0);
  col += vec3(0.85, 0.88, 0.95) * (pow(m, 1600.0) * 1.3 + pow(m, 60.0) * 0.10) * uNightF;

  // stars
  if (uNightF > 0.02 && dir.y > 0.02) {
    vec2 sq = dir.xz / (dir.y + 0.9);
    vec2 cell = floor(sq * 90.0);
    float h = hash12(cell);
    if (h > 0.995) {
      vec2 f = fract(sq * 90.0) - 0.5;
      float star = smoothstep(0.25, 0.0, length(f));
      float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h * 90.0);
      col += vec3(0.9, 0.93, 1.0) * star * tw * uNightF;
    }
  }

  // light clouds by day
  if (dir.y > 0.015 && uDayF > 0.02) {
    vec2 cp = dir.xz / (dir.y + 0.35) * 0.9 + vec2(uTime * 0.008, uTime * 0.004);
    float cn = vnoise(cp) * 0.55 + vnoise(cp * 2.3) * 0.3 + vnoise(cp * 5.1) * 0.15;
    float cl = smoothstep(0.55, 0.85, cn);
    col = mix(col, mix(vec3(0.85, 0.87, 0.9), vec3(1.0, 0.95, 0.88), pow(s, 2.0)), cl * uDayF * 0.45 * smoothstep(0.015, 0.2, dir.y));
  }

  fragColor = vec4(col, 1.0);
}
`;

/* ================= TERRAIN (ground + roads + harbor floor) ================= */

export const TERRAIN_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in float aKind;
uniform mat4 uVP;
out vec3 vWorld;
out vec2 vUv;
flat out float vKind;
void main() {
  vWorld = aPos;
  vUv = aUv;
  vKind = aKind;
  gl_Position = uVP * vec4(aPos, 1.0);
}
`;

export const TERRAIN_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
in vec2 vUv;
flat in float vKind;
out vec4 fragColor;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;
uniform float uNight;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 applyFog(vec3 col) {
  float d = length(vWorld - uCamPos);
  float f = 1.0 - exp(-d * d * uFogDensity * uFogDensity);
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}

void main() {
  vec3 N = vec3(0.0, 1.0, 0.0);
  float ndl = max(uSunDir.y, 0.0);
  vec3 lit = uAmbient + uSunColor * ndl;
  vec3 col;

  if (vKind < 0.5) {
    // grass / earth
    float n = vnoise(vWorld.xz * 0.14) * 0.6 + vnoise(vWorld.xz * 0.53) * 0.4;
    col = mix(vec3(0.26, 0.30, 0.17), vec3(0.36, 0.38, 0.21), n);
    float dry = vnoise(vWorld.xz * 0.05 + 7.0);
    col = mix(col, vec3(0.42, 0.37, 0.23), smoothstep(0.62, 0.85, dry) * 0.5);
    col *= 0.85 + 0.3 * vnoise(vWorld.xz * 1.7);
  } else if (vKind < 1.5) {
    // cobblestone (roads, plaza, docks)
    float scale = 1.15;
    vec2 p = vUv * scale;
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float h = hash12(cell + floor(vUv.x) * 0.013);
    float h2 = hash12(cell * 1.7 + 3.1);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float gap = smoothstep(0.10, 0.03, edge);
    vec3 stone = mix(vec3(0.40, 0.39, 0.36), vec3(0.52, 0.50, 0.45), h);
    col = mix(stone * (0.8 + 0.3 * h2), stone * 0.45, gap);
    col *= 0.9 + 0.2 * vnoise(vWorld.xz * 0.31);
  } else if (vKind < 2.5) {
    // wooden pier planks
    float row = floor(vUv.y / 0.55);
    float fr = fract(vUv.y / 0.55);
    float h = hash12(vec2(row, floor(vUv.x)));
    col = mix(vec3(0.46, 0.33, 0.19), vec3(0.36, 0.25, 0.14), h);
    col *= 0.9 + 0.2 * vnoise(vec2(vUv.x * 3.0, row * 7.0));
    col *= 1.0 - smoothstep(0.88, 1.0, fr) * 0.45;
  } else {
    // dark harbor floor
    float n = vnoise(vWorld.xz * 0.3);
    col = mix(vec3(0.05, 0.08, 0.08), vec3(0.09, 0.12, 0.11), n);
  }

  col *= lit;
  fragColor = vec4(applyFog(col), 1.0);
}
`;

/* ================= WATER ================= */

export const WATER_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
out vec3 vWorld;
void main() {
  vWorld = aPos;
  gl_Position = uVP * vec4(aPos, 1.0);
}
`;

export const WATER_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
out vec4 fragColor;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;
uniform float uTime;
uniform vec3 uWaterSky;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 p = vWorld.xz;
  float t = uTime;
  // analytic wave normal
  float dx = 0.25 * 0.10 * cos(p.x * 0.25 + t * 1.1)
           + 0.13 * 0.12 * cos((p.x + p.y) * 0.13 + t * 0.6)
           + 0.9 * 0.05 * cos(p.x * 0.9 - t * 1.7 + p.y * 0.4);
  float dz = 0.31 * 0.08 * cos(p.y * 0.31 - t * 0.9)
           + 0.13 * 0.12 * cos((p.x + p.y) * 0.13 + t * 0.6)
           + 0.7 * 0.06 * cos(p.y * 0.7 + t * 1.3 + p.x * 0.2);
  vec3 N = normalize(vec3(-dx * 2.2, 1.0, -dz * 2.2));

  vec3 V = normalize(uCamPos - vWorld);
  float fres = pow(1.0 - max(dot(V, N), 0.0), 3.0);

  vec3 deep = vec3(0.045, 0.115, 0.125);
  vec3 col = mix(deep, uWaterSky, 0.22 + 0.6 * fres);

  // sun specular
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, uSunDir), 0.0), 120.0);
  col += uSunColor * spec * 1.8;
  float glitter = pow(max(dot(R, uSunDir), 0.0), 700.0);
  col += uSunColor * glitter * 3.0;

  // sparkle
  float spark = hash12(floor(p * 3.0) + floor(t * 2.0));
  col += vec3(0.5, 0.6, 0.6) * step(0.985, spark) * 0.25;

  col *= (uAmbient * 1.7 + uSunColor * 0.28);

  float d = length(vWorld - uCamPos);
  float f = 1.0 - exp(-d * d * uFogDensity * uFogDensity);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));

  fragColor = vec4(col, 0.94);
}
`;

/* ================= INSTANCED BOXES (buildings & props) ================= */

export const BOX_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;      // x,z in [-0.5,0.5], y in [0,1]
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aI0;       // pos.xyz, rotY
layout(location=3) in vec4 aI1;       // size.xyz, seed
layout(location=4) in vec4 aI2;       // type, bobAmp, 0, 0
uniform mat4 uVP;
uniform float uTime;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vNormalL;
out vec3 vLocal;
out vec3 vSize;
flat out float vType;
flat out float vSeed;
mat3 rotY(float a) {
  float c = cos(a); float s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}
void main() {
  vec3 local = vec3(aPos.x * aI1.x, aPos.y * aI1.y, aPos.z * aI1.z);
  mat3 R = rotY(aI0.w);
  vec3 world = R * local + aI0.xyz;
  world.y += sin(uTime * 0.8 + aI1.w * 17.0) * aI2.y;
  vWorld = world;
  vNormal = R * aNormal;
  vNormalL = aNormal;
  vLocal = local;
  vSize = aI1.xyz;
  vType = aI2.x;
  vSeed = aI1.w;
  gl_Position = uVP * vec4(world, 1.0);
}
`;

export const BOX_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vNormalL;
in vec3 vLocal;
in vec3 vSize;
flat in float vType;
flat in float vSeed;
out vec4 fragColor;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;
uniform float uNight;
uniform float uTime;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 plasterColor(float seed) {
  float h = hash12(vec2(seed, 3.7));
  vec3 a = vec3(0.82, 0.75, 0.60);
  vec3 b = vec3(0.76, 0.66, 0.52);
  vec3 c = vec3(0.84, 0.79, 0.68);
  vec3 d = vec3(0.70, 0.60, 0.47);
  if (h < 0.25) return a;
  if (h < 0.5) return b;
  if (h < 0.75) return c;
  return d;
}

vec3 timberColor() { return vec3(0.24, 0.16, 0.10); }

/** фахверк: возвращает albedo + emissive окон */
vec4 fachwerk(float u, float v, float seed, bool groundDoor) {
  float floorH = 3.1;
  float fy = v / floorH;
  float row = floor(fy);
  float bx = u / 2.3;
  float cfx = fract(bx);
  float cfy = fract(fy);

  vec3 plaster = plasterColor(seed);
  vec3 timber = timberColor();
  vec3 col = plaster;

  // beams
  float beamV = 1.0 - smoothstep(0.055, 0.095, min(cfx, 1.0 - cfx));
  float beamH = 1.0 - smoothstep(0.05, 0.09, min(cfy, 1.0 - cfy));
  float d1 = abs((cfx - 0.5) + (cfy - 0.5));
  float d2 = abs((cfx - 0.5) - (cfy - 0.5));
  float brace = (1.0 - smoothstep(0.05, 0.09, min(d1, d2))) * 0.85;
  float timberMask = clamp(max(max(beamV, beamH), brace), 0.0, 1.0);
  col = mix(col, timber, timberMask * 0.92);

  // stone base
  if (row < 0.5) {
    vec2 cell = floor(vec2(u / 1.1, v / 0.55));
    float h = hash12(cell + seed);
    vec3 stone = mix(vec3(0.40, 0.39, 0.36), vec3(0.50, 0.48, 0.44), h);
    float edge = min(min(fract(u / 1.1), 1.0 - fract(u / 1.1)), min(fract(v / 0.55), 1.0 - fract(v / 0.55)));
    stone *= 1.0 - smoothstep(0.09, 0.03, edge) * 0.4;
    col = mix(stone, timber, timberMask * 0.5);
  }

  // windows
  float winCol = step(0.30, cfx) * step(cfx, 0.72);
  float winRow = step(0.32, cfy) * step(cfy, 0.80);
  float win = winCol * winRow * step(0.5, row);
  if (groundDoor) {
    // door on ground floor near center
    float doorCol = step(0.40, cfx) * step(cfx, 0.60);
    win = win + doorCol * step(v, 2.1) * step(0.35, v) * (1.0 - step(0.5, row));
  }
  float wn = hash12(vec2(floor(bx), row * 7.0 + floor(seed * 13.0)));
  float litOn = step(0.38, wn);
  float flick = 0.78 + 0.22 * sin(uTime * 2.6 + wn * 40.0 + seed * 9.0);
  vec3 glassDay = vec3(0.10, 0.12, 0.14);
  vec3 warm = vec3(1.0, 0.72, 0.38);
  vec3 winCol2 = mix(glassDay, warm * (0.9 + 0.5 * flick), litOn * uNight);
  float emissive = win * litOn * uNight * (0.85 + 0.45 * flick);

  col = mix(col, winCol2, win);
  return vec4(col, emissive);
}

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 lit = uAmbient + uSunColor * ndl;

  vec3 an = abs(vNormalL);
  float u = an.z > 0.5 ? vLocal.x : vLocal.z;
  float v = vLocal.y;
  bool frontZ = vNormalL.z > 0.7;

  vec3 col;
  float emissive = 0.0;
  float type = vType;

  if (type < 0.5 || (type > 0.5 && type < 1.5)) {
    // T_HOUSE (0) / T_WALL (1) -> fachwerk for house; stone wall separate below
    if (type < 0.5) {
      vec4 fw = fachwerk(u, v, vSeed, frontZ);
      col = fw.rgb;
      emissive = fw.a;
    } else {
      vec2 cell = floor(vec2(u / 1.7, v / 0.85));
      float h = hash12(cell * 0.37 + vSeed);
      float edge = min(min(fract(u / 1.7), 1.0 - fract(u / 1.7)), min(fract(v / 0.85), 1.0 - fract(v / 0.85)));
      vec3 stone = mix(vec3(0.50, 0.48, 0.44), vec3(0.60, 0.58, 0.52), h);
      stone *= 1.0 - smoothstep(0.07, 0.02, edge) * 0.42;
      col = stone;
      if (v > vSize.y - 1.0) col *= 0.85; // top band
    }
  } else if (type < 2.5) {
    // T_TOWER (2): stone + narrow slits
    vec2 cell = floor(vec2(u / 1.5, v / 0.8));
    float h = hash12(cell * 0.61 + vSeed);
    float edge = min(min(fract(u / 1.5), 1.0 - fract(u / 1.5)), min(fract(v / 0.8), 1.0 - fract(v / 0.8)));
    vec3 stone = mix(vec3(0.52, 0.50, 0.46), vec3(0.62, 0.60, 0.55), h);
    stone *= 1.0 - smoothstep(0.07, 0.02, edge) * 0.42;
    col = stone;
    float slitU = step(0.47, fract(u / 3.4)) * step(fract(u / 3.4), 0.53);
    float slitV = step(0.3, fract(v / 4.2)) * step(fract(v / 4.2), 0.62) * step(3.0, v);
    float slit = slitU * slitV;
    col = mix(col, vec3(0.05, 0.05, 0.06), slit);
  } else if (type < 3.5) {
    // T_TEMPLE (3): white stone, arched glowing windows
    col = vec3(0.87, 0.85, 0.79);
    float cm = hash12(floor(vec2(u, v) * 0.8) + vSeed);
    col *= 0.94 + 0.10 * cm;
    float cx = fract(u / 3.4) - 0.5;
    float dx = abs(cx) / 0.28;
    float rect = step(4.5, v) * step(v, 8.2) * step(dx, 0.85);
    vec2 q = vec2(dx, v - 8.2);
    float arch = step(length(q), 0.85) * step(8.2, v) * step(v, 9.4);
    float win = clamp(rect + arch, 0.0, 1.0);
    // front door
    float door = 0.0;
    if (frontZ) {
      door = step(abs(u), 1.7) * step(v, 4.6) * step(0.2, v);
    }
    col = mix(col, vec3(0.10, 0.09, 0.08), door);
    float flick = 0.8 + 0.2 * sin(uTime * 2.2 + vSeed * 5.0);
    float glow = win * (0.35 + 0.65 * uNight) * flick;
    col = mix(col, vec3(1.0, 0.78, 0.42), win * glow * 0.85);
    emissive = win * glow * 0.9;
    // cornice
    if (v > vSize.y - 0.8) col *= 0.9;
  } else if (type < 4.5) {
    // T_WOOD (4): planks
    float row = floor(v / 0.5);
    float fr = fract(v / 0.5);
    float h = hash12(vec2(row, floor(u / 0.9) + vSeed));
    col = mix(vec3(0.44, 0.31, 0.18), vec3(0.35, 0.24, 0.13), h);
    col *= 1.0 - smoothstep(0.86, 1.0, fr) * 0.5;
    col *= 0.9 + 0.2 * hash12(vec2(floor(u / 0.35), row));
  } else if (type < 5.5) {
    // T_WARE (5): dark timber warehouse
    float row = floor(v / 0.6);
    float fr = fract(v / 0.6);
    float h = hash12(vec2(row, floor(u / 1.1) + vSeed));
    col = mix(vec3(0.36, 0.26, 0.16), vec3(0.28, 0.19, 0.11), h);
    col *= 1.0 - smoothstep(0.88, 1.0, fr) * 0.45;
    // small high windows
    float wu = step(0.35, fract(u / 2.6)) * step(fract(u / 2.6), 0.65);
    float wv = step(0.55, fract(v / 3.4)) * step(fract(v / 3.4), 0.78) * step(3.5, v);
    float win = wu * wv;
    float wn = hash12(vec2(floor(u / 2.6), row + vSeed));
    emissive = win * step(0.5, wn) * uNight * 0.8;
    col = mix(col, vec3(1.0, 0.7, 0.35) * (0.8 + 0.4 * uNight), win * step(0.5, wn) * uNight * 0.7);
  } else if (type < 6.5) {
    // T_AWNING (6): striped canopy
    float h = hash12(vec2(vSeed, 8.1));
    vec3 a = vec3(0.72, 0.20, 0.15);
    if (h > 0.25) a = vec3(0.28, 0.48, 0.24);
    if (h > 0.5) a = vec3(0.82, 0.62, 0.18);
    if (h > 0.75) a = vec3(0.20, 0.46, 0.46);
    float s = fract(u / 0.55);
    col = mix(a, vec3(0.92, 0.88, 0.78), step(0.5, s));
  } else if (type < 7.5) {
    // T_SAIL (7): cream cloth
    col = vec3(0.88, 0.84, 0.73);
    col *= 0.85 + 0.15 * sin(vLocal.y * 1.8 + vSeed * 7.0) * sin(vLocal.x * 2.2);
  } else if (type < 8.5) {
    // T_STONE (8): light plain stone
    col = vec3(0.80, 0.78, 0.72);
    float cm = hash12(floor(vec2(u, v) * 1.4) + vSeed);
    col *= 0.93 + 0.12 * cm;
  } else if (type < 9.5) {
    // T_QUAY (9): dark wet stone with algae
    col = vec3(0.30, 0.31, 0.29);
    float cm = hash12(floor(vec2(u, v) * 1.2) + vSeed);
    col *= 0.9 + 0.18 * cm;
    col = mix(col, vec3(0.22, 0.30, 0.20), smoothstep(1.6, 0.2, v) * 0.5);
  } else if (type < 10.5) {
    // T_ROCK (10)
    col = vec3(0.36, 0.36, 0.35);
    float cm = hash12(floor(vec2(u, v) * 2.0) + vSeed);
    col *= 0.85 + 0.3 * cm;
  } else if (type < 11.5) {
    // T_ANVIL (11): тёмное железо
    col = vec3(0.13, 0.13, 0.15);
    float cm = hash12(floor(vec2(u, v) * 3.0) + vSeed);
    col *= 0.85 + 0.3 * cm;
    col += vec3(0.25, 0.22, 0.18) * smoothstep(0.8, 1.0, v / max(vSize.y, 0.01));
  } else {
    // fallback wood
    col = vec3(0.40, 0.29, 0.17);
  }

  // base ambient occlusion
  col *= 0.72 + 0.28 * clamp(v / 2.6, 0.0, 1.0);

  col *= lit;
  col += vec3(1.0, 0.72, 0.38) * emissive * 1.5;

  float d = length(vWorld - uCamPos);
  float f = 1.0 - exp(-d * d * uFogDensity * uFogDensity);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}
`;

/* ================= ROOF PRISM ================= */

export const ROOF_VS = BOX_VS;

export const ROOF_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vNormalL;
in vec3 vLocal;
in vec3 vSize;
flat in float vType;
flat in float vSeed;
out vec4 fragColor;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;
uniform float uNight;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 plasterColor(float seed) {
  float h = hash12(vec2(seed, 3.7));
  vec3 a = vec3(0.82, 0.75, 0.60);
  vec3 b = vec3(0.76, 0.66, 0.52);
  vec3 c = vec3(0.84, 0.79, 0.68);
  vec3 d = vec3(0.70, 0.60, 0.47);
  if (h < 0.25) return a;
  if (h < 0.5) return b;
  if (h < 0.75) return c;
  return d;
}

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 lit = uAmbient + uSunColor * ndl;

  vec3 col;
  vec3 an = abs(vNormalL);
  if (an.z > 0.5) {
    // gable = plaster + timber
    float u = vLocal.x;
    float v = vLocal.y + vSize.y * 0.5;
    vec3 plaster = plasterColor(vSeed);
    col = plaster;
    float bx = u / 2.3;
    float beamV = 1.0 - smoothstep(0.055, 0.095, min(fract(bx), 1.0 - fract(bx)));
    float brace = (1.0 - smoothstep(0.06, 0.11, abs(abs(fract(bx) - 0.5) - (v / max(vSize.y, 0.001) - 0.5)))) * 0.5;
    col = mix(col, vec3(0.24, 0.16, 0.10), clamp(beamV + brace, 0.0, 1.0) * 0.9);
  } else {
    // shingles
    float h = hash12(vec2(vSeed, 1.3));
    vec3 a = vec3(0.40, 0.21, 0.15);   // dark red
    vec3 b = vec3(0.30, 0.31, 0.34);   // slate
    vec3 c = vec3(0.34, 0.25, 0.16);   // brown
    vec3 d = vec3(0.33, 0.44, 0.38);   // patina copper
    col = a;
    if (h > 0.25) col = b;
    if (h > 0.5) col = c;
    if (h > 0.78) col = d;
    float row = fract(vWorld.y * 1.1 + h * 9.0);
    col *= 1.0 - smoothstep(0.82, 1.0, row) * 0.35;
    float offs = hash12(floor(vec2(vWorld.x * 0.8 + vWorld.z * 0.6, vWorld.y * 1.1)));
    col *= 0.88 + 0.24 * offs;
  }

  col *= lit;
  float d = length(vWorld - uCamPos);
  float f = 1.0 - exp(-d * d * uFogDensity * uFogDensity);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}
`;

/* ================= CYLINDERS ================= */

export const CYL_VS = BOX_VS;

export const CYL_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vNormalL;
in vec3 vLocal;
in vec3 vSize;
flat in float vType;
flat in float vSeed;
out vec4 fragColor;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;
uniform float uNight;
uniform float uTime;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 lit = uAmbient + uSunColor * ndl;

  float u = atan(vLocal.x, vLocal.z) * 1.6;
  float v = vLocal.y;
  vec3 col;
  float emissive = 0.0;
  float type = vType;

  if (type < 1.5 || (type > 1.5 && type < 2.5)) {
    // stone tower / stone
    vec2 cell = floor(vec2(u / 0.9, v / 0.8));
    float h = hash12(cell * 0.71 + vSeed);
    col = mix(vec3(0.52, 0.50, 0.46), vec3(0.62, 0.60, 0.55), h);
  } else if (type < 3.5) {
    // temple stone
    col = vec3(0.87, 0.85, 0.79);
    col *= 0.94 + 0.10 * hash12(floor(vec2(u, v) * 1.1) + vSeed);
  } else if (type < 4.5) {
    // wood
    float row = floor(v / 0.4);
    col = mix(vec3(0.42, 0.30, 0.17), vec3(0.34, 0.23, 0.13), hash12(vec2(row, floor(u * 2.0) + vSeed)));
  } else if (type < 5.5) {
    // trunk
    col = mix(vec3(0.30, 0.22, 0.13), vec3(0.24, 0.17, 0.10), hash12(vec2(floor(u * 3.0), floor(v * 2.0))));
  } else if (type < 6.5) {
    // barrel: staves + hoops
    float stave = fract(u / 0.5);
    col = mix(vec3(0.40, 0.27, 0.15), vec3(0.32, 0.21, 0.11), step(0.5, stave));
    float hoop = 1.0 - smoothstep(0.03, 0.06, min(fract(v / 0.3), 1.0 - fract(v / 0.3)));
    col = mix(col, vec3(0.18, 0.16, 0.14), hoop * step(0.1, v) * step(v, 0.9));
  } else if (type < 7.5) {
    // quay dark stone
    col = vec3(0.30, 0.31, 0.29) * (0.9 + 0.18 * hash12(floor(vec2(u, v) * 1.4)));
  } else if (type < 8.5) {
    // rock
    col = vec3(0.36, 0.36, 0.35) * (0.85 + 0.3 * hash12(floor(vec2(u, v) * 2.4)));
  } else if (type < 9.5) {
    // fountain water disc: animated glow-ish
    float n = hash12(floor(vec2(u * 6.0 + uTime * 0.7, v * 8.0 - uTime)));
    col = mix(vec3(0.10, 0.22, 0.22), vec3(0.30, 0.45, 0.44), n);
    emissive = 0.12;
  } else {
    col = vec3(0.5);
  }

  col *= lit;
  col += vec3(0.5, 0.75, 0.75) * emissive;

  float d = length(vWorld - uCamPos);
  float f = 1.0 - exp(-d * d * uFogDensity * uFogDensity);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}
`;

/* ================= CONES ================= */

export const CONE_VS = BOX_VS;

export const CONE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vNormalL;
in vec3 vLocal;
in vec3 vSize;
flat in float vType;
flat in float vSeed;
out vec4 fragColor;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;
uniform float uNight;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 lit = uAmbient + uSunColor * ndl;

  vec3 col;
  float type = vType;
  if (type < 0.5) {
    // roof cone (towers): shingle palette
    float h = hash12(vec2(vSeed, 1.3));
    col = vec3(0.40, 0.21, 0.15);
    if (h > 0.3) col = vec3(0.30, 0.31, 0.34);
    if (h > 0.6) col = vec3(0.33, 0.44, 0.38);
    float row = fract(vWorld.y * 1.3);
    col *= 1.0 - smoothstep(0.8, 1.0, row) * 0.3;
  } else if (type < 1.5) {
    // foliage
    float n = hash12(floor(vec2(vWorld.x * 1.5, vWorld.y * 1.5 + vWorld.z)) + vSeed);
    col = mix(vec3(0.14, 0.25, 0.11), vec3(0.23, 0.36, 0.15), n);
  } else if (type < 2.5) {
    // temple spire: copper patina
    col = vec3(0.35, 0.47, 0.40);
    col *= 0.9 + 0.16 * hash12(floor(vec2(vLocal.x * 2.0, vLocal.y * 2.0)));
  } else {
    col = vec3(0.3);
  }

  col *= lit;
  float d = length(vWorld - uCamPos);
  float f = 1.0 - exp(-d * d * uFogDensity * uFogDensity);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}
`;

/* ================= CITIZENS ================= */

export const CITIZEN_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;      // x,z in [-0.5,0.5], y in [0,1]
layout(location=1) in vec3 aNormal;
uniform mat4 uVP;
uniform sampler2D uS0;
uniform sampler2D uS1;
uniform sampler2D uT;
uniform sampler2D uC;
uniform int uTexW;
uniform vec3 uPalette[14];
uniform float uTime;
out vec3 vColor;
out vec3 vWorld;
out vec3 vNormal;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 rotXp(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

void main() {
  int inst = gl_InstanceID;
  int part = inst - (inst / 6) * 6;
  int ci = inst / 6;
  ivec2 tc = ivec2(ci % uTexW, ci / uTexW);
  vec4 s0 = texelFetch(uS0, tc, 0);
  vec4 s1 = texelFetch(uS1, tc, 0);
  vec4 td = texelFetch(uT, tc, 0);
  vec4 c = texelFetch(uC, tc, 0);

  vec2 pos = s0.xy;
  vec2 vel = s0.zw;
  float phase = s1.y;
  float state = s1.z;
  float spd = length(vel);
  float prof = floor(c.a * 255.0 + 0.5);
  float seed = c.b;

  // HOME -> невидим
  float vis = state > 2.5 && state < 3.5 ? 0.0 : 1.0;

  float wa = clamp(spd / 1.1, 0.0, 1.0);
  float h = (0.85 + c.g * 0.30) * (1.0 + step(0.5, prof) * step(prof, 1.5) * 0.13) * vis;
  float carry = state > 3.5 && state < 4.5 ? 1.0 : 0.0;
  bool smithWork = prof > 2.5 && prof < 3.5 && state > 1.5 && state < 2.5;
  bool courtWork = prof > 4.5 && prof < 5.5 && state > 1.5 && state < 2.5;
  bool merchWork = prof > 1.5 && prof < 2.5 && state > 1.5 && state < 2.5;
  bool hooded = (prof > 5.5 && prof < 6.5) || (prof > 6.5 && prof < 7.5);

  float ang = td.x;
  float cA = cos(ang), sA = sin(ang);

  float swing = sin(phase) * 0.55 * wa;
  float bob = abs(sin(phase)) * 0.05 * wa + carry * abs(sin(phase * 1.8)) * 0.03;
  float lean = carry * 0.22 + (smithWork ? 0.10 : 0.0);
  float sway = courtWork ? sin(uTime * 1.7 + seed * 13.0) * 0.05 : (merchWork ? sin(uTime * 1.1 + seed * 9.0) * 0.02 : 0.0);

  vec3 pc;    // центр части (локально, до rotY)
  vec3 sc;    // размер части
  float partRot = 0.0;

  if (part == 0 || part == 1) {
    float sgn = part == 0 ? 1.0 : -1.0;
    float cs = cos(swing * sgn), ss = sin(swing * sgn);
    pc = vec3(0.11 * sgn, 0.86 - 0.42 * cs, 0.42 * ss);
    sc = vec3(0.15, 0.84, 0.18);
  } else if (part == 2) {
    // торс / плащ
    if (prof > 5.5 && prof < 6.5) sc = vec3(0.60, 0.72, 0.44);
    else if (prof > 6.5) sc = vec3(0.54, 0.68, 0.40);
    else sc = vec3(0.50, 0.64, 0.30);
    vec3 raw = vec3(0.0, 0.86, 0.0);
    pc = rotXp(raw, lean);
    partRot = lean;
  } else if (part == 3) {
    // голова
    vec3 raw = vec3(0.0, 1.50, 0.02);
    pc = rotXp(raw, lean);
    pc.x += sway;
    sc = vec3(0.26, 0.26, 0.25);
    if (hooded) sc = vec3(0.22, 0.22, 0.21);
    partRot = lean;
  } else if (part == 4) {
    // молот кузнеца
    if (smithWork) {
      float a = -0.5 + sin(uTime * 7.0 + seed * 11.0) * 0.9;
      vec3 pivot = vec3(0.30, 1.18, 0.10);
      vec3 rel = rotXp(vec3(0.0, 0.30, 0.0), a);
      pc = pivot + rel;
      partRot = a;
      sc = vec3(0.10, 0.55, 0.10);
    } else { sc = vec3(0.0); }
  } else {
    // юбка куртизанки / капюшон
    if (prof > 4.5 && prof < 5.5) {
      pc = vec3(sway, 0.48, 0.0);
      sc = vec3(0.52, 0.60, 0.42);
    } else if (hooded) {
      vec3 raw = vec3(0.0, 1.56, 0.0);
      pc = rotXp(raw, lean);
      sc = vec3(0.30, 0.32, 0.32);
      partRot = lean;
    } else { sc = vec3(0.0); }
  }

  // поворот части вокруг X (для наклонов/молота) вокруг центра части
  vec3 localC = vec3(pc.x * h, pc.y * h + bob, pc.z * h);
  vec3 lp = rotXp(vec3(aPos.x * sc.x, aPos.y * sc.y, aPos.z * sc.z) * h, partRot) + localC;
  vec3 nrm = rotXp(aNormal, partRot);
  vec3 world = vec3(pos.x + cA * lp.x + sA * lp.z, lp.y, pos.y - sA * lp.x + cA * lp.z);

  // ---- цвет по профессии ----
  float hs = hash12(vec2(seed, seed * 7.0 + 3.0));
  float vr = 0.82 + 0.36 * hash12(vec2(seed, seed * 3.0 + 1.0));
  int pal = int(floor(c.r * 13.99));
  vec3 cloth;
  if (prof < 0.5) cloth = uPalette[pal] * vr;
  else if (prof < 1.5) cloth = vec3(0.50, 0.13, 0.10) * (0.85 + 0.3 * hs);
  else if (prof < 2.5) {
    if (hs < 0.34) cloth = vec3(0.33, 0.18, 0.36);
    else if (hs < 0.67) cloth = vec3(0.14, 0.31, 0.20);
    else cloth = vec3(0.52, 0.15, 0.15);
    cloth *= vr;
  }
  else if (prof < 3.5) cloth = vec3(0.34, 0.25, 0.16) * vr;
  else if (prof < 4.5) cloth = vec3(0.37, 0.34, 0.28) * (0.75 + 0.5 * hs);
  else if (prof < 5.5) {
    if (hs < 0.4) cloth = vec3(0.70, 0.13, 0.28);
    else if (hs < 0.75) cloth = vec3(0.10, 0.40, 0.40);
    else cloth = vec3(0.75, 0.34, 0.42);
    cloth *= 0.9 + 0.25 * hs;
  }
  else if (prof < 6.5) cloth = vec3(0.09, 0.09, 0.11) * (0.8 + 0.4 * hs);
  else cloth = vec3(0.23, 0.18, 0.12) * (0.8 + 0.4 * hs);

  vec3 skin = vec3(0.78, 0.62, 0.48) * (0.85 + 0.3 * hash12(vec2(seed * 3.0, 1.0)));
  vec3 steel = vec3(0.28, 0.29, 0.31);

  if (part == 4) vColor = vec3(0.14, 0.14, 0.16);                 // молот
  else if (part == 5) {
    if (prof > 4.5 && prof < 5.5) vColor = cloth;
    else if (prof > 5.5 && prof < 6.5) vColor = vec3(0.07, 0.07, 0.09);
    else vColor = vec3(0.16, 0.12, 0.09);
  }
  else if (part == 3) {
    if (prof > 0.5 && prof < 1.5) vColor = steel;                 // шлем стражника
    else if (hooded) vColor = vec3(0.10, 0.09, 0.08);
    else vColor = skin;
  }
  else if (part == 2) {
    if (prof > 0.5 && prof < 1.5) vColor = mix(cloth, steel, 0.35);
    else vColor = cloth;
  }
  else vColor = cloth * 0.62;                                     // ноги

  vNormal = vec3(cA * nrm.x + sA * nrm.z, nrm.y, -sA * nrm.x + cA * nrm.z);
  vWorld = world;
  gl_Position = uVP * vec4(world, 1.0);
}
`;

export const CITIZEN_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vColor;
in vec3 vWorld;
in vec3 vNormal;
out vec4 fragColor;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 col = vColor * (uAmbient * 1.1 + uSunColor * ndl * 0.95);
  float d = length(vWorld - uCamPos);
  float f = 1.0 - exp(-d * d * uFogDensity * uFogDensity);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}
`;

/* ================= SHADOWS ================= */

/** box shadows: весь куб проецируется на землю вдоль светового луча (силуэт-коробка) */
export const SHADOW_BOX_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;      // cube geometry
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aI0;       // pos.xyz, rotY
layout(location=3) in vec4 aI1;       // size.xyz, seed
layout(location=4) in vec4 aI2;       // type, bobAmp
uniform mat4 uVP;
uniform vec3 uSunDir;
void main() {
  vec3 local = vec3(aPos.x * aI1.x, aPos.y * aI1.y, aPos.z * aI1.z);
  float c = cos(aI0.w);
  float s = sin(aI0.w);
  mat3 R = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  vec3 world = R * local + aI0.xyz;
  // project onto ground along light direction (uSunDir points TO the sun)
  float ly = max(uSunDir.y, 0.06);
  vec3 ground = vec3(world.x - uSunDir.x * (world.y / ly), 0.03, world.z - uSunDir.z * (world.y / ly));
  gl_Position = uVP * vec4(ground, 1.0);
}
`;

export const SHADOW_BOX_FS = /* glsl */ `#version 300 es
precision highp float;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.01, 0.01, 0.02, uAlpha);
}
`;

/** blob shadows under citizens: instance id = citizen index, state fetched on GPU */
export const SHADOW_BLOB_VS = /* glsl */ `#version 300 es
layout(location=0) in vec2 aPos;
uniform mat4 uVP;
uniform sampler2D uS0;
uniform sampler2D uS1;
uniform sampler2D uT;
uniform int uTexW;
uniform vec3 uSunDir;
out vec2 vQ;
void main() {
  int ci = gl_InstanceID;
  ivec2 tc = ivec2(ci % uTexW, ci / uTexW);
  vec4 s0 = texelFetch(uS0, tc, 0);
  float state = texelFetch(uS1, tc, 0).z;
  float vis = state > 2.5 && state < 3.5 ? 0.0 : 1.0;
  vec2 q = aPos * vis;
  vec2 off = uSunDir.xz * (0.9 / max(-uSunDir.y, 0.2));
  vec2 c = s0.xy + off;
  vec3 world = vec3(c.x + q.x * 0.85, 0.04, c.y + q.y * 0.85);
  vQ = q;
  gl_Position = uVP * vec4(world, 1.0);
}
`;

export const SHADOW_BLOB_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vQ;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  float r = length(vQ) * 2.0;
  float a = (1.0 - smoothstep(0.6, 1.0, r)) * uAlpha;
  fragColor = vec4(0.01, 0.01, 0.02, a);
}
`;

/* ================= SPRITES (flames, glows, pools, gulls) ================= */

export const SPRITE_VS = /* glsl */ `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=2) in vec4 aI0;   // pos.xyz, type
layout(location=3) in vec4 aI1;   // size, seed, 0, 0
uniform mat4 uVP;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uTime;
out vec2 vQ;
flat out float vType;
flat out float vSeed;
void main() {
  float type = aI0.w;
  float size = aI1.x;
  float seed = aI1.y;
  vec3 center = aI0.xyz;
  vec3 world;
  vQ = aPos;
  if (type > 1.5 && type < 2.5) {
    // light pool on ground
    world = center + vec3(aPos.x * size, 0.0, aPos.y * size);
  } else if (type > 2.5 && type < 3.5) {
    // seagull: circle flight around center
    float t = uTime * (0.22 + 0.16 * fract(seed * 7.31)) + seed * 6.2831;
    float r = size;
    vec3 p = vec3(center.x + cos(t) * r, center.y + sin(t * 1.7) * 2.5, center.z + sin(t) * r);
    vec3 fwd = normalize(vec3(-sin(t), 0.0, cos(t)));
    vec3 right = vec3(fwd.z, 0.0, -fwd.x);
    float flap = sin(uTime * 9.0 + seed * 20.0);
    world = p + right * (aPos.x * size * 0.045)
              + vec3(0.0, 1.0, 0.0) * ((aPos.y + abs(aPos.x) * flap * 0.8) * size * 0.02);
  } else {
    // billboard (flames, glows)
    vec3 c = center;
    if (type < 0.5 || (type > 3.5 && type < 4.5)) {
      c.x += sin(uTime * 11.0 + seed * 31.0) * 0.07 * size;
      c.z += cos(uTime * 9.0 + seed * 17.0) * 0.05 * size;
    }
    world = c + uCamRight * (aPos.x * size) + uCamUp * (aPos.y * size);
  }
  vType = type;
  vSeed = seed;
  gl_Position = uVP * vec4(world, 1.0);
}
`;

export const SPRITE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vQ;
flat in float vType;
flat in float vSeed;
out vec4 fragColor;

uniform float uNight;
uniform float uTime;
uniform int uPass;   // 0 = alpha (flames, gulls), 1 = additive (glows, pools)

void main() {
  bool additive = (vType > 0.5 && vType < 2.5) || (vType > 4.5 && vType < 6.5);
  if (uPass == 0 && additive) discard;
  if (uPass == 1 && !additive) discard;

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (vType < 0.5) {
    // torch flame: вытянутый teardrop
    vec2 q = vQ;
    q.y += 0.38;
    float wob = sin(uTime * 9.0 + vSeed * 40.0 + q.y * 9.0) * 0.09 * (q.y + 0.55);
    float ys = q.y > 0.0 ? q.y * 0.72 : q.y * 1.55;
    float r = length(vec2((q.x + wob) * 2.5, ys));
    float core = 1.0 - smoothstep(0.18, 0.58, r);
    alpha = core * (0.85 + 0.15 * sin(uTime * 17.0 + vSeed * 50.0));
    col = mix(vec3(1.0, 0.42, 0.05), vec3(1.0, 0.88, 0.4), smoothstep(0.42, 0.08, r));
  } else if (vType < 1.5) {
    // torch glow
    float r = length(vQ) * 2.0;
    alpha = pow(max(1.0 - r, 0.0), 2.4) * uNight * 0.75;
    col = vec3(1.0, 0.55, 0.18);
  } else if (vType < 2.5) {
    // ground light pool
    float r = length(vQ) * 2.0;
    alpha = pow(max(1.0 - r, 0.0), 2.0) * uNight * 0.5;
    col = vec3(1.0, 0.6, 0.25);
  } else if (vType < 3.5) {
    // seagull
    float wing = 1.0 - abs(vQ.y) / (0.30 + (1.0 - abs(vQ.x)) * 0.25);
    alpha = smoothstep(0.0, 0.25, wing) * step(abs(vQ.x), 0.98);
    col = mix(vec3(0.88, 0.88, 0.9), vec3(0.6, 0.62, 0.66), abs(vQ.x));
  } else if (vType < 4.5) {
    // eternal flame (big teardrop)
    vec2 q = vQ;
    q.y += 0.36;
    float wob = sin(uTime * 6.0 + q.y * 5.0) * 0.10 * (q.y + 0.55);
    float ys = q.y > 0.0 ? q.y * 0.62 : q.y * 1.5;
    float r = length(vec2((q.x + wob) * 2.2, ys));
    float core = 1.0 - smoothstep(0.15, 0.55, r);
    alpha = core;
    col = mix(vec3(1.0, 0.35, 0.02), vec3(1.0, 0.9, 0.5), smoothstep(0.38, 0.05, r));
    alpha *= 0.92 + 0.08 * sin(uTime * 13.0);
  } else if (vType < 5.5) {
    // eternal glow
    float r = length(vQ) * 2.0;
    alpha = pow(max(1.0 - r, 0.0), 3.0) * (0.25 + 0.5 * uNight);
    col = vec3(1.0, 0.5, 0.15);
  } else {
    // lighthouse glow
    float r = length(vQ) * 2.0;
    alpha = pow(max(1.0 - r, 0.0), 2.0) * (0.3 + 0.5 * uNight);
    col = vec3(1.0, 0.8, 0.45);
  }

  if (alpha < 0.004) discard;
  fragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

/* ================= POST ================= */

export const POST_VS = SIM_VS;

export const POST_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uTime;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = gl_FragCoord.xy * uTexel; // fullscreen: note origin flip not needed since we draw 1:1
  vec3 c = texture(uScene, uv).rgb;

  // cheap AA: blend with diagonal neighborhood
  vec3 n1 = texture(uScene, uv + uTexel * vec2(0.75, 0.75)).rgb;
  vec3 n2 = texture(uScene, uv + uTexel * vec2(-0.75, 0.75)).rgb;
  vec3 n3 = texture(uScene, uv + uTexel * vec2(0.75, -0.75)).rgb;
  vec3 n4 = texture(uScene, uv + uTexel * vec2(-0.75, -0.75)).rgb;
  vec3 blur = (n1 + n2 + n3 + n4) * 0.25;
  float lc = dot(c, vec3(0.333));
  float lb = dot(blur, vec3(0.333));
  float edge = smoothstep(0.04, 0.18, abs(lc - lb));
  c = mix(c, blur, edge * 0.55);

  // warm grade + contrast
  c = (c - 0.5) * 1.05 + 0.5;
  c *= vec3(1.04, 1.0, 0.95);

  // vignette
  vec2 p = uv - 0.5;
  float vig = 1.0 - 0.42 * smoothstep(0.35, 0.75, length(p));
  c *= vig;

  // grain
  c += (hash12(uv * 931.0 + fract(uTime) * 7.0) - 0.5) * 0.028;

  fragColor = vec4(c, 1.0);
}
`;
