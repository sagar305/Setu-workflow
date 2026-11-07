// The Setu arch and "Setu." wordmark, as on setutechnology.com
// (Setu_main/components/Logo.tsx), with the product name under it.
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
    >
      <path
        d="M18 98 L18 56 C18 40 28 31 46 31 L74 31 C92 31 102 40 102 56 L102 98"
        fill="none"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <>
      <LogoMark size={size} />
      <span className="brand-word">
        <span className="brand-name">
          Setu<span className="brand-dot">.</span>
        </span>
        <span className="brand-sub">Workflow</span>
      </span>
    </>
  );
}
