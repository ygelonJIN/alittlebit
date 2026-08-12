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

function mixHex(fg: [number, number, number], bg: [number, number, number], ratio: number): string {
  const mix = (i: number) => Math.round(fg[i] * ratio + bg[i] * (1 - ratio));
  return '#' + [mix(0), mix(1), mix(2)].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function applyAccentColor(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const root = document.documentElement;
  root.style.setProperty('--accent-r', String(rgb[0]));
  root.style.setProperty('--accent-g', String(rgb[1]));
  root.style.setProperty('--accent-b', String(rgb[2]));
  // 5 opaque accent variants
  const isDark = document.documentElement.dataset.theme !== 'light';
  const bg: [number, number, number] = isDark ? [6, 9, 18] : [245, 245, 245];
  root.style.setProperty('--accent-solid', `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
  root.style.setProperty('--accent-0', mixHex(rgb, bg, 0.35));
  root.style.setProperty('--accent-1', mixHex(rgb, bg, 0.25));
  root.style.setProperty('--accent-2', mixHex(rgb, bg, 0.15));
  root.style.setProperty('--accent-3', mixHex(rgb, bg, 0.10));
  const white: [number, number, number] = [255, 255, 255];
  root.style.setProperty('--accent-bright', mixHex(rgb, white, 0.65));
  return true;
}

export function applyThemeMode(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  // Re-compute accent variants since bg color differs between dark/light
  const root = document.documentElement;
  const r = parseInt(root.style.getPropertyValue('--accent-r')) || 124;
  const g = parseInt(root.style.getPropertyValue('--accent-g')) || 58;
  const b = parseInt(root.style.getPropertyValue('--accent-b')) || 237;
  const bg: [number, number, number] = theme === 'dark' ? [6, 9, 18] : [245, 245, 245];
  root.style.setProperty('--accent-0', mixHex([r, g, b], bg, 0.35));
  root.style.setProperty('--accent-1', mixHex([r, g, b], bg, 0.25));
  root.style.setProperty('--accent-2', mixHex([r, g, b], bg, 0.15));
  root.style.setProperty('--accent-3', mixHex([r, g, b], bg, 0.10));
  const white: [number, number, number] = [255, 255, 255];
  root.style.setProperty('--accent-bright', mixHex([r, g, b], white, 0.65));
}
