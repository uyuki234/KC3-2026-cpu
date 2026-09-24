export default function ResourceIcon({ name }: { name: 'x' | 'slides' | 'github' | 'event' }) {
  return (
    <svg
      className="resource-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'x' && <path d="M5 4h4l10 16h-4L5 4Zm14 0L5 20" />}
      {name === 'slides' && (
        <>
          <path d="M3 3h18M12 16v5m-4 0 4-3 4 3" />
          <rect x="4" y="3" width="16" height="13" rx="1" />
          <path d="m10 7 5 3-5 3Z" />
        </>
      )}
      {name === 'github' && (
        <>
          <path d="M8 21v-4c-4 1-4-2-6-2m14 6v-4c0-1-.3-1.7-1-2 4-.5 6-2 6-5 0-1.6-.6-2.7-1.5-3.5.2-.8.2-2-.5-3.5-1.5 0-3 1-4 1.5a12 12 0 0 0-6 0C8 4 6.5 3 5 3c-.7 1.5-.7 2.7-.5 3.5C3.6 7.3 3 8.4 3 10c0 3 2 4.5 6 5-.7.3-1 1-1 2" />
        </>
      )}
      {name === 'event' && (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 3h2" />
        </>
      )}
    </svg>
  );
}
