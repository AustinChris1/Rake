// The RAKE mark: a croupier's rake mid-pull, dragging chips off the table -
// the house collecting its cut of the pot.
export default function Mark({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="5" strokeLinecap="round">
        <path d="M48 9 L26 37" />
        <path d="M10 42 L38 42" />
      </g>
      <g fill="currentColor">
        <circle cx="16" cy="52" r="5" />
        <circle cx="29" cy="53" r="5" />
      </g>
      <circle cx="45" cy="54" r="5" stroke="currentColor" strokeWidth="3" fill="none" />
    </svg>
  );
}
