// The colors of the UI surfaces: IntelliJ's « Dark » theme (its new UI), the same for every project.

/** IntelliJ's « Dark »: the editor's gray, the tool windows' one, their borders, the blue accent. */
export const DARK: Record<string, string> = {
  '--accent': '#3574F0',
  '--accent-soft': 'rgba(53, 116, 240, 0.38)',
  '--accent-ink': '#FFFFFF',
  '--bg': '#1E1F22',
  '--panel': '#2B2D30',
  '--elev': '#393B40',
  '--elev2': '#43454A',
  '--user': '#2B2D30',
  '--line': 'rgba(255, 255, 255, 0.08)',
  '--line2': 'rgba(255, 255, 255, 0.15)',
  '--term': '#1E1F22',
};

export const PROJECT_COLORS = [48, 300, 200, 150, 250, 0, 25, 70, 110, 175, 225, 275, 325]
  .map((h) => `oklch(0.72 0.12 ${h})`)
  .concat(['oklch(0.8 0.02 60)']);

let applied = '';

/**
 * The surfaces and the accent: Escouade K's theme, after IntelliJ's « Dark » (its new UI). The project's color no longer
 * tints them (it stays on the project's swatch): `color` is taken for the API's sake only.
 */
export function applyTheme(color: string | null) {
  void color;
  if (applied === 'intellij') return;
  applied = 'intellij';
  const st = document.documentElement.style;
  for (const [name, value] of Object.entries(DARK)) st.setProperty(name, value);
}

/** Resolved background color for canvases that cannot read CSS variables (xterm WebGL). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
