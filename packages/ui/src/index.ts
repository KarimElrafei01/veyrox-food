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

// — React bindings —
export { LocaleProvider, useT } from './react/LocaleProvider.js';
export { ThemeProvider, useTheme, type ThemeName } from './react/ThemeProvider.js';
export { T } from './react/T.js';

// — icons —
export { Icon, type IconName } from './icons/Icon.js';

// — primitives —
export { Button } from './primitives/Button/Button.js';
export { IconButton } from './primitives/IconButton/IconButton.js';
export { Chip } from './primitives/Chip/Chip.js';
export { Card } from './primitives/Card/Card.js';
export { Badge } from './primitives/Badge/Badge.js';
export { Price } from './primitives/Price/Price.js';
export { Spinner } from './primitives/Spinner/Spinner.js';
export { Stepper } from './primitives/Stepper/Stepper.js';
export {
  RadioCardGroup,
  type RadioCardOption,
} from './primitives/RadioCardGroup/RadioCardGroup.js';
export { Field, TextInput } from './primitives/Field/Field.js';
export { Stack, Inline, Screen, StickyBar } from './primitives/Layout/Layout.js';
export { AppHeader } from './primitives/AppHeader/AppHeader.js';
export { Alert, EmptyState, Skeleton, StatusDot } from './primitives/Feedback/Feedback.js';
export {
  ProgressTracker,
  type ProgressStep,
} from './primitives/ProgressTracker/ProgressTracker.js';
export { BottomSheet } from './primitives/BottomSheet/BottomSheet.js';
