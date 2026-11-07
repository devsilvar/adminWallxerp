/**
 * Hand-drawn style arrow component
 * Adds playful, sketchy arrow decorations
 */

interface HandDrawnArrowProps {
  className?: string;
  color?: string;
  direction?: 'right' | 'down' | 'left' | 'up';
}

export default function HandDrawnArrow({ 
  className = '', 
  color = '#7c3aed',
  direction = 'right'
}: HandDrawnArrowProps) {
  const rotations = {
    right: 0,
    down: 90,
    left: 180,
    up: 270,
  };

  return (
    <svg 
      className={className} 
      width="60" 
      height="40" 
      viewBox="0 0 60 40" 
      fill="none"
      style={{ transform: `rotate(${rotations[direction]}deg)` }}
      aria-hidden="true"
    >
      {/* Squiggly arrow line */}
      <path
        d="M5 20 Q15 18, 25 20 T45 20 L50 20"
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Arrow head - hand-drawn style */}
      <path
        d="M45 13 L54 20 L45 27"
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      {/* Subtle second line for depth */}
      <path
        d="M6 22 Q16 20, 26 22 T46 22"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
}
