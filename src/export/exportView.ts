// Saves exactly what is on screen in the tree area (current zoom, position, dragged boxes,
// language) as a PNG. The zoom buttons and attribution are left out.
import { toPng } from 'html-to-image';

const EXCLUDED = ['react-flow__controls', 'react-flow__attribution', 'react-flow__minimap'];

export async function exportVisibleTree(container: HTMLElement, fileName: string): Promise<void> {
  const dataUrl = await toPng(container, {
    pixelRatio: Math.max(2, window.devicePixelRatio || 1), // sharp enough to print
    backgroundColor: '#fafaf9',
    cacheBust: true,
    filter: (node) => !(node instanceof HTMLElement && EXCLUDED.some((c) => node.classList.contains(c))),
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function exportFileName(familyName: string, view: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safe = familyName.replace(/[\\/:*?"<>|]+/g, '').trim() || 'family-tree';
  return `${safe} - ${view} - ${date}.png`;
}
