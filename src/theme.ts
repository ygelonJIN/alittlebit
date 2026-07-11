export type ThemeMode = 'dark' | 'light';

function normalizeHex(hex: string): string | null {
  const value = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    return value.split('').map((c) => c + c).join('');
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) return value;
  return null;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return [r, g, b];
}

export function applyAccentColor(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const root = document.documentElement;
  root.style.setProperty('--accent-r', String(rgb[0]));
  root.style.setProperty('--accent-g', String(rgb[1]));
  root.style.setProperty('--accent-b', String(rgb[2]));
  return true;
}

export function applyThemeMode(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}
