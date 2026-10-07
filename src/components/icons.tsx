type IconProps = { className?: string };

export function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PeopleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 19c0-2.9 2.5-5 5.5-5s5.5 2.1 5.5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="8.5" r="2.3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M15 14.3c2.6.3 4.5 2.1 4.5 4.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 4.5c-2.5 0-4.5 2-4.5 4.5v2.8c0 .6-.2 1.1-.6 1.6l-1 1.2c-.6.7-.1 1.9.9 1.9h10.4c1 0 1.5-1.2.9-1.9l-1-1.2a2.3 2.3 0 0 1-.6-1.6V9c0-2.5-2-4.5-4.5-4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10.3 19a1.9 1.9 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function QrIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="6" y="6" width="1" height="1" fill="currentColor" />
      <rect x="17" y="6" width="1" height="1" fill="currentColor" />
      <rect x="6" y="17" width="1" height="1" fill="currentColor" />
      <path d="M14.5 14.5h2.5v2.5h-2.5zM19.5 14.5h1v1h-1zM14.5 19.5h1v1h-1zM17.5 17.5h1v1h-1zM19.5 19.5h1v1h-1z" fill="currentColor" />
    </svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 21s-6.5-5.8-6.5-10.8a6.5 6.5 0 1 1 13 0C18.5 15.2 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
