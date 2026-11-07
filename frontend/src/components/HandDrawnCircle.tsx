/**
 * Hand-drawn style decorative circle component
 * Adds organic, imperfect SVG elements for visual interest
 */

interface HandDrawnCircleProps {
  className?: string;
  color?: string;
  size?: number;
}

export default function HandDrawnCircle({ 
  className = '', 
  color = '#7c3aed',
  size = 100 
}: HandDrawnCircleProps) {
  return (
    <svg 
      className={className} 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none"
      aria-hidden="true"
    >
      {/* Hand-drawn imperfect circle */}
      <path
        d="M50 5 C75 5, 95 25, 95 50 C95 75, 75 96, 50 95 C25 94, 6 75, 5 50 C4 25, 24 5, 50 5"
        stroke={color}
        strokeWidth="2"
        fill="none"
        opacity="0.4"
        strokeLinecap="round"
        strokeDasharray="2 4"
      />
      {/* Secondary offset circle */}
      <path
        d="M50 10 C70 10, 90 30, 90 50 C90 70, 70 91, 50 90 C30 89, 11 70, 10 50 C9 30, 29 10, 50 10"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        opacity="0.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
