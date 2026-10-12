// Utilidades WebGL2 de bajo nivel: programas, texturas, render targets con pool.

export interface Target { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }

export interface ProgramInfo {
  prog: WebGLProgram;
  uniforms: Map<string, { loc: WebGLUniformLocation; type: number; size: number }>;
}

export type UniformValue = number | boolean | number[] | Float32Array;
export interface TexBinding { tex: WebGLTexture; is3D?: boolean }

export const VS = `#version 300 es
layout(location=0) in vec2 aPos;
uniform mat3 uMatrix;
uniform vec4 uUvRect;
out vec2 vUv;
void main(){
  vec3 p = uMatrix * vec3(aPos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  vUv = mix(uUvRect.xy, uUvRect.zw, aPos);
}`;

export const FULLSCREEN = new Float32Array([2, 0, 0, 0, 2, 0, -1, -1, 1]);

export class GLContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  private vao: WebGLVertexArrayObject;
  private programs = new Map<string, ProgramInfo>();
  private pool: Target[] = [];
  private inUse = new Set<Target>();
  dummy2D: WebGLTexture;
  dummy3D: WebGLTexture;
  lost = false;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true,
      powerPreference: 'high-performance', desynchronized: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 no está disponible en este navegador. Usa Chrome, Edge o Firefox actualizados.');
    this.gl = gl;
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    (canvas as HTMLCanvasElement).addEventListener?.('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    this.dummy2D = this.createTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    this.dummy3D = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, this.dummy3D);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  createTexture(filter: number = this.gl.LINEAR): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  upload(tex: WebGLTexture, source: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  uploadR8(tex: WebGLTexture, data: Uint8Array, w: number, h: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  uploadRGBA(tex: WebGLTexture, data: Uint8Array, w: number, h: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  create3DLut(data: Float32Array | number[], size: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, t);
    const u8 = new Uint8Array(size * size * size * 4);
    for (let i = 0, n = size * size * size; i < n; i++) {
      u8[i * 4] = Math.max(0, Math.min(255, Math.round(data[i * 3] * 255)));
      u8[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(data[i * 3 + 1] * 255)));
      u8[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(data[i * 3 + 2] * 255)));
      u8[i * 4 + 3] = 255;
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, u8);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    return t;
  }

  acquire(w: number, h: number): Target {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const idx = this.pool.findIndex((t) => t.w === w && t.h === h);
    let t: Target;
    if (idx >= 0) { t = this.pool[idx]; this.pool.splice(idx, 1); }
    else {
      const gl = this.gl;
      const tex = this.createTexture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      t = { fbo, tex, w, h };
    }
    this.inUse.add(t);
    return t;
  }

  release(t: Target | null | undefined) {
    if (!t || !this.inUse.has(t)) return;
    this.inUse.delete(t);
    this.pool.push(t);
    // limitar memoria del pool (número de targets y bytes: importante en 4K/8K)
    let bytes = 0;
    for (const p of this.pool) bytes += p.w * p.h * 4;
    while (this.pool.length > 40 || (bytes > 640e6 && this.pool.length > 1)) {
      const old = this.pool.shift()!;
      bytes -= old.w * old.h * 4;
      this.gl.deleteFramebuffer(old.fbo);
      this.gl.deleteTexture(old.tex);
    }
  }

  releaseAll() {
    for (const t of [...this.inUse]) this.release(t);
  }

  program(name: string, fs: string): ProgramInfo {
    let p = this.programs.get(name);
    if (p) return p;
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        throw new Error(`Error de shader (${name}): ${log}`);
      }
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Error al enlazar ${name}: ${gl.getProgramInfoLog(prog)}`);
    const uniforms = new Map<string, { loc: WebGLUniformLocation; type: number; size: number }>();
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i)!;
      const uname = info.name.replace(/\[0\]$/, '');
      const loc = gl.getUniformLocation(prog, info.name);
      if (loc) uniforms.set(uname, { loc, type: info.type, size: info.size });
    }
    p = { prog, uniforms };
    this.programs.set(name, p);
    return p;
  }

  /** Ejecuta un pase: dibuja un quad con el programa dado en el target (null = pantalla). */
  run(
    p: ProgramInfo,
    target: Target | null,
    uniforms: Record<string, UniformValue>,
    textures: Record<string, TexBinding | WebGLTexture>,
    opts: { clear?: boolean | [number, number, number, number]; blend?: 'premult' | 'none'; viewport?: [number, number, number, number] } = {},
  ) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    const w = target ? target.w : (this.canvas as HTMLCanvasElement).width;
    const h = target ? target.h : (this.canvas as HTMLCanvasElement).height;
    if (opts.viewport) gl.viewport(...opts.viewport); else gl.viewport(0, 0, w, h);
    if (opts.clear) {
      const c = Array.isArray(opts.clear) ? opts.clear : [0, 0, 0, 0];
      gl.clearColor(c[0], c[1], c[2], c[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (opts.blend === 'premult') {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else gl.disable(gl.BLEND);
    gl.useProgram(p.prog);
    gl.bindVertexArray(this.vao);
    const all: Record<string, UniformValue> = { uMatrix: FULLSCREEN, uUvRect: [0, 0, 1, 1], ...uniforms };
    for (const [name, value] of Object.entries(all)) {
      const u = p.uniforms.get(name);
      if (!u) continue;
      this.setUniform(u.loc, u.type, value);
    }
    let unit = 0;
    for (const [name, b] of Object.entries(textures)) {
      const u = p.uniforms.get(name);
      if (!u) continue;
      const binding: TexBinding = (b as TexBinding).tex ? (b as TexBinding) : { tex: b as WebGLTexture };
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(binding.is3D ? gl.TEXTURE_3D : gl.TEXTURE_2D, binding.tex);
      gl.uniform1i(u.loc, unit);
      unit++;
    }
    // asignar texturas vacías a samplers no provistos (evita errores de validación)
    for (const [name, u] of p.uniforms) {
      if (textures[name]) continue;
      if (u.type === gl.SAMPLER_2D || u.type === gl.SAMPLER_3D) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(u.type === gl.SAMPLER_3D ? gl.TEXTURE_3D : gl.TEXTURE_2D, u.type === gl.SAMPLER_3D ? this.dummy3D : this.dummy2D);
        gl.uniform1i(u.loc, unit);
        unit++;
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private setUniform(loc: WebGLUniformLocation, type: number, v: UniformValue) {
    const gl = this.gl;
    switch (type) {
      case gl.FLOAT:
        if (typeof v === 'number' || typeof v === 'boolean') gl.uniform1f(loc, Number(v));
        else gl.uniform1fv(loc, v as Float32List);
        break;
      case gl.INT: case gl.BOOL:
        if (typeof v === 'number' || typeof v === 'boolean') gl.uniform1i(loc, Number(v));
        else gl.uniform1iv(loc, Array.from(v as number[]).map((x) => Math.round(x)));
        break;
      case gl.FLOAT_VEC2: gl.uniform2fv(loc, v as Float32List); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(loc, v as Float32List); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(loc, v as Float32List); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(loc, false, v as Float32List); break;
      default: break;
    }
  }

  readPixels(target: Target, out?: Uint8Array): Uint8Array {
    const gl = this.gl;
    const buf = out || new Uint8Array(target.w * target.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.readPixels(0, 0, target.w, target.h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  }

  deleteTexture(t: WebGLTexture | null | undefined) { if (t) this.gl.deleteTexture(t); }
}

/** Matriz 3x3 (column-major) que mapea el quad unitario a un rectángulo rotado en píxeles del lienzo → clip space. */
export function quadMatrix(W: number, H: number, cx: number, cy: number, w: number, h: number, rotDeg: number): Float32Array {
  const r = (rotDeg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  // p_px = C + R * S * (aPos - 0.5)
  // clip = p_px / (W,H) * 2 - 1
  const a = (c * w) * 2 / W, b = (s * w) * 2 / H; // columna x
  const d = (-s * h) * 2 / W, e = (c * h) * 2 / H; // columna y
  const tx = (cx - 0.5 * c * w + 0.5 * s * h) * 2 / W - 1;
  const ty = (cy - 0.5 * s * w - 0.5 * c * h) * 2 / H - 1;
  return new Float32Array([a, b, 0, d, e, 0, tx, ty, 1]);
}
