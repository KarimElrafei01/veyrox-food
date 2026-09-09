import { ICON_PATHS, type IconName } from './paths.js';

export type { IconName };

interface IconProps {
  name: IconName;
  /** Accessible label. Omit for decorative icons (rendered aria-hidden). */
  label?: string;
  /** Size in px. Default 20. */
  size?: number;
  className?: string;
}

export function Icon({ name, label, size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
