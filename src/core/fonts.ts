// Biblioteca de tipografías: Google Fonts (carga bajo demanda), fuentes del sistema y fuentes personalizadas.

export type FontCategory = 'Sans' | 'Serif' | 'Display' | 'Manuscrita' | 'Mono' | 'Sistema' | 'Personalizada';
export interface FontEntry { family: string; category: FontCategory; google?: boolean; weights?: string }

const G = (category: FontCategory, list: string[]): FontEntry[] => list.map((family) => ({ family, category, google: true }));

export const GOOGLE_FONTS: FontEntry[] = [
  ...G('Sans', ['Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins', 'Lato', 'Nunito', 'Raleway', 'Work Sans', 'Rubik', 'Manrope', 'DM Sans', 'Outfit', 'Plus Jakarta Sans', 'Figtree', 'Urbanist', 'Kanit', 'Mulish', 'Barlow', 'Barlow Condensed', 'Oswald', 'Archivo', 'Archivo Black', 'Heebo', 'IBM Plex Sans', 'Source Sans 3', 'Noto Sans', 'Ubuntu', 'Quicksand', 'Josefin Sans', 'Exo 2', 'Titillium Web', 'Hind', 'Fira Sans', 'PT Sans', 'Cabin', 'Karla', 'Space Grotesk', 'Sora', 'Lexend', 'Red Hat Display', 'Be Vietnam Pro', 'Jost', 'Assistant', 'Saira', 'Saira Condensed', 'Asap', 'Signika', 'Catamaran', 'Maven Pro', 'Varela Round', 'Comfortaa', 'M PLUS Rounded 1c', 'Prompt', 'Chakra Petch', 'Teko', 'Fjalla One', 'League Spartan', 'Syne', 'Epilogue', 'Albert Sans', 'Onest', 'Geologica', 'Golos Text', 'Instrument Sans', 'Wix Madefor Display', 'Encode Sans', 'Antonio', 'Big Shoulders Display', 'Pathway Gothic One', 'Yanone Kaffeesatz', 'Sofia Sans', 'Schibsted Grotesk', 'Bricolage Grotesque', 'Hanken Grotesk', 'Public Sans', 'Commissioner', 'Readex Pro']),
  ...G('Serif', ['Playfair Display', 'Merriweather', 'Lora', 'PT Serif', 'Libre Baskerville', 'EB Garamond', 'Cormorant Garamond', 'Crimson Text', 'Noto Serif', 'Roboto Slab', 'Source Serif 4', 'Bitter', 'Zilla Slab', 'Arvo', 'DM Serif Display', 'DM Serif Text', 'Abril Fatface', 'Prata', 'Cinzel', 'Cinzel Decorative', 'Bodoni Moda', 'Libre Caslon Text', 'Spectral', 'Alegreya', 'Cardo', 'Old Standard TT', 'Vollkorn', 'Frank Ruhl Libre', 'Domine', 'Rozha One', 'Yeseva One', 'Gloock', 'Fraunces', 'Instrument Serif', 'Young Serif', 'Marcellus', 'Italiana', 'Gilda Display', 'Tenor Sans', 'Newsreader', 'Literata', 'Noticia Text', 'Ultra', 'Alfa Slab One', 'Rokkitt', 'Josefin Slab', 'Bree Serif', 'Patua One']),
  ...G('Display', ['Bebas Neue', 'Anton', 'Bangers', 'Luckiest Guy', 'Lobster', 'Righteous', 'Russo One', 'Black Ops One', 'Bungee', 'Bungee Shade', 'Bungee Inline', 'Monoton', 'Press Start 2P', 'Audiowide', 'Orbitron', 'Rubik Glitch', 'Rubik Mono One', 'Rubik Bubbles', 'Rubik Wet Paint', 'Rubik Moonrocks', 'Fredoka', 'Titan One', 'Passion One', 'Alfa Slab One', 'Staatliches', 'Bowlby One', 'Bowlby One SC', 'Concert One', 'Carter One', 'Chewy', 'Creepster', 'Nosifer', 'Eater', 'Butcherman', 'Frijole', 'Special Elite', 'Fascinate', 'Faster One', 'Megrim', 'Monofett', 'Shrikhand', 'Paytone One', 'Lilita One', 'Sigmar One', 'Changa One', 'Racing Sans One', 'Poller One', 'Ewert', 'Wallpoet', 'Silkscreen', 'VT323', 'Vast Shadow', 'Codystar', 'Bungee Spice', 'Honk', 'Nabla', 'Climate Crisis', 'Tilt Warp', 'Tilt Prism', 'Unbounded', 'Dela Gothic One', 'Rampart One', 'Train One', 'Reggae One', 'Zen Dots', 'Michroma', 'Krona One', 'Major Mono Display', 'Limelight', 'Poiret One', 'Gruppo', 'Six Caps', 'Squada One', 'Sedgwick Ave Display', 'Rock Salt', 'Permanent Marker', 'Boogaloo', 'Bagel Fat One', 'Rammetto One', 'Coiny']),
  ...G('Manuscrita', ['Pacifico', 'Dancing Script', 'Great Vibes', 'Satisfy', 'Caveat', 'Caveat Brush', 'Kaushan Script', 'Sacramento', 'Allura', 'Alex Brush', 'Parisienne', 'Cookie', 'Yellowtail', 'Courgette', 'Shadows Into Light', 'Indie Flower', 'Amatic SC', 'Gloria Hallelujah', 'Patrick Hand', 'Kalam', 'Handlee', 'Architects Daughter', 'Homemade Apple', 'Mr Dafoe', 'Mrs Saint Delafield', 'Herr Von Muellerhoff', 'Pinyon Script', 'Tangerine', 'Marck Script', 'Nothing You Could Do', 'Reenie Beanie', 'Covered By Your Grace', 'Rock Salt', 'Just Another Hand', 'Neucha', 'Damion', 'Leckerli One', 'Merienda', 'Playball', 'Lobster Two', 'Berkshire Swash', 'Niconne', 'Italianno', 'Monsieur La Doulaise', 'Birthstone', 'Ephesis', 'Whisper', 'Licorice', 'Comforter', 'Ballet', 'Bad Script', 'Nanum Pen Script', 'Square Peg']),
  ...G('Mono', ['JetBrains Mono', 'Fira Code', 'Roboto Mono', 'Source Code Pro', 'IBM Plex Mono', 'Space Mono', 'Ubuntu Mono', 'Inconsolata', 'Courier Prime', 'DM Mono', 'Red Hat Mono', 'Azeret Mono', 'Martian Mono', 'Share Tech Mono', 'Anonymous Pro', 'Cutive Mono', 'Overpass Mono', 'Xanh Mono', 'Syne Mono', 'Nova Mono']),
];

export const SYSTEM_FONTS: FontEntry[] = [
  'Arial', 'Arial Black', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Impact', 'Georgia', 'Times New Roman',
  'Garamond', 'Palatino Linotype', 'Book Antiqua', 'Courier New', 'Lucida Console', 'Comic Sans MS', 'Calibri', 'Cambria', 'Candara', 'Consolas',
  'Franklin Gothic Medium', 'Gill Sans', 'Century Gothic', 'Futura', 'Optima', 'Didot', 'Brush Script MT', 'Copperplate', 'Papyrus', 'system-ui',
].map((family) => ({ family, category: 'Sistema' as FontCategory }));

const uniq = new Map<string, FontEntry>();
for (const f of [...GOOGLE_FONTS, ...SYSTEM_FONTS]) if (!uniq.has(f.family)) uniq.set(f.family, f);
export const ALL_FONTS: FontEntry[] = [...uniq.values()];

const loaded = new Set<string>();
const previewLoaded = new Set<string>();
const customFonts: FontEntry[] = [];
const localFonts: FontEntry[] = [];
const listeners = new Set<() => void>();

export function onFontsChanged(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function emit() { listeners.forEach((f) => f()); }

export function getFontList(): FontEntry[] {
  return [...customFonts, ...ALL_FONTS, ...localFonts];
}

function isGoogle(family: string) {
  return uniq.get(family)?.google === true;
}

/** Carga la familia completa (todos los pesos) para render. */
export function loadFont(family: string): Promise<void> {
  if (!family || loaded.has(family)) return Promise.resolve();
  loaded.add(family);
  if (!isGoogle(family)) return Promise.resolve();
  const enc = family.replace(/ /g, '+');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${enc}:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap`;
  const fallback = `https://fonts.googleapis.com/css2?family=${enc}&display=swap`;
  return new Promise((resolve) => {
    link.onload = async () => {
      try {
        await Promise.race([
          Promise.all([document.fonts.load(`400 48px "${family}"`), document.fonts.load(`700 48px "${family}"`)]),
          new Promise((r) => setTimeout(r, 4000)),
        ]);
      } catch { /* noop */ }
      emit();
      resolve();
    };
    link.onerror = () => {
      // Algunas familias no tienen todos los ejes: reintentar con la variante por defecto.
      link.href = fallback;
      link.onerror = () => resolve();
    };
    document.head.appendChild(link);
  });
}

/** Carga un subconjunto mínimo (solo el nombre) para la vista previa en el selector. */
export function loadFontPreview(family: string) {
  if (!isGoogle(family) || previewLoaded.has(family) || loaded.has(family)) return;
  previewLoaded.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}&text=${encodeURIComponent(family + 'Aa')}&display=swap`;
  document.head.appendChild(link);
}

export async function ensureFontsReady(families: string[]) {
  await Promise.all(families.map((f) => loadFont(f)));
  try { await document.fonts.ready; } catch { /* noop */ }
}

export async function addCustomFont(file: File): Promise<string> {
  const family = file.name.replace(/\.(ttf|otf|woff2?|ttc)$/i, '').replace(/[_-]+/g, ' ');
  const buf = await file.arrayBuffer();
  const face = new FontFace(family, buf);
  await face.load();
  (document.fonts as any).add(face);
  if (!customFonts.find((f) => f.family === family)) customFonts.unshift({ family, category: 'Personalizada' });
  loaded.add(family);
  emit();
  return family;
}

/** Usa la Local Font Access API (Chrome/Edge) para listar todas las fuentes instaladas. */
export async function loadSystemFonts(): Promise<number> {
  const q = (window as any).queryLocalFonts;
  if (!q) throw new Error('Tu navegador no permite listar las fuentes del sistema (usa Chrome o Edge).');
  const fonts: { family: string }[] = await q();
  const fams = new Set(fonts.map((f) => f.family));
  localFonts.length = 0;
  for (const family of fams) if (!uniq.has(family)) localFonts.push({ family, category: 'Sistema' });
  localFonts.sort((a, b) => a.family.localeCompare(b.family));
  emit();
  return localFonts.length;
}

export const FONT_CATEGORIES: FontCategory[] = ['Sans', 'Serif', 'Display', 'Manuscrita', 'Mono', 'Sistema', 'Personalizada'];
