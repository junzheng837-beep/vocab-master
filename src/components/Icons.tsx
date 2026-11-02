interface IconProps {
  size?: number
  className?: string
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export function IconHome({ size = 17, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </svg>
  )
}

export function IconStudy({ size = 17, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4Z" />
      <path d="M6 10.8V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.2" />
    </svg>
  )
}

export function IconBooks({ size = 17, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="5" height="16" rx="1.4" />
      <rect x="9.5" y="4" width="5" height="16" rx="1.4" />
      <path d="m16.6 5.6 3.4 14.1" />
    </svg>
  )
}

export function IconChart({ size = 17, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </svg>
  )
}

export function IconSettings({ size = 17, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.55-1H1a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 3 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 7 4.6h.09A1.7 1.7 0 0 0 8.5 3V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.6 1.41H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </svg>
  )
}

export function IconPlus({ size = 17, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconChevronLeft({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m14.5 5-6 7 6 7" />
    </svg>
  )
}

export function IconChevronRight({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m9.5 5 6 7-6 7" />
    </svg>
  )
}

export function IconSpeaker({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M11 5 6.5 8.8H3v6.4h3.5L11 19V5Z" />
      <path d="M15 9.2a4 4 0 0 1 0 5.6" />
      <path d="M17.6 6.6a7.6 7.6 0 0 1 0 10.8" />
    </svg>
  )
}

export function IconCheck({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={2.6}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  )
}

export function IconTrash({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3.5 6.5h17" />
      <path d="M8.5 6.5V4.2c0-.7.5-1.2 1.2-1.2h4.6c.7 0 1.2.5 1.2 1.2v2.3" />
      <path d="M6 6.5 7 19.4c.06.9.8 1.6 1.7 1.6h6.6c.9 0 1.64-.7 1.7-1.6L18 6.5" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </svg>
  )
}

export function IconSparkle({ size = 17, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
      <path d="M18.5 16.5 19.2 19l2.5.7-2.5.7-.7 2.5" />
    </svg>
  )
}

export function IconRefresh({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 12a8 8 0 1 1-2.5-5.8" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  )
}

export function IconInfo({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6v.1" />
    </svg>
  )
}

export function IconMoon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20.5 14.3A8.5 8.5 0 1 1 9.7 3.5a6.8 6.8 0 0 0 10.8 10.8Z" />
    </svg>
  )
}

export function IconSun({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6" />
    </svg>
  )
}
