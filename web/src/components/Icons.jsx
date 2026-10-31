// Inline icons. aria-hidden by default; the button or link carries the name.
const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
})

export function Paw({ size = 20, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" {...rest}>
      <g fill="currentColor">
        <ellipse cx="32" cy="42" rx="14" ry="12" />
        <ellipse cx="15" cy="27" rx="6" ry="7.5" transform="rotate(-18 15 27)" />
        <ellipse cx="25.5" cy="17" rx="6" ry="7.5" transform="rotate(-6 25.5 17)" />
        <ellipse cx="38.5" cy="17" rx="6" ry="7.5" transform="rotate(6 38.5 17)" />
        <ellipse cx="49" cy="27" rx="6" ry="7.5" transform="rotate(18 49 27)" />
      </g>
    </svg>
  )
}

export const Search = ({ size = 18 }) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

export const Close = ({ size = 22 }) => (
  <svg {...base(size)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const Check = ({ size = 20 }) => (
  <svg {...base(size)} strokeWidth={3}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

export const Share = ({ size = 18 }) => (
  <svg {...base(size)}>
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
)

export const LinkIcon = ({ size = 18 }) => (
  <svg {...base(size)}>
    <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </svg>
)

export const Mail = ({ size = 18 }) => (
  <svg {...base(size)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 6.5 8.5 7 8.5-7" />
  </svg>
)

export const Chat = ({ size = 18 }) => (
  <svg {...base(size)}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.7A8 8 0 1 1 21 12Z" />
  </svg>
)

export const Facebook = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="#1877F2"
      d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z"
    />
  </svg>
)

export const XLogo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4Zm-1.2 17.9h1.9L7.1 4.2H5.1l11.9 16Z"
    />
  </svg>
)

export const Calendar = ({ size = 18 }) => (
  <svg {...base(size)}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
)

export const Clock = ({ size = 18 }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const Trophy = ({ size = 22 }) => (
  <svg {...base(size)}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </svg>
)

// Two r4.5 lobes meeting at a notch, with straight sides drawn tangent to
// them down to the point. Outline when off, filled when on.
export const Heart = ({ size = 18, filled = false }) => (
  <svg {...base(size)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 6.94A4.5 4.5 0 1 0 4.6 11.95L12 20.5l7.4-8.55A4.5 4.5 0 1 0 12 6.94Z" />
  </svg>
)

export const Refresh = ({ size = 18 }) => (
  <svg {...base(size)}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
  </svg>
)

export const Camera = ({ size = 28 }) => (
  <svg {...base(size)}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </svg>
)

export const Arrow = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
