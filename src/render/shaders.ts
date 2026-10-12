// Shaders de fragmento (GLSL ES 3.00). Todas las texturas están en alfa premultiplicado.

const HEAD = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
out vec4 o;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 unp(vec4 s){ return s.a > 0.0001 ? s.rgb / s.a : vec3(0.0); }
`;

export const FS_COPY = HEAD + `
uniform sampler2D uTex; uniform float uOpacity;
void main(){ o = texture(uTex, vUv) * uOpacity; }`;

export const FS_PRESENT = HEAD + `
uniform sampler2D uTex;
void main(){ vec4 c = texture(uTex, vec2(vUv.x, 1.0 - vUv.y)); o = vec4(c.rgb, 1.0); }`;

export const FS_SOLID = HEAD + `
uniform vec4 uColor; uniform vec4 uColor2; uniform float uAngle; uniform float uGradient;
void main(){
  if (uGradient > 0.5) {
    vec2 d = vec2(cos(radians(uAngle)), sin(radians(uAngle)));
    float t = clamp(dot(vUv - 0.5, d) + 0.5, 0.0, 1.0);
    vec4 c = mix(uColor, uColor2, t);
    o = vec4(c.rgb * c.a, c.a);
  } else o = vec4(uColor.rgb * uColor.a, uColor.a);
}`;

export const FS_GRADE = HEAD + `
uniform sampler2D uTex; uniform sampler2D uCurves; uniform sampler3D uLut;
uniform vec2 uTexel;
uniform float uExposure, uContrast, uHighlights, uShadows, uWhites, uBlacks, uSaturation, uVibrance;
uniform float uTemp, uTint, uHue, uFade, uVignette, uMono, uSepia, uSplitAmount, uSharpen;
uniform vec3 uLift, uGamma, uGain, uSplitShadow, uSplitHighlight;
uniform float uUseCurves, uLutAmount, uLutSize;
vec3 hueShift(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
void main(){
  vec4 s = texture(uTex, vUv);
  if (s.a <= 0.0001) { o = vec4(0.0); return; }
  vec3 c = s.rgb / s.a;
  if (uSharpen > 0.0) {
    vec3 n = unp(texture(uTex, vUv + vec2(uTexel.x, 0.0))) + unp(texture(uTex, vUv - vec2(uTexel.x, 0.0)))
           + unp(texture(uTex, vUv + vec2(0.0, uTexel.y))) + unp(texture(uTex, vUv - vec2(0.0, uTexel.y)));
    c = c + (c - n * 0.25) * uSharpen * 2.0;
  }
  c *= exp2(uExposure);
  c *= vec3(1.0 + uTemp * 0.22 + uTint * 0.06, 1.0 - uTint * 0.18, 1.0 - uTemp * 0.22 + uTint * 0.06);
  vec3 gain = 1.0 + uGain * 1.5;
  c = c * gain + uLift * 0.6 * (1.0 - c);
  c = pow(max(c, vec3(0.0)), 1.0 / max(vec3(0.05), 1.0 + uGamma * 1.6));
  c = (c - 0.5) * (1.0 + uContrast) + 0.5;
  float l = luma(c);
  float sh = 1.0 - smoothstep(0.0, 0.55, l);
  float hi = smoothstep(0.45, 1.0, l);
  c += uShadows * sh * 0.4;
  c += uHighlights * hi * 0.4;
  float bp = -uBlacks * 0.12;
  float wp = 1.0 - uWhites * 0.22;
  c = (c - bp) / max(wp - bp, 0.05);
  l = luma(c);
  c = mix(vec3(l), c, 1.0 + uSaturation);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  c = mix(vec3(l), c, 1.0 + uVibrance * (1.0 - clamp(mx - mn, 0.0, 1.0)));
  if (abs(uHue) > 0.01) c = hueShift(c, radians(uHue));
  if (uSplitAmount > 0.0) {
    float ll = clamp(luma(c), 0.0, 1.0);
    vec3 ts = uSplitShadow - luma(uSplitShadow);
    vec3 th = uSplitHighlight - luma(uSplitHighlight);
    c += ts * uSplitAmount * (1.0 - ll) * 0.9 + th * uSplitAmount * ll * 0.9;
  }
  c = mix(c, c * 0.82 + 0.12, uFade);
  c = mix(c, vec3(luma(c)), uMono);
  if (uSepia > 0.0) {
    vec3 sp = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
    c = mix(c, sp, uSepia);
  }
  c = clamp(c, 0.0, 1.0);
  if (uUseCurves > 0.5) {
    c = vec3(texture(uCurves, vec2(c.r, 0.125)).r, texture(uCurves, vec2(c.g, 0.125)).r, texture(uCurves, vec2(c.b, 0.125)).r);
    c = vec3(texture(uCurves, vec2(c.r, 0.375)).r, texture(uCurves, vec2(c.g, 0.625)).r, texture(uCurves, vec2(c.b, 0.875)).r);
  }
  if (uLutAmount > 0.0) {
    vec3 lc = texture(uLut, c * (uLutSize - 1.0) / uLutSize + 0.5 / uLutSize).rgb;
    c = mix(c, lc, uLutAmount);
  }
  if (abs(uVignette) > 0.001) {
    vec2 d = vUv - 0.5;
    float v = smoothstep(0.85, 0.25, length(d) * 1.25);
    if (uVignette > 0.0) c *= mix(1.0, v, uVignette);
    else c = mix(c, vec3(1.0), (1.0 - v) * -uVignette);
  }
  o = vec4(clamp(c, 0.0, 1.0) * s.a, s.a);
}`;

export const FS_BLUR = HEAD + `
uniform sampler2D uTex; uniform vec2 uDir; uniform float uRadius;
void main(){
  float sigma = max(uRadius / 2.5, 0.001);
  vec4 sum = vec4(0.0); float ws = 0.0;
  float stepv = uRadius / 12.0;
  for (int i = -12; i <= 12; i++) {
    float x = float(i) * stepv;
    float w = exp(-x * x / (2.0 * sigma * sigma));
    sum += texture(uTex, vUv + uDir * x) * w;
    ws += w;
  }
  o = sum / ws;
}`;

export const FS_DIRBLUR = HEAD + `
uniform sampler2D uTex; uniform vec2 uDir; uniform float uAmount;
void main(){
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 32; i++) { float t = float(i) / 31.0 - 0.5; sum += texture(uTex, vUv + uDir * t * uAmount); }
  o = sum / 32.0;
}`;

export const FS_ZOOMBLUR = HEAD + `
uniform sampler2D uTex; uniform vec2 uCenter; uniform float uAmount;
void main(){
  vec4 sum = vec4(0.0);
  vec2 d = vUv - uCenter;
  for (int i = 0; i < 32; i++) { float t = 1.0 - uAmount * float(i) / 31.0; sum += texture(uTex, uCenter + d * t); }
  o = sum / 32.0;
}`;

export const FS_UNSHARP = HEAD + `
uniform sampler2D uTex; uniform sampler2D uBlur; uniform float uAmount;
void main(){
  vec4 s = texture(uTex, vUv); vec4 b = texture(uBlur, vUv);
  vec3 c = unp(s); vec3 bc = unp(b);
  c = clamp(c + (c - bc) * uAmount, 0.0, 1.0);
  o = vec4(c * s.a, s.a);
}`;

export const FS_SIMPLE = HEAD + `
uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime; uniform int uType;
uniform float uA, uB, uC, uD; uniform vec3 uCol1, uCol2;
vec4 tex(vec2 uv){ return texture(uTex, uv); }
void main(){
  vec2 uv = vUv;
  if (uType == 1) { // pixelar
    vec2 b = max(uA, 1.0) / uRes; uv = (floor(uv / b) + 0.5) * b; o = tex(uv); return;
  }
  if (uType == 2) { // viñeta
    vec4 s = tex(uv); vec3 c = unp(s);
    vec2 d = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float r = length(d) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);
    float m = 1.0 - smoothstep(uB * 0.9, uB * 0.9 + uC, r);
    c = mix(uCol1, c, mix(1.0, m, uA));
    o = vec4(c * s.a, s.a); return;
  }
  if (uType == 3) { // grano
    vec4 s = tex(uv); vec3 c = unp(s);
    vec2 g = floor(uv * uRes / max(uB, 0.5));
    float n = hash(g + fract(uTime * 13.37) * 100.0) - 0.5;
    c += n * uA * 0.5 * (1.0 - abs(luma(c) - 0.5));
    o = vec4(clamp(c, 0.0, 1.0) * s.a, s.a); return;
  }
  if (uType == 4) { // aberración cromática
    vec2 off = vec2(cos(radians(uB)), sin(radians(uB))) * uA / uRes;
    vec4 r = tex(uv + off), g = tex(uv), b = tex(uv - off);
    o = vec4(r.r, g.g, b.b, max(max(r.a, g.a), b.a)); return;
  }
  if (uType == 5) { // glitch
    float t = floor(uTime * 12.0 * uB);
    float row = floor(uv.y * 24.0);
    float n = hash(vec2(row, t));
    float shift = (n > 1.0 - uA * 0.5) ? (hash(vec2(t, row)) - 0.5) * 0.15 * uA : 0.0;
    float big = hash(vec2(t * 0.37, 7.0)) > 0.9 ? (hash(vec2(t, 3.0)) - 0.5) * 0.05 * uA : 0.0;
    vec2 u2 = vec2(uv.x + shift + big, uv.y);
    float ca = 0.008 * uA * (0.5 + n);
    vec4 r = tex(u2 + vec2(ca, 0.0)), g = tex(u2), b = tex(u2 - vec2(ca, 0.0));
    vec4 c = vec4(r.r, g.g, b.b, g.a);
    if (hash(vec2(t, row * 3.1)) > 1.0 - uA * 0.08) c.rgb = vec3(hash(uv * uTime));
    o = c; return;
  }
  if (uType == 6) { // líneas CRT
    vec4 s = tex(uv); vec3 c = unp(s);
    float l = 0.5 + 0.5 * sin(uv.y * uB * 3.14159);
    c *= 1.0 - uA * (1.0 - l) * 0.8;
    o = vec4(c * s.a, s.a); return;
  }
  if (uType == 7) { // semitono
    vec4 s = tex(uv); vec3 c = unp(s);
    vec2 p = uv * uRes; float sz = uA;
    vec2 cell = (floor(p / sz) + 0.5) * sz;
    vec3 cc = unp(tex(cell / uRes));
    float lum = luma(cc);
    float d = length(p - cell) / (sz * 0.5);
    float dot1 = 1.0 - smoothstep(sqrt(1.0 - lum) - 0.08, sqrt(1.0 - lum) + 0.08, d);
    vec3 col = uB > 0.5 ? mix(vec3(1.0), cc * 0.9, dot1) : vec3(1.0 - dot1);
    o = vec4(col * s.a, s.a); return;
  }
  if (uType == 8) { // posterizar
    vec4 s = tex(uv); vec3 c = unp(s);
    c = floor(c * uA) / max(uA - 1.0, 1.0);
    o = vec4(clamp(c, 0.0, 1.0) * s.a, s.a); return;
  }
  if (uType == 9 || uType == 10) { // bordes / relieve
    vec2 px = 1.0 / uRes;
    float tl = luma(unp(tex(uv + px * vec2(-1, -1)))), t0 = luma(unp(tex(uv + px * vec2(0, -1)))), tr = luma(unp(tex(uv + px * vec2(1, -1))));
    float l0 = luma(unp(tex(uv + px * vec2(-1, 0)))), r0 = luma(unp(tex(uv + px * vec2(1, 0))));
    float bl = luma(unp(tex(uv + px * vec2(-1, 1)))), b0 = luma(unp(tex(uv + px * vec2(0, 1)))), br = luma(unp(tex(uv + px * vec2(1, 1))));
    vec4 s = tex(uv); vec3 c = unp(s);
    if (uType == 10) {
      float e = (br + b0 + r0) - (tl + t0 + l0);
      vec3 col = vec3(0.5 + e * uA);
      o = vec4(clamp(col, 0.0, 1.0) * s.a, s.a); return;
    }
    float gx = -tl - 2.0 * l0 - bl + tr + 2.0 * r0 + br;
    float gy = -tl - 2.0 * t0 - tr + bl + 2.0 * b0 + br;
    float e = clamp(length(vec2(gx, gy)) * uA, 0.0, 1.0);
    vec3 col;
    if (uB < 0.5) col = vec3(1.0 - e);
    else if (uB < 1.5) col = e * (0.5 + 0.5 * cos(6.2831 * (uv.x + uv.y + uTime * 0.2 + vec3(0.0, 0.33, 0.67))));
    else col = mix(c, vec3(0.0), e);
    o = vec4(col * s.a, s.a); return;
  }
  if (uType == 11) { // duotono
    vec4 s = tex(uv); vec3 c = unp(s);
    vec3 d = mix(uCol1, uCol2, smoothstep(0.0, 1.0, luma(c)));
    o = vec4(mix(c, d, uA) * s.a, s.a); return;
  }
  if (uType == 12) { // superposición de color
    vec4 s = tex(uv); vec3 c = unp(s);
    o = vec4(mix(c, uCol1, uA) * s.a, s.a); return;
  }
  if (uType == 13) { // invertir
    vec4 s = tex(uv); vec3 c = unp(s);
    o = vec4(mix(c, 1.0 - c, uA) * s.a, s.a); return;
  }
  if (uType == 14) { // espejo
    if (uA < 0.5) uv.x = uv.x > 0.5 ? 1.0 - uv.x : uv.x;
    else if (uA < 1.5) uv.y = uv.y > 0.5 ? 1.0 - uv.y : uv.y;
    else { uv = abs(uv - 0.5) * 2.0; uv = 1.0 - uv; uv *= 0.5; }
    o = tex(uv); return;
  }
  if (uType == 15) { // caleidoscopio
    vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float r = length(p); float a = atan(p.y, p.x) + radians(uB);
    float seg = 6.28318 / max(uA, 2.0);
    a = mod(a, seg); a = abs(a - seg * 0.5);
    p = vec2(cos(a), sin(a)) * r;
    uv = p / vec2(uRes.x / uRes.y, 1.0) + 0.5;
    o = tex(clamp(uv, 0.0, 1.0)); return;
  }
  if (uType == 16) { // ondas
    uv.x += sin(uv.y * uB + uTime * uC) * uA;
    uv.y += cos(uv.x * uB * 0.7 + uTime * uC * 0.8) * uA * 0.5;
    o = tex(uv); return;
  }
  if (uType == 17) { // ojo de pez
    vec2 p = (uv - 0.5) * 2.0;
    float r2 = dot(p, p);
    p *= 1.0 + uA * r2 * 0.5;
    uv = p * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { o = vec4(0.0); return; }
    o = tex(uv); return;
  }
  if (uType == 18) { // barras de cine
    vec4 s = tex(uv);
    float targetH = (uRes.x / uA) / uRes.y;
    float bar = max(0.0, (1.0 - targetH) * 0.5);
    float tw = uRes.y / uA; // si el lienzo es más angosto, barras laterales
    float barX = max(0.0, (1.0 - (uRes.y * uA) / uRes.x) * 0.5) * step(uRes.x / uRes.y, uA) * 0.0;
    if (uv.y < bar || uv.y > 1.0 - bar || uv.x < barX || uv.x > 1.0 - barX) o = vec4(uCol1, 1.0); else o = s;
    return;
  }
  if (uType == 19) { // VHS
    float t = uTime;
    float wob = (hash(vec2(floor(uv.y * 240.0), floor(t * 30.0))) - 0.5) * 0.004 * uA;
    float roll = smoothstep(0.0, 0.02, abs(fract(uv.y - t * 0.12) - 0.5)) ;
    vec2 u2 = uv + vec2(wob + (1.0 - roll) * 0.01 * uA, 0.0);
    vec3 c;
    c.r = unp(tex(u2 + vec2(0.004 * uA, 0.0))).r;
    c.g = unp(tex(u2)).g;
    c.b = unp(tex(u2 - vec2(0.004 * uA, 0.0))).b;
    c = mix(c, vec3(luma(c)), 0.15 * uA);
    c += (hash(uv * uRes + t) - 0.5) * 0.12 * uA;
    c *= 1.0 - 0.15 * uA * (0.5 + 0.5 * sin(uv.y * uRes.y * 1.5));
    float a = tex(uv).a;
    o = vec4(clamp(c, 0.0, 1.0) * a, a); return;
  }
  if (uType == 20) { // chroma key  (uCol1 = color clave, uA similitud, uB suavidad, uC derrame)
    vec4 s = tex(uv); vec3 c = unp(s);
    float Y = luma(c);
    vec2 cc = vec2(c.b - Y, c.r - Y);
    float Yk = luma(uCol1);
    vec2 kc = vec2(uCol1.b - Yk, uCol1.r - Yk);
    float d = distance(cc, kc);
    float a = smoothstep(uA * 0.5, uA * 0.5 + uB, d);
    // supresión de derrame
    float spillVal = pow(clamp(1.0 - d / max(uA * 0.5 + uB + 0.2, 0.001), 0.0, 1.0), 1.5) * uC;
    vec3 desat = vec3(Y);
    c = mix(c, desat, spillVal);
    float na = s.a * a;
    o = vec4(c * na, na); return;
  }
  if (uType == 21) { // luma key
    vec4 s = tex(uv); vec3 c = unp(s);
    float l = luma(c);
    float a = smoothstep(uA - uB, uA + uB, l);
    if (uC > 0.5) a = 1.0 - a;
    float na = s.a * a;
    o = vec4(c * na, na); return;
  }
  if (uType == 22) { // umbral de brillo (bloom)
    vec4 s = tex(uv); vec3 c = unp(s);
    float l = luma(c);
    float k = smoothstep(uA, min(uA + 0.2, 1.0), l);
    o = vec4(c * k * s.a, s.a * k); return;
  }
  o = tex(uv);
}`;

/** Mezcla aditiva para bloom: base + glow*intensidad */
export const FS_ADD = HEAD + `
uniform sampler2D uTex; uniform sampler2D uTex2; uniform float uAmount;
void main(){ vec4 a = texture(uTex, vUv); vec4 b = texture(uTex2, vUv); o = vec4(min(a.rgb + b.rgb * uAmount, vec3(a.a)), a.a); }`;

/** Máscara de forma en espacio de la fuente */
const SHAPE_FN = `
float dot2(vec2 v){ return dot(v, v); }
float sdHeartIQ(vec2 p){
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
float sdStar(vec2 p, float r, float rf){
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
// shape: 1 rect, 2 ellipse, 3 linear, 4 heart, 5 star
float shapeMask(vec2 uv, vec2 res, vec2 center, vec2 size, float rot, float feather, int shape, float radius){
  vec2 p = (uv - center) * res;
  float r = radians(rot);
  p = mat2(cos(r), sin(r), -sin(r), cos(r)) * p;
  vec2 hs = max(size * res * 0.5, vec2(1.0));
  float f = max(feather * min(hs.x, hs.y) * 2.0, 0.75);
  float d;
  if (shape == 1) {
    float rr = radius * min(hs.x, hs.y);
    vec2 q = abs(p) - hs + rr;
    d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;
  } else if (shape == 2) {
    vec2 q = p / hs;
    float k = length(q);
    d = (k - 1.0) * min(hs.x, hs.y);
  } else if (shape == 3) {
    d = p.y;
    f = max(feather * res.y, 0.75);
  } else if (shape == 4) {
    vec2 q = p / hs;
    vec2 hp = vec2(q.x * 0.6, (1.0 - q.y) * 0.55);
    d = sdHeartIQ(hp) * min(hs.x, hs.y) / 0.6;
  } else {
    vec2 q = vec2(p.x, -p.y) / min(hs.x, hs.y);
    d = sdStar(q, 1.0, 0.45) * min(hs.x, hs.y);
  }
  return 1.0 - smoothstep(-f, f, d);
}`;

export const FS_MASK = HEAD + SHAPE_FN + `
uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uCenter; uniform vec2 uSize;
uniform float uRot, uFeather, uInvert, uRadius; uniform int uShape;
void main(){
  vec4 s = texture(uTex, vUv);
  float m = shapeMask(vUv, uRes, uCenter, uSize, uRot, uFeather, uShape, uRadius);
  if (uInvert > 0.5) m = 1.0 - m;
  o = s * m;
}`;

/** Mezcla por regiones (censura / enfoque) con hasta 8 cajas */
export const FS_REGION = HEAD + SHAPE_FN + `
uniform sampler2D uTex; uniform sampler2D uFx; uniform vec2 uRes;
uniform vec4 uBoxes[8]; uniform int uCount; uniform int uShape; uniform float uFeather;
uniform float uInvert; uniform int uMode; uniform float uStrength; uniform vec3 uColor; uniform float uDarken;
void main(){
  vec4 s = texture(uTex, vUv);
  float m = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    vec4 b = uBoxes[i];
    m = max(m, shapeMask(vUv, uRes, b.xy, b.zw, 0.0, uFeather * 0.5, uShape, 0.15));
  }
  if (uInvert > 0.5) m = 1.0 - m;
  vec4 fx;
  if (uMode == 1) { vec2 bs = max(uStrength, 2.0) / uRes; fx = texture(uTex, (floor(vUv / bs) + 0.5) * bs); }
  else if (uMode == 2) fx = vec4(uColor, 1.0) * s.a;
  else fx = texture(uFx, vUv);
  if (uDarken > 0.0) fx.rgb *= 1.0 - uDarken;
  o = mix(s, fx, m);
}`;

/** Quitar fondo con máscara de segmentación */
export const FS_SEGMENT = HEAD + `
uniform sampler2D uTex; uniform sampler2D uMask; uniform sampler2D uBlur;
uniform int uMode; uniform float uThreshold, uSoft; uniform vec3 uColor;
void main(){
  vec4 s = texture(uTex, vUv);
  float raw = texture(uMask, vUv).r;
  float m = smoothstep(uThreshold - uSoft, uThreshold + uSoft, raw);
  if (uMode == 0) { o = s * m; return; }                 // quitar fondo
  if (uMode == 3) { o = s * (1.0 - m); return; }         // quitar persona
  if (uMode == 1) { o = mix(texture(uBlur, vUv), s, m); return; } // desenfocar fondo
  if (uMode == 2) { o = mix(vec4(uColor, 1.0) * s.a, s, m); return; } // color
  vec3 c = unp(s); vec3 g = vec3(luma(c));                     // color pop
  o = vec4(mix(g, c, m) * s.a, s.a);
}`;

/** Tilt-shift: mezcla por banda vertical */
export const FS_TILT = HEAD + `
uniform sampler2D uTex; uniform sampler2D uFx; uniform float uCenter, uSize, uSoft;
void main(){
  float d = abs(vUv.y - uCenter);
  float m = smoothstep(uSize * 0.5, uSize * 0.5 + uSoft * 0.5, d);
  o = mix(texture(uTex, vUv), texture(uFx, vUv), m);
}`;

/** Composición con modos de fusión (premultiplicado) */
export const FS_COMPOSITE = HEAD + `
uniform sampler2D uDst; uniform sampler2D uSrc; uniform int uMode; uniform float uOpacity;
vec3 rgb2hsl(vec3 c){
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5; float h = 0.0, s = 0.0;
  if (mx != mn) {
    float d = mx - mn; s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0; else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
float h2r(float p, float q, float t){ if (t < 0.0) t += 1.0; if (t > 1.0) t -= 1.0; if (t < 1.0/6.0) return p + (q - p) * 6.0 * t; if (t < 0.5) return q; if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0; return p; }
vec3 hsl2rgb(vec3 h){ if (h.y == 0.0) return vec3(h.z); float q = h.z < 0.5 ? h.z * (1.0 + h.y) : h.z + h.y - h.z * h.y; float p = 2.0 * h.z - q; return vec3(h2r(p, q, h.x + 1.0/3.0), h2r(p, q, h.x), h2r(p, q, h.x - 1.0/3.0)); }
vec3 blendf(vec3 d, vec3 s){
  if (uMode == 1) return d * s;
  if (uMode == 2) return 1.0 - (1.0 - d) * (1.0 - s);
  if (uMode == 3) return mix(2.0 * d * s, 1.0 - 2.0 * (1.0 - d) * (1.0 - s), step(0.5, d));
  if (uMode == 4) return min(d, s);
  if (uMode == 5) return max(d, s);
  if (uMode == 6) return min(d / max(1.0 - s, 0.001), 1.0);
  if (uMode == 7) return 1.0 - min((1.0 - d) / max(s, 0.001), 1.0);
  if (uMode == 8) return mix(2.0 * d * s, 1.0 - 2.0 * (1.0 - d) * (1.0 - s), step(0.5, s));
  if (uMode == 9) return mix(2.0 * d * s + d * d * (1.0 - 2.0 * s), sqrt(d) * (2.0 * s - 1.0) + 2.0 * d * (1.0 - s), step(0.5, s));
  if (uMode == 10) return abs(d - s);
  if (uMode == 11) return d + s - 2.0 * d * s;
  if (uMode == 12) return min(d + s, 1.0);
  if (uMode == 13) return max(d - s, 0.0);
  if (uMode >= 14) {
    vec3 hd = rgb2hsl(d), hs = rgb2hsl(s);
    if (uMode == 14) return hsl2rgb(vec3(hs.x, hd.y, hd.z));
    if (uMode == 15) return hsl2rgb(vec3(hd.x, hs.y, hd.z));
    if (uMode == 16) return hsl2rgb(vec3(hs.x, hs.y, hd.z));
    return hsl2rgb(vec3(hd.x, hd.y, hs.z));
  }
  return s;
}
void main(){
  vec4 dst = texture(uDst, vUv);
  vec4 src = texture(uSrc, vUv) * uOpacity;
  if (uMode == 0 || src.a <= 0.0001) { o = src + dst * (1.0 - src.a); return; }
  vec3 d = unp(dst), s = unp(src);
  vec3 b = clamp(blendf(d, s), 0.0, 1.0);
  vec3 rgb = (1.0 - dst.a) * src.rgb + (1.0 - src.a) * dst.rgb + src.a * dst.a * b;
  o = vec4(rgb, src.a + dst.a * (1.0 - src.a));
}`;

/** Transiciones entre capas (A = saliente, B = entrante) */
export const FS_TRANSITION = HEAD + `
uniform sampler2D uFrom; uniform sampler2D uTo; uniform float uP; uniform int uType; uniform vec2 uRes; uniform float uTime;
vec4 A(vec2 uv){ if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0); return texture(uFrom, uv); }
vec4 B(vec2 uv){ if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0); return texture(uTo, uv); }
vec4 Ac(vec2 uv){ return texture(uFrom, clamp(uv, 0.0, 1.0)); }
vec4 Bc(vec2 uv){ return texture(uTo, clamp(uv, 0.0, 1.0)); }
float ease(float t){ return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
float sdHeart2(vec2 p){
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  vec2 a = p - vec2(0.0, 1.0); vec2 b = p - 0.5 * max(p.x + p.y, 0.0);
  return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y);
}
void main(){
  vec2 uv = vUv; float p = clamp(uP, 0.0, 1.0); float e = ease(p);
  float soft = 0.02;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  if (uType == 1) { o = mix(A(uv), B(uv), p); return; }
  if (uType == 2 || uType == 3) {
    vec4 col = uType == 2 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(1.0);
    o = p < 0.5 ? mix(A(uv), col, p * 2.0) : mix(col, B(uv), (p - 0.5) * 2.0); return;
  }
  if (uType == 4) { float m = smoothstep(1.0 - e - soft, 1.0 - e + soft, uv.x); o = mix(A(uv), B(uv), m); return; }
  if (uType == 5) { float m = 1.0 - smoothstep(e - soft, e + soft, uv.x); o = mix(A(uv), B(uv), m); return; }
  if (uType == 6) { float m = smoothstep(1.0 - e - soft, 1.0 - e + soft, uv.y); o = mix(A(uv), B(uv), m); return; }
  if (uType == 7) { float m = 1.0 - smoothstep(e - soft, e + soft, uv.y); o = mix(A(uv), B(uv), m); return; }
  if (uType == 8) { vec4 b = B(uv - vec2(1.0 - e, 0.0)); o = b + A(uv) * (1.0 - b.a); return; }
  if (uType == 9) { vec4 b = B(uv + vec2(1.0 - e, 0.0)); o = b + A(uv) * (1.0 - b.a); return; }
  if (uType == 10) { vec4 b = B(uv - vec2(0.0, 1.0 - e)); o = b + A(uv) * (1.0 - b.a); return; }
  if (uType == 11) { vec4 b = B(uv + vec2(0.0, 1.0 - e)); o = b + A(uv) * (1.0 - b.a); return; }
  if (uType == 12) { o = uv.x < 1.0 - e ? A(uv + vec2(e, 0.0)) : B(uv - vec2(1.0 - e, 0.0)); return; }
  if (uType == 13) { o = uv.x > e ? A(uv - vec2(e, 0.0)) : B(uv + vec2(1.0 - e, 0.0)); return; }
  if (uType == 14) { vec4 a = A((uv - 0.5) / (1.0 + e * 1.5) + 0.5); vec4 b = B((uv - 0.5) / (0.6 + 0.4 * e) + 0.5); o = mix(a, b, smoothstep(0.3, 0.8, p)); return; }
  if (uType == 27) { vec4 a = A((uv - 0.5) * (1.0 + e * 0.8) + 0.5); vec4 b = B((uv - 0.5) * (1.6 - 0.6 * e) + 0.5); o = mix(a, b, smoothstep(0.2, 0.7, p)); return; }
  if (uType == 15 || uType == 16 || uType == 24) {
    vec2 q = (uv - 0.5) * asp;
    float R = length(asp * 0.5) * 1.05;
    if (uType == 15) { float m = 1.0 - smoothstep(e * R - 0.01, e * R + 0.01, length(q)); o = mix(A(uv), B(uv), m); return; }
    if (uType == 16) { float m = smoothstep((1.0 - e) * R - 0.01, (1.0 - e) * R + 0.01, length(q)); o = mix(A(uv), B(uv), m); return; }
    float s = max(e * 2.2, 0.0001);
    float d = sdHeart2(vec2(q.x, -q.y) / s + vec2(0.0, 0.5));
    o = mix(A(uv), B(uv), 1.0 - smoothstep(-0.02, 0.02, d)); return;
  }
  if (uType == 17) {
    float ang = e * 6.28318;
    vec2 q = (uv - 0.5) * asp;
    float sc = 1.0 + sin(p * 3.14159) * 0.8;
    vec2 r = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * q * sc;
    vec2 u2 = r / asp + 0.5;
    o = mix(A(u2), B(u2), smoothstep(0.35, 0.65, p)); return;
  }
  if (uType == 18) {
    float r = sin(p * 3.14159) * 0.035;
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int i = 0; i < 16; i++) {
      float ang = float(i) * 2.399;
      float rr = r * sqrt(float(i) / 16.0);
      vec2 off = vec2(cos(ang), sin(ang)) * rr / asp;
      a += A(uv + off); b += B(uv + off);
    }
    o = mix(a / 16.0, b / 16.0, smoothstep(0.3, 0.7, p)); return;
  }
  if (uType == 19) {
    float k = sin(p * 3.14159);
    float row = floor(uv.y * 30.0);
    float n = hash(vec2(row, floor(uTime * 20.0 + p * 40.0)));
    vec2 u2 = uv + vec2((n - 0.5) * 0.2 * k * step(0.5, n), 0.0);
    vec4 a = vec4(A(u2 + vec2(0.01 * k, 0.0)).r, A(u2).g, A(u2 - vec2(0.01 * k, 0.0)).b, A(u2).a);
    vec4 b = vec4(B(u2 + vec2(0.01 * k, 0.0)).r, B(u2).g, B(u2 - vec2(0.01 * k, 0.0)).b, B(u2).a);
    o = p < 0.5 ? a : b; return;
  }
  if (uType == 20) { float m = 1.0 - smoothstep(e * 0.5 - soft, e * 0.5 + soft, abs(uv.x - 0.5)); o = mix(A(uv), B(uv), m); return; }
  if (uType == 21) { float d = (uv.x + uv.y) * 0.5; float m = 1.0 - smoothstep(e * 1.1 - 0.05 - soft, e * 1.1 - 0.05 + soft, d); o = mix(A(uv), B(uv), m); return; }
  if (uType == 22) {
    float k = sin(p * 3.14159);
    float sz = max(1.0, k * 60.0);
    vec2 bs = sz / uRes; vec2 u2 = (floor(uv / bs) + 0.5) * bs;
    o = p < 0.5 ? A(u2) : B(u2); return;
  }
  if (uType == 23) {
    vec4 c = mix(A(uv), B(uv), smoothstep(0.4, 0.6, p));
    float f = pow(1.0 - abs(p - 0.5) * 2.0, 2.0);
    o = vec4(min(c.rgb + vec3(f), vec3(1.0)), max(c.a, f)); return;
  }
  if (uType == 25) {
    vec2 q = (uv - 0.5) * asp;
    float a = atan(q.x, -q.y) / 6.28318 + 0.5;
    float m = 1.0 - smoothstep(e - 0.005, e + 0.005, a);
    o = mix(A(uv), B(uv), m); return;
  }
  if (uType == 26) { float l = luma(unp(A(uv))); float m = smoothstep(l - 0.1, l + 0.1, e * 1.2 - 0.1); o = mix(A(uv), B(uv), m); return; }
  if (uType == 28) {
    vec2 q = (uv - 0.5) * asp;
    float k = sin(p * 3.14159) * 6.0;
    float r = length(q);
    float ang = k * max(0.0, 0.8 - r);
    q = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * q;
    vec2 u2 = q / asp + 0.5;
    o = mix(Ac(u2), Bc(u2), smoothstep(0.35, 0.65, p)); return;
  }
  if (uType == 29) {
    vec2 q = (uv - 0.5) * asp;
    float k = sin(p * 3.14159);
    float r = length(q);
    vec2 u2 = uv + normalize(q + 0.0001) * sin(r * 40.0 - p * 30.0) * 0.02 * k / asp;
    o = mix(Ac(u2), Bc(u2), p); return;
  }
  if (uType == 30) {
    float k = sin(p * 3.14159) * 0.04;
    vec4 a = vec4(A(uv + vec2(k, 0.0)).r, A(uv).g, A(uv - vec2(k, 0.0)).b, A(uv).a);
    vec4 b = vec4(B(uv + vec2(k, 0.0)).r, B(uv).g, B(uv - vec2(k, 0.0)).b, B(uv).a);
    o = mix(a, b, smoothstep(0.3, 0.7, p)); return;
  }
  if (uType == 31) {
    float k = sin(p * 3.14159);
    float n = hash(floor(uv * vec2(8.0, 5.0)) + floor(p * 8.0));
    vec3 burn = vec3(1.0, 0.55, 0.15) * k * (0.6 + 0.6 * smoothstep(0.2, 0.9, uv.x + n * 0.3));
    vec4 c = mix(A(uv), B(uv), smoothstep(0.35, 0.65, p));
    o = vec4(min(c.rgb + burn, vec3(1.0)), c.a); return;
  }
  if (uType == 32 || uType == 33 || uType == 39 || uType == 40) { // whip pan
    float sp = sin(p * 3.14159) * 0.22;
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 16; i++) {
      float k = (float(i) / 15.0 - 0.5) * sp;
      vec4 c;
      if (uType == 32) { float x = uv.x + e + k; c = x < 1.0 ? Ac(vec2(x, uv.y)) : Bc(vec2(x - 1.0, uv.y)); }
      else if (uType == 33) { float x = uv.x - e + k; c = x >= 0.0 ? Ac(vec2(x, uv.y)) : Bc(vec2(x + 1.0, uv.y)); }
      else if (uType == 39) { float y = uv.y + e + k; c = y < 1.0 ? Ac(vec2(uv.x, y)) : Bc(vec2(uv.x, y - 1.0)); }
      else { float y = uv.y - e + k; c = y >= 0.0 ? Ac(vec2(uv.x, y)) : Bc(vec2(uv.x, y + 1.0)); }
      sum += c;
    }
    o = sum / 16.0; return;
  }
  if (uType == 34) { // zoom con desenfoque
    float k = sin(p * 3.14159);
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int i = 0; i < 16; i++) {
      float f = float(i) / 15.0;
      float sa = 1.0 + e * 2.5 + k * 0.6 * f;
      float sb = 1.0 + (1.0 - e) * 2.5 + k * 0.6 * f;
      a += Ac((uv - 0.5) / sa + 0.5); b += Bc((uv - 0.5) / sb + 0.5);
    }
    o = mix(a / 16.0, b / 16.0, smoothstep(0.42, 0.58, p)); return;
  }
  if (uType == 35) { // sacudida
    float k = sin(p * 3.14159);
    float tk = floor(p * 24.0);
    vec2 j = (vec2(hash(vec2(tk, 1.0)), hash(vec2(tk, 2.0))) - 0.5) * 0.08 * k;
    vec2 q = (uv - 0.5) / (1.0 + k * 0.12) + 0.5 + j;
    float m = smoothstep(0.4, 0.6, p);
    vec2 ca = vec2(0.012 * k, 0.0);
    vec4 a = vec4(Ac(q + ca).r, Ac(q).g, Ac(q - ca).b, Ac(q).a);
    vec4 b = vec4(Bc(q + ca).r, Bc(q).g, Bc(q - ca).b, Bc(q).a);
    o = mix(a, b, m); return;
  }
  if (uType == 36) { // fuga de luz
    float k = sin(p * 3.14159);
    vec4 c = mix(A(uv), B(uv), smoothstep(0.3, 0.7, p));
    float x = p * 1.8 - 0.4;
    float g = exp(-pow((uv.x - x + (uv.y - 0.5) * 0.3) * 2.5, 2.0));
    vec3 leak = (vec3(1.0, 0.55, 0.2) * g + vec3(1.0, 0.3, 0.5) * exp(-pow((uv.x - x * 0.8 - 0.2) * 4.0, 2.0)) * 0.6) * k * 1.4 + k * k * 0.25;
    o = vec4(min(c.rgb + leak * c.a, vec3(c.a)), c.a); return;
  }
  if (uType == 37) { // giro + zoom
    vec4 sum = vec4(0.0);
    bool first = p < 0.5;
    float q = first ? e : 1.0 - e;
    for (int i = 0; i < 10; i++) {
      float f = float(i) / 9.0 - 0.5;
      float ang = (first ? 1.0 : -1.0) * (q * 3.14159 + f * sin(p * 3.14159) * 0.35);
      float sc = 1.0 + q * 1.8;
      vec2 d = (uv - 0.5) * asp;
      d = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d;
      vec2 u2 = d / asp / sc + 0.5;
      u2 = abs(mod(u2 + 1.0, 2.0) - 1.0);
      sum += first ? Ac(u2) : Bc(u2);
    }
    o = sum / 10.0; return;
  }
  if (uType == 38) { // comprimir
    float split = 1.0 - e;
    if (uv.x < split) o = A(vec2(uv.x / max(split, 1e-3), uv.y));
    else o = B(vec2((uv.x - split) / max(e, 1e-3), uv.y));
    return;
  }
  o = mix(A(uv), B(uv), p);
}`;

/** Copia escalada a 'cover' (para fondo desenfocado) */
export const FS_COVER = HEAD + `
uniform sampler2D uTex; uniform vec2 uScale; uniform float uDim;
void main(){ vec2 uv = (vUv - 0.5) / uScale + 0.5; vec4 c = texture(uTex, clamp(uv, 0.001, 0.999)); o = vec4(c.rgb * (1.0 - uDim), c.a); }`;

// ============================================================================
//  Efectos de tendencia (TikTok / CapCut), belleza y mejora de calidad
// ============================================================================
const HUE = `vec3 hue2rgb(float h){ return clamp(abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }`;

export const FS_TREND = HEAD + HUE + `
uniform sampler2D uTex; uniform sampler2D uTex2; uniform vec2 uRes; uniform float uTime; uniform int uType;
uniform float uA, uB, uC, uD, uE; uniform vec3 uCol1, uCol2;
vec4 T(vec2 uv){ return texture(uTex, uv); }
vec4 Tm(vec2 uv){ vec2 m = abs(mod(uv + 1.0, 2.0) - 1.0); return texture(uTex, m); } // espejado en bordes
float vnoise(float x){ float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(vec2(i, 1.7)), hash(vec2(i + 1.0, 1.7)), f) * 2.0 - 1.0; }
vec4 over(vec4 base, vec3 col, float a){ return vec4(base.rgb * (1.0 - a) + col * a, base.a + (1.0 - base.a) * a); }
float heartF(vec2 q){ q.y = -q.y + 0.15; q *= 1.25; float a = q.x * q.x + q.y * q.y - 1.0; return a * a * a - q.x * q.x * q.y * q.y * q.y; }
float star4(vec2 d, float S){
  float ax = abs(d.x), ay = abs(d.y);
  float r1 = exp(-ax / (S * 0.035)) * exp(-ay / (S * 0.32)) + exp(-ay / (S * 0.035)) * exp(-ax / (S * 0.32));
  vec2 e = vec2(d.x + d.y, d.x - d.y) * 0.7071;
  float r2 = exp(-abs(e.x) / (S * 0.03)) * exp(-abs(e.y) / (S * 0.18)) + exp(-abs(e.y) / (S * 0.03)) * exp(-abs(e.x) / (S * 0.18));
  float core = exp(-dot(d, d) / (S * S * 0.006));
  return r1 + r2 * 0.45 + core;
}
void main(){
  vec2 uv = vUv; float t = uTime; vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  if (uType == 1) { // temblor de cámara
    float sp = uB * t;
    vec2 off = vec2(vnoise(sp * 3.1) * 0.7 + vnoise(sp * 7.7 + 3.0) * 0.3, vnoise(sp * 2.9 + 11.0) * 0.7 + vnoise(sp * 8.3 + 5.0) * 0.3) * 0.035 * uA;
    vec2 off2 = vec2(vnoise((sp + 0.03) * 3.1) * 0.7 + vnoise((sp + 0.03) * 7.7 + 3.0) * 0.3, vnoise((sp + 0.03) * 2.9 + 11.0) * 0.7 + vnoise((sp + 0.03) * 8.3 + 5.0) * 0.3) * 0.035 * uA;
    float rot = vnoise(sp * 2.3 + 7.0) * radians(4.0) * uC * uA;
    float zoom = 1.0 + uA * 0.09;
    vec2 vel = (off2 - off) * 18.0 * uD;
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 8; i++) {
      float k = float(i) / 7.0 - 0.5;
      vec2 p = (uv - 0.5) * asp;
      p = mat2(cos(rot), sin(rot), -sin(rot), cos(rot)) * p;
      p = p / asp / zoom + 0.5 + off + vel * k;
      sum += Tm(p);
    }
    o = sum / 8.0; return;
  }
  if (uType == 2) { // flash
    vec4 s = T(uv); vec3 c = unp(s);
    float ph = fract(t * uB);
    float k = uA * (1.0 - smoothstep(0.0, max(uC, 0.02), ph));
    c = mix(c, uCol1, k * 0.85) + k * 0.25;
    o = vec4(clamp(c, 0.0, 1.0) * s.a, s.a); return;
  }
  if (uType == 3) { // zoom al ritmo
    float ph = fract(t * uB);
    float k = exp(-ph * 5.0);
    float s = 1.0 + uA * k;
    vec2 c = vec2(0.5);
    vec4 sum = vec4(0.0);
    float bl = uC * k * uA * 0.6;
    for (int i = 0; i < 12; i++) { float f = float(i) / 11.0; sum += Tm(c + (uv - c) / (s * (1.0 + bl * f))); }
    o = sum / 12.0; return;
  }
  if (uType == 4) { // RGB shake
    float tick = floor(t * uB * 6.0);
    float a = hash(vec2(tick, 3.1)) * 6.2832;
    float m = uA * (0.35 + 0.65 * hash(vec2(tick, 9.7)));
    vec2 d = vec2(cos(a), sin(a)) * m / uRes;
    vec2 j = (vec2(hash(vec2(tick, 1.3)), hash(vec2(tick, 5.9))) - 0.5) * uC * uA * 1.2 / uRes;
    vec4 r = Tm(uv + d + j), g = Tm(uv + j), b = Tm(uv - d + j);
    o = vec4(r.r, g.g, b.b, max(max(r.a, g.a), b.a)); return;
  }
  if (uType == 5) { // fugas de luz
    vec4 s = T(uv); vec3 c = unp(s);
    float sp = t * uB;
    vec3 leak = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 ctr = vec2(0.5 + 0.6 * sin(sp * (0.37 + fi * 0.21) + fi * 2.1), 0.5 + 0.5 * cos(sp * (0.29 + fi * 0.17) + fi * 1.3));
      vec2 d = (uv - ctr) * asp;
      float g = exp(-dot(d, d) / (0.12 + 0.06 * fi));
      leak += mix(uCol1, uCol2, fract(fi * 0.5 + sin(sp * 0.3) * 0.5)) * g;
    }
    leak += uCol1 * smoothstep(0.35, 0.0, uv.x) * (0.5 + 0.5 * sin(sp * 0.8)) * 0.6;
    leak *= uA;
    c = 1.0 - (1.0 - c) * (1.0 - clamp(leak, 0.0, 1.0));
    o = vec4(c * s.a, s.a); return;
  }
  if (uType == 6) { // destellos
    vec4 s = T(uv); vec3 c = unp(s);
    vec2 px = uv * uRes;
    float cell = uRes.y / max(uC, 4.0);
    vec2 id = floor(px / cell);
    float acc = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 cid = id + vec2(float(x), float(y));
      vec2 pos = (cid + vec2(hash(cid), hash(cid + 7.31))) * cell;
      float l = luma(unp(T(pos / uRes)));
      float b = smoothstep(uD, min(uD + 0.25, 1.0), l);
      if (b <= 0.0) continue;
      float tw = 0.5 + 0.5 * sin(t * (2.0 + hash(cid + 3.3) * 4.0) + hash(cid) * 6.28);
      tw = tw * tw;
      float S = uB * (0.5 + hash(cid + 1.1));
      acc += star4(px - pos, S) * b * tw;
    }
    c += uCol1 * acc * uA;
    o = vec4(clamp(c, 0.0, 1.0) * s.a, s.a); return;
  }
  if (uType == 7) { // partículas: uD = tipo
    vec4 base = T(uv);
    int kind = int(uD + 0.5);
    for (int L = 0; L < 3; L++) {
      float fl = float(L);
      float cell = 0.11 / sqrt(max(uA, 0.05)) * (1.0 + fl * 0.55);
      float spd = uC * (0.05 + fl * 0.035);
      vec2 p = uv * asp;
      if (kind == 0) { p.y -= t * spd * 1.3; p.x += sin(t * 0.7 + fl) * 0.03; }
      else if (kind == 1) { p.y += t * spd; }
      else if (kind == 2) { p.y -= t * spd * 1.8; }
      else if (kind == 3) { p.y -= t * spd * 0.2; }
      else if (kind == 4) { p.y += t * spd * 0.25; }
      else if (kind == 5) { p.y -= t * spd * 9.0; p.x += p.y * 0.18; }
      else { p.y += t * spd * 1.2; p.x += sin(p.y * 6.0 + t) * 0.02; }
      vec2 id = floor(p / cell + fl * 13.7);
      vec2 f = fract(p / cell + fl * 13.7) - 0.5;
      float r = hash(id + fl * 3.1);
      if (r > 0.55 + 0.1 * min(uA, 3.0)) continue;
      vec2 off = (vec2(hash(id + 1.7), hash(id + 9.2)) - 0.5) * 0.5;
      vec2 d = f - off;
      float sz = uB * (0.6 + hash(id + 4.4) * 0.8) * (1.0 - fl * 0.18);
      float a = 0.0; vec3 col = uCol1;
      if (kind == 0) { float rr = 0.09 * sz; a = smoothstep(rr, rr * 0.3, length(d)) * (0.65 + 0.35 * (1.0 - fl / 2.0)); }
      else if (kind == 1) {
        float rr = 0.17 * sz; vec2 q = d / rr;
        q = mat2(cos(sin(t + r * 6.0) * 0.3), sin(sin(t + r * 6.0) * 0.3), -sin(sin(t + r * 6.0) * 0.3), cos(sin(t + r * 6.0) * 0.3)) * q;
        a = heartF(q) < 0.0 ? 1.0 : 0.0;
        a *= smoothstep(1.4, 1.0, length(q));
        col = mix(vec3(1.0, 0.18, 0.38), vec3(1.0, 0.5, 0.75), hash(id + 2.2));
        if (uCol1 != vec3(1.0)) col = mix(col, uCol1, 0.7);
      }
      else if (kind == 2) {
        float ang = t * (2.0 + r * 5.0) + r * 6.28;
        vec2 q = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d;
        q.x *= 0.5 + 0.5 * abs(sin(t * 3.0 + r * 9.0));
        vec2 hs = vec2(0.09, 0.045) * sz;
        a = step(abs(q.x), hs.x) * step(abs(q.y), hs.y);
        col = hue2rgb(hash(id + 5.5));
      }
      else if (kind == 3) {
        float tw = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(t * (2.0 + r * 5.0) + r * 20.0), 2.0);
        a = clamp(star4(d * 120.0, 30.0 * sz) * 0.6, 0.0, 1.0) * tw;
      }
      else if (kind == 4) {
        float rr = 0.3 * sz; float dd = length(d);
        a = smoothstep(rr, rr * 0.85, dd) * 0.28 + smoothstep(rr, rr * 0.95, dd) * smoothstep(rr * 0.8, rr, dd) * 0.15;
        col = mix(uCol1, hue2rgb(0.05 + hash(id) * 0.12), 0.6);
      }
      else if (kind == 5) {
        vec2 q = d; a = smoothstep(0.012 * sz, 0.0, abs(q.x)) * smoothstep(0.35 * sz, 0.0, abs(q.y)) * 0.55;
        col = mix(vec3(0.75, 0.85, 1.0), uCol1, 0.3);
      }
      else {
        float rr = 0.05 * sz; float fl2 = 0.5 + 0.5 * sin(t * 6.0 + r * 30.0);
        a = smoothstep(rr * 2.5, 0.0, length(d)) * (0.5 + 0.5 * fl2);
        col = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.85, 0.3), fl2);
      }
      base = over(base, col, clamp(a, 0.0, 1.0));
    }
    o = base; return;
  }
  if (uType == 8) { // película antigua
    float fr = floor(t * 18.0);
    vec2 u2 = uv + vec2(0.0, (hash(vec2(fr, 2.0)) - 0.5) * 0.004 * uA);
    vec4 s = T(u2); vec3 c = unp(s);
    float l = luma(c);
    c = mix(c, vec3(l) * vec3(1.07, 0.98, 0.82), 0.55 * uA);
    c *= 1.0 + (hash(vec2(fr, 7.0)) - 0.5) * 0.25 * uD * uA;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float seed = floor(t * 6.0 + fi * 3.7);
      if (hash(vec2(seed, fi)) > 0.35 + 0.5 * (1.0 - uB)) continue;
      float x = hash(vec2(seed, fi + 4.0));
      float w = 0.0008 + hash(vec2(seed, fi + 8.0)) * 0.0012;
      float line = smoothstep(w, 0.0, abs(uv.x - x - sin(uv.y * 10.0 + seed) * 0.002));
      c = mix(c, vec3(hash(vec2(seed, 1.0)) > 0.5 ? 0.95 : 0.1), line * 0.6 * uA);
    }
    vec2 g = floor(uv * uRes / 3.0);
    float dn = hash(g + fr * 1.37);
    if (dn > 1.0 - 0.0025 * uC * uA) c = vec3(hash(g) > 0.5 ? 0.0 : 1.0);
    vec2 dd = (uv - 0.5) * asp; c *= 1.0 - smoothstep(0.35, 0.95, length(dd)) * 0.6 * uA;
    c += (hash(uv * uRes + fr) - 0.5) * 0.12 * uA;
    o = vec4(clamp(c, 0.0, 1.0) * s.a, s.a); return;
  }
  if (uType == 9) { // videocámara
    vec2 ca = vec2(1.5 * uA, 0.0) / uRes * 2.0;
    vec4 s = T(uv); vec3 c = vec3(unp(T(uv + ca)).r, unp(s).g, unp(T(uv - ca)).b);
    c *= 1.0 - 0.12 * uA * (0.5 + 0.5 * sin(uv.y * uRes.y * 1.5));
    c = mix(c, c * vec3(1.02, 1.0, 1.06) + 0.03, uA * 0.5);
    float m = 0.055; vec2 px = uv * uRes; float lw = max(2.0, uRes.y * 0.004); float len = uRes.y * 0.07;
    vec2 mg = vec2(uRes.y * m);
    vec2 q = min(px, uRes - px) - mg;
    float br = 0.0;
    if (q.x > -lw && q.y > -lw && q.x < len && q.y < len) br = (q.x < 0.0 || q.y < 0.0) ? 1.0 : 0.0;
    if (q.x < -lw || q.y < -lw) br = 0.0;
    c = mix(c, vec3(1.0), br * 0.9);
    vec4 ov = texture(uTex2, uv);
    c = c * (1.0 - ov.a) + ov.rgb;
    o = vec4(clamp(c, 0.0, 1.0) * s.a, s.a); return;
  }
  if (uType == 10) { // prisma / fantasma RGB
    vec4 s = T(uv); vec3 c = unp(s) * s.a;
    vec3 acc = vec3(0.0); float aa = 0.0;
    int n = int(uB + 0.5);
    for (int i = 1; i <= 6; i++) {
      if (i > n) break;
      float fi = float(i);
      float ang = fi * 6.2832 / float(n) + t * uD;
      vec2 off = vec2(cos(ang), sin(ang)) * uA / asp;
      vec2 p = (uv - 0.5) / (1.0 + uC * fi) + 0.5 + off;
      vec4 g = Tm(p);
      vec3 tint = hue2rgb(fi / float(n) + t * uD * 0.1);
      acc += g.rgb * tint; aa += g.a;
    }
    acc /= max(float(n), 1.0) * 0.6;
    c = max(c, acc * 0.85);
    o = vec4(min(c, vec3(max(s.a, min(aa, 1.0)))), max(s.a, min(aa / float(max(n, 1)), 1.0))); return;
  }
  if (uType == 11) { // brillo de ensueño (uTex2 = desenfoque)
    vec4 s = T(uv); vec3 c = unp(s); vec3 b = unp(texture(uTex2, uv));
    vec3 scr = 1.0 - (1.0 - c) * (1.0 - b);
    vec3 r = mix(c, scr * 0.92 + b * 0.08, uA);
    r = mix(vec3(luma(r)), r, 1.0 + uA * 0.25);
    r += vec3(0.06, 0.02, -0.04) * uB * uA;
    o = vec4(clamp(r, 0.0, 1.0) * s.a, s.a); return;
  }
  if (uType == 12) { // filtro bilateral (piel suave / reducción de ruido). uA cantidad, uB radio px, uC solo piel, uD luminosidad
    vec4 s = T(uv); vec3 c = unp(s);
    vec3 sum = vec3(0.0); float ws = 0.0;
    float stp = max(uB / 3.0, 0.5);
    float sc = uC > 1.5 ? 0.06 : 0.11;
    for (int y = -3; y <= 3; y++) for (int x = -3; x <= 3; x++) {
      vec2 o2 = vec2(float(x), float(y)) * stp;
      vec3 q = unp(T(uv + o2 / uRes));
      vec3 dq = q - c;
      float w = exp(-dot(o2, o2) / (2.0 * uB * uB + 0.01)) * exp(-dot(dq, dq) / (2.0 * sc * sc));
      sum += q * w; ws += w;
    }
    vec3 f = sum / ws;
    float k = uA;
    if (uC > 0.5 && uC < 1.5) {
      float Y = luma(c); float cb = (c.b - Y) * 0.564 + 0.5; float cr = (c.r - Y) * 0.713 + 0.5;
      float skin = smoothstep(0.03, 0.0, abs(cb - 0.43) - 0.07) * smoothstep(0.03, 0.0, abs(cr - 0.6) - 0.07) * smoothstep(0.12, 0.25, Y);
      k *= skin;
      f += uD * 0.08 * skin;
    }
    o = vec4(clamp(mix(c, f, k), 0.0, 1.0) * s.a, s.a); return;
  }
  if (uType == 13) { // nitidez adaptativa por contraste (CAS)
    vec2 px = 1.0 / uRes;
    vec4 s = T(uv);
    vec3 e = unp(s);
    vec3 b = unp(T(uv + vec2(0.0, -px.y))), d = unp(T(uv + vec2(-px.x, 0.0))), f = unp(T(uv + vec2(px.x, 0.0))), h = unp(T(uv + vec2(0.0, px.y)));
    vec3 mn = min(e, min(min(b, d), min(f, h))); vec3 mx = max(e, max(max(b, d), max(f, h)));
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
    vec3 w = amp * -mix(0.125, 0.2, uA);
    vec3 r = (b * w + d * w + f * w + h * w + e) / (1.0 + 4.0 * w);
    r = mix(e, r, min(uA * 1.6, 1.0));
    o = vec4(clamp(r, 0.0, 1.0) * s.a, s.a); return;
  }
  if (uType == 14) { // deband / quitar bloques
    vec4 s = T(uv); vec3 c = unp(s);
    float rnd = hash(uv * uRes);
    float r = (0.5 + 0.5 * rnd) * uA;
    float a = hash(uv * uRes + 3.7) * 6.2832;
    vec2 d1 = vec2(cos(a), sin(a)) * r / uRes; vec2 d2 = vec2(-d1.y, d1.x) * uRes.x / uRes.y;
    vec3 s1 = unp(T(uv + d1)), s2 = unp(T(uv - d1)), s3 = unp(T(uv + d2)), s4 = unp(T(uv - d2));
    vec3 avg = (s1 + s2 + s3 + s4) * 0.25;
    vec3 diff = max(max(abs(s1 - c), abs(s2 - c)), max(abs(s3 - c), abs(s4 - c)));
    float th = 0.012 + 0.03 * uB;
    vec3 m = step(diff, vec3(th));
    c = mix(c, avg, m);
    c += (rnd - 0.5) / 255.0 * 1.5;
    o = vec4(clamp(c, 0.0, 1.0) * s.a, s.a); return;
  }
  if (uType == 15) { // realce de color
    vec4 s = T(uv); vec3 c = unp(s);
    float l = luma(c); float mxc = max(c.r, max(c.g, c.b)); float mnc = min(c.r, min(c.g, c.b));
    float sat = mxc - mnc;
    c = mix(vec3(l), c, 1.0 + uA * 0.7 * (1.0 - sat));
    c = mix(c, c * c * (3.0 - 2.0 * c), uA * 0.25);
    o = vec4(clamp(c, 0.0, 1.0) * s.a, s.a); return;
  }
  if (uType == 16) { // silueta coloreada (fuente de rayos). uTex = máscara
    float m = smoothstep(0.35, 0.65, texture(uTex, uv).r);
    float edge = m * (1.0 - smoothstep(0.55, 0.95, texture(uTex2, uv).r));
    float a = clamp(m * 0.45 + edge * 1.2, 0.0, 1.0) * uA;
    o = vec4(uCol1 * a, a); return;
  }
  o = T(uv);
}`;

/** Re-escalado bicúbico Catmull-Rom (9 lecturas bilineales). */
export const FS_BICUBIC = HEAD + `
uniform sampler2D uTex; uniform vec2 uSrcRes;
void main(){
  vec2 samplePos = vUv * uSrcRes;
  vec2 tp1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - tp1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 off12 = w2 / w12;
  vec2 tp0 = (tp1 - 1.0) / uSrcRes; vec2 tp3 = (tp1 + 2.0) / uSrcRes; vec2 tp12 = (tp1 + off12) / uSrcRes;
  vec4 r = vec4(0.0);
  r += texture(uTex, vec2(tp0.x, tp0.y)) * w0.x * w0.y;
  r += texture(uTex, vec2(tp12.x, tp0.y)) * w12.x * w0.y;
  r += texture(uTex, vec2(tp3.x, tp0.y)) * w3.x * w0.y;
  r += texture(uTex, vec2(tp0.x, tp12.y)) * w0.x * w12.y;
  r += texture(uTex, vec2(tp12.x, tp12.y)) * w12.x * w12.y;
  r += texture(uTex, vec2(tp3.x, tp12.y)) * w3.x * w12.y;
  r += texture(uTex, vec2(tp0.x, tp3.y)) * w0.x * w3.y;
  r += texture(uTex, vec2(tp12.x, tp3.y)) * w12.x * w3.y;
  r += texture(uTex, vec2(tp3.x, tp3.y)) * w3.x * w3.y;
  r = max(r, vec4(0.0)); r.rgb = min(r.rgb, vec3(r.a));
  o = r;
}`;

/** Composición de efectos de persona: aura/contorno (1) y rayos (2). */
export const FS_PERSON = HEAD + HUE + `
uniform sampler2D uTex; uniform sampler2D uMask; uniform sampler2D uFx; uniform sampler2D uFx2;
uniform int uMode; uniform int uStyle; uniform int uBg; uniform vec2 uRes; uniform float uTime;
uniform vec3 uCol1, uCol2; uniform float uIntensity, uPulse, uDarken, uSpin; uniform vec2 uCenter;
void main(){
  vec2 uv = vUv; vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec4 s = texture(uTex, uv);
  float m = smoothstep(0.4, 0.6, texture(uMask, uv).r);
  vec4 S = s * m;
  vec3 c = unp(s);
  vec4 B;
  if (uBg == 2) B = vec4(0.0);
  else if (uBg == 1) B = vec4(c * 0.3 * s.a, s.a);
  else if (uBg == 3) B = vec4(vec3(luma(c)) * s.a, s.a);
  else B = s;
  if (uMode == 1) {
    float gBig = texture(uFx, uv).r;
    float gSmall = texture(uFx2, uv).r;
    float k = uIntensity * (1.0 + uPulse * 0.6 * sin(uTime * 5.0));
    if (uStyle == 2 || uStyle == 3) {
      float st1 = smoothstep(0.02, 0.07, gSmall) * (1.0 - m);
      vec3 col = uCol1;
      if (uStyle == 3) {
        float st2 = smoothstep(0.02, 0.06, gBig) * (1.0 - m) * (1.0 - st1);
        B = vec4(B.rgb * (1.0 - st2) + uCol2 * st2, B.a + (1.0 - B.a) * st2);
      }
      float a1 = clamp(st1 * min(k, 1.0) * 1.2, 0.0, 1.0);
      B = vec4(B.rgb * (1.0 - a1) + col * a1, B.a + (1.0 - B.a) * a1);
    } else {
      vec3 col = uCol1;
      vec2 d = (uv - uCenter) * asp;
      if (uStyle == 1) col = hue2rgb(atan(d.y, d.x) / 6.2832 + uTime * 0.25);
      if (uStyle == 4) {
        float n = hash(floor(vec2(uv.x * 40.0, uv.y * 40.0 + uTime * 25.0)));
        float h = clamp(gBig * 1.6 + (n - 0.5) * 0.3, 0.0, 1.0);
        col = mix(vec3(0.9, 0.1, 0.0), vec3(1.0, 0.85, 0.2), h);
        gBig *= 0.75 + 0.5 * hash(floor(vec2(uv.x * 30.0, uv.y * 18.0 + uTime * 12.0)));
      } else if (uStyle == 0) col = mix(uCol1, uCol2, smoothstep(0.15, 0.6, gBig) * 0.5);
      float ga = clamp(pow(gBig, 0.65) * k * 1.35, 0.0, 1.0) * (1.0 - m);
      if (uBg == 2) B = vec4(col * ga, ga);
      else B = vec4(min(B.rgb + col * ga * B.a + col * ga * (1.0 - B.a), vec3(1.0)), B.a + (1.0 - B.a) * ga);
    }
  } else if (uMode == 2) {
    vec4 ray = texture(uFx, uv);
    vec2 d = (uv - uCenter) * asp;
    float ang = atan(d.y, d.x);
    float stripes = 0.55 + 0.45 * sin(ang * 18.0 + uTime * uSpin * 2.0) * sin(ang * 7.0 - uTime * uSpin * 1.3);
    B = vec4(B.rgb * (1.0 - uDarken), B.a);
    vec3 add = ray.rgb * uIntensity * 2.2 * stripes * (1.0 - m);
    float aa = clamp(ray.a * uIntensity * stripes, 0.0, 1.0) * (1.0 - m);
    B = vec4(min(B.rgb + add, vec3(1.0)), B.a + (1.0 - B.a) * aa);
  }
  o = S + B * (1.0 - S.a);
}`;

/** Clones / estela: hasta 6 copias (historial o desplazamientos espaciales). */
export const FS_ECHO = HEAD + `
uniform sampler2D uTex; uniform sampler2D uMask; uniform sampler2D uH0, uH1, uH2, uH3, uH4, uH5;
uniform int uMode; uniform int uCount; uniform int uHist; uniform float uUseMask; uniform float uSpacing, uDecay, uTintAmt;
uniform vec3 uTint; uniform vec2 uCenter; uniform vec2 uRes;
vec4 H(int i, vec2 uv){
  if (i == 0) return texture(uH0, uv); if (i == 1) return texture(uH1, uv); if (i == 2) return texture(uH2, uv);
  if (i == 3) return texture(uH3, uv); if (i == 4) return texture(uH4, uv); return texture(uH5, uv);
}
vec4 cut(vec2 uv){
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  vec4 s = texture(uTex, uv);
  float m = uUseMask > 0.5 ? smoothstep(0.4, 0.6, texture(uMask, uv).r) : 1.0;
  return s * m;
}
vec4 tint(vec4 g, float k){ vec3 c = unp(g); c = mix(c, uTint * (0.35 + luma(c)), uTintAmt * k); return vec4(c * g.a, g.a); }
void main(){
  vec2 uv = vUv;
  vec4 s = texture(uTex, uv);
  float m = uUseMask > 0.5 ? smoothstep(0.4, 0.6, texture(uMask, uv).r) : 1.0;
  vec4 S = s * m;
  vec4 acc = vec4(0.0);
  if (uMode == 0) {
    for (int i = 5; i >= 0; i--) {
      if (i >= uHist) continue;
      float w = pow(uDecay, float(i + 1)) * 0.85;
      vec4 g = tint(H(i, uv), float(i + 1) / float(max(uHist, 1))) * w;
      if (uUseMask > 0.5) acc = g + acc * (1.0 - g.a);
      else acc = max(acc, g);
    }
  } else {
    for (int i = 6; i >= 1; i--) {
      if (i > uCount) continue;
      float fi = float(i);
      vec2 p;
      if (uMode == 1) { float side = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0; float k = ceil(fi / 2.0); p = uv - vec2(side * k * uSpacing * 0.28, 0.0); }
      else { p = uCenter + (uv - uCenter) / (1.0 + uSpacing * 0.35 * fi); }
      float w = pow(uDecay, fi) * 0.9;
      vec4 g = tint(cut(p), fi / float(max(uCount, 1))) * w;
      acc = g + acc * (1.0 - g.a);
    }
  }
  if (uUseMask > 0.5) {
    vec4 B = s * (1.0 - m);
    vec4 mid = acc + B * (1.0 - acc.a);
    o = S + mid * (1.0 - S.a);
  } else {
    o = vec4(max(s.rgb, acc.rgb), max(s.a, acc.a));
  }
}`;
