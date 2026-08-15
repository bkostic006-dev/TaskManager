/**
 * The six glyphs the dashboard needs, drawn inline.
 *
 * Mantine ships no icon set and the design source names `@tabler/icons-react`,
 * which would be a new dependency for six shapes — so they are stroked paths on
 * `currentColor` instead, inheriting whatever colour the control they sit in
 * already has. All decorative: every one is inside a control that carries its
 * own accessible name, so they are `aria-hidden`.
 */

function Glyph({ size = 16, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconSearch({ size }: { size?: number }) {
  return (
    <Glyph size={size}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </Glyph>
  );
}

export function IconPlus({ size }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  );
}

export function IconCheck({ size }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Glyph>
  );
}

export function IconSort({ size }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M7 4v16M7 20l-3-3M17 20V4M17 4l3 3" />
    </Glyph>
  );
}

export function IconPencil({ size }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14.5 6.5 3 3" />
    </Glyph>
  );
}

export function IconTrash({ size }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Glyph>
  );
}
