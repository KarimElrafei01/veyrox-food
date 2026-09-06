import type { Direction } from '@veyroxai/i18n';

/**
 * Apply direction and language to the document. Called by every SPA shell so RTL
 * is correct from the first paint (CLAUDE.md — Non-negotiables).
 */
export function applyDocumentDirection(doc: Document, lang: string, direction: Direction): void {
  doc.documentElement.lang = lang;
  doc.documentElement.dir = direction;
}

/** Map a logical start/end to a physical side for the given direction. */
export function physicalSide(logical: 'start' | 'end', direction: Direction): 'left' | 'right' {
  const startIsLeft = direction === 'ltr';
  if (logical === 'start') {
    return startIsLeft ? 'left' : 'right';
  }
  return startIsLeft ? 'right' : 'left';
}
