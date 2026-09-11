type PreparationStyle = 'iced' | 'blended' | 'hot';

interface PreparationIconProps {
  style: PreparationStyle;
  size?: number;
}

/**
 * Lucide-style icons stay inline because the customer webview needs
 * resilient icons without adding an icon-font request or a runtime dependency.
 */
export function PreparationIcon({ style, size = 26 }: PreparationIconProps): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.85"
      viewBox="0 0 24 24"
      width={size}
    >
      {style === 'iced' ? (
        <>
          <path d="M5 3h14l-1.1 14.1A4 4 0 0 1 13.9 21h-3.8a4 4 0 0 1-4-3.9Z" />
          <path d="M5.7 10h12.6" />
          <path d="m9 14 1.4 1.4L9 16.8 7.6 15.4Zm5.5 1.7 1.4 1.4-1.4 1.4-1.4-1.4Z" />
        </>
      ) : style === 'blended' ? (
        <>
          <path d="M8 3h8" />
          <path d="M10 3v4l-3 8.7A4 4 0 0 0 10.8 21h2.4a4 4 0 0 0 3.8-5.3L14 7V3" />
          <path d="M8.8 11h6.4M9.6 15h4.8" />
          <path d="M11 7.5h2" />
        </>
      ) : (
        <>
          <path d="M3 9h14v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
          <path d="M17 11h1a3 3 0 1 1 0 6h-1" />
          <path d="M7 5c0-1 .8-1.5.8-2.5M12 5c0-1 .8-1.5.8-2.5" />
        </>
      )}
    </svg>
  );
}

export function preparationStyle(optionName: string): PreparationStyle {
  const name = optionName.toLowerCase();
  if (name.includes('blend') || name.includes('crushed')) {
    return 'blended';
  }
  if (name.includes('ice') || name.includes('iced')) {
    return 'iced';
  }
  return 'hot';
}
