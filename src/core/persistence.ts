import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import type { MediaAsset, Project } from '../types';
import { blobs, createAsset, ensureImageLoaded } from './media';
import { getState, useEditor } from '../store/editor';
import { debounce } from './utils';

const DB = 'novacut-studio';
const VER = 1;
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}

export interface StoredProject {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  duration: number;
  thumb?: string;
  project: Project;
  assets: Omit<MediaAsset, 'url'>[];
}

export async function saveBlob(id: string, blob: Blob) {
  try { await tx('blobs', 'readwrite', (s) => s.put(blob, id)); } catch (e) { console.warn('No se pudo guardar el medio', e); }
}

export async function saveProjectNow() {
  const st = getState();
  const p = st.project;
  const assets = Object.values(st.assets).map(({ url, ...rest }) => rest);
  const thumb = Object.values(st.assets).find((a) => a.thumbnail)?.thumbnail;
  const duration = p.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const rec: StoredProject = { id: p.id, name: p.name, updatedAt: Date.now(), width: p.width, height: p.height, duration, thumb, project: p, assets };
  await tx('projects', 'readwrite', (s) => s.put(rec));
  try { localStorage.setItem('novacut:last', p.id); } catch { /* noop */ }
}

export async function listProjects(): Promise<StoredProject[]> {
  try {
    const all = await tx<StoredProject[]>('projects', 'readonly', (s) => s.getAll() as IDBRequest<StoredProject[]>);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export async function deleteProject(id: string) {
  const rec = await tx<StoredProject | undefined>('projects', 'readonly', (s) => s.get(id) as IDBRequest<StoredProject | undefined>);
  await tx('projects', 'readwrite', (s) => s.delete(id));
  // borrar blobs que ningún otro proyecto usa
  if (rec) {
    const others = await listProjects();
    const used = new Set(others.flatMap((o) => o.assets.map((a) => a.id)));
    for (const a of rec.assets) if (!used.has(a.id)) await tx('blobs', 'readwrite', (s) => s.delete(a.id));
  }
}

export async function openProject(id: string): Promise<boolean> {
  const rec = await tx<StoredProject | undefined>('projects', 'readonly', (s) => s.get(id) as IDBRequest<StoredProject | undefined>);
  if (!rec) return false;
  const assets: Record<string, MediaAsset> = {};
  for (const meta of rec.assets) {
    const blob = await tx<Blob | undefined>('blobs', 'readonly', (s) => s.get(meta.id) as IDBRequest<Blob | undefined>);
    if (!blob) { assets[meta.id] = { ...meta, url: '', status: 'error', error: 'Archivo no encontrado en el almacenamiento local' } as MediaAsset; continue; }
    blobs.set(meta.id, blob);
    const a = { ...meta, url: URL.createObjectURL(blob) } as MediaAsset;
    if (a.kind === 'image') await ensureImageLoaded(a).catch(() => null);
    assets[meta.id] = a;
  }
  getState().loadProject(migrate(rec.project), assets);
  return true;
}

export function migrate(p: Project): Project {
  p.luts ??= [];
  p.trackings ??= [];
  p.markers ??= [];
  p.background ??= { type: 'color', color: '#000000', color2: '#1b1f2a', blur: 40 };
  return p;
}

export async function restoreLast(): Promise<boolean> {
  let id: string | null = null;
  try { id = localStorage.getItem('novacut:last'); } catch { /* noop */ }
  if (!id) return false;
  return openProject(id).catch(() => false);
}

/** Autoguardado: cada cambio del proyecto o medios se guarda con un pequeño retraso. */
export function startAutosave() {
  const save = debounce(() => { saveProjectNow().catch((e) => console.warn('Autoguardado falló', e)); }, 1200);
  useEditor.subscribe((s, prev) => {
    if (s.project !== prev.project || s.assets !== prev.assets) {
      if (s.project.clips.length || Object.keys(s.assets).length) save();
    }
  });
  window.addEventListener('beforeunload', () => { saveProjectNow().catch(() => null); });
}

// ------------------------------------------------------------------ Paquete .cancut (zip; también abre .novacut)
export async function exportPackage(): Promise<Blob> {
  const st = getState();
  const files: Record<string, Uint8Array> = {};
  const assets = Object.values(st.assets).map(({ url, ...rest }) => rest);
  files['project.json'] = strToU8(JSON.stringify({ app: 'CanCut', version: 1, project: st.project, assets }, null, 0));
  for (const a of assets) {
    const b = blobs.get(a.id);
    if (b) files[`media/${a.id}`] = new Uint8Array(await b.arrayBuffer());
  }
  const data = await new Promise<Uint8Array>((res, rej) => zip(files, { level: 0 }, (err, out) => (err ? rej(err) : res(out))));
  return new Blob([data as BlobPart], { type: 'application/zip' });
}

export async function importPackage(file: File): Promise<void> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let projectJson: any;
  let media: Record<string, Uint8Array> = {};
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const files = await new Promise<Record<string, Uint8Array>>((res, rej) => unzip(buf, (err, out) => (err ? rej(err) : res(out))));
    projectJson = JSON.parse(strFromU8(files['project.json']));
    media = files;
  } else {
    projectJson = JSON.parse(strFromU8(buf));
  }
  const project: Project = migrate(projectJson.project || projectJson);
  const assets: Record<string, MediaAsset> = {};
  for (const meta of (projectJson.assets || []) as MediaAsset[]) {
    const data = media[`media/${meta.id}`];
    if (!data) { assets[meta.id] = { ...meta, url: '', status: 'error', error: 'Medio no incluido: vuelve a importarlo' }; continue; }
    const blob = new Blob([data as BlobPart], { type: meta.mime });
    blobs.set(meta.id, blob);
    await saveBlob(meta.id, blob);
    const a: MediaAsset = { ...meta, url: URL.createObjectURL(blob) };
    if (a.kind === 'image') await ensureImageLoaded(a).catch(() => null);
    assets[meta.id] = a;
  }
  getState().loadProject(project, assets);
  await saveProjectNow();
}

export { createAsset };
