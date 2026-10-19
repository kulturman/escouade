// « Affichage › Taille de l'interface »: the whole window zoomed by the WebView (its text, its spacing, its terminals),
// as a browser's zoom; the editor's own text size (Ctrl+Shift+. / Ctrl+Shift+,) comes on top of it.

export const ZOOMS = [0.9, 1, 1.1, 1.2, 1.3, 1.5];
export const DEFAULT_ZOOM = 1.1;

let applied = 0;

/** Zooms the window to `scale`; outside the app's window (the tests), nothing. */
export async function applyZoom(scale: number | undefined) {
  const z = scale && scale > 0 ? scale : DEFAULT_ZOOM;
  if (z === applied) return;
  applied = z;
  try {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview');
    await getCurrentWebview().setZoom(z);
  } catch {
    applied = 0;
  }
}
