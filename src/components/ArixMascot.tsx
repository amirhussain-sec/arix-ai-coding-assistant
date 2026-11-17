import {motion} from 'motion/react';
import {memo, useId} from 'react';
import {cn} from '../lib/utils';

interface ArixMascotProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  mood?: 'idle' | 'thinking' | 'happy';
  className?: string;
  animateFloat?: boolean;
}

const SIZE_MAP = {
  xs: 28,
  sm: 36,
  md: 56,
  lg: 88,
};

export const ArixMascot = memo(function ArixMascot({
  size = 'md',
  mood = 'idle',
  className,
  animateFloat = true,
}: ArixMascotProps) {
  const px = SIZE_MAP[size];
  const uid = useId();
  const headGradId = `${uid}-head`;
  const rimGradId = `${uid}-rim`;
  const visorGradId = `${uid}-visor`;
  const eyeGlowId = `${uid}-glow`;

  return (
    <motion.div
      className={cn('inline-flex items-center justify-center shrink-0', className)}
      animate={animateFloat ? {y: [0, -3.5, 0]} : undefined}
      transition={
        animateFloat
          ? {duration: 3.4, repeat: Infinity, ease: 'easeInOut'}
          : undefined
      }
      aria-hidden="true"
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={headGradId} x1="14" y1="18" x2="66" y2="70" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="55%" stopColor="#11182c" />
            <stop offset="100%" stopColor="#090d1a" />
          </linearGradient>
          <linearGradient id={rimGradId} x1="12" y1="20" x2="68" y2="68" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4f6bff" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id={visorGradId} x1="20" y1="30" x2="60" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#050811" />
            <stop offset="100%" stopColor="#0b1326" />
          </linearGradient>
          <filter id={eyeGlowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Antenna stem & cyan beacon */}
        <line
          x1="40"
          y1="20"
          x2="40"
          y2="10"
          stroke={`url(#${rimGradId})`}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <motion.circle
          cx="40"
          cy="8"
          r="4"
          fill="#06b6d4"
          animate={{opacity: [0.75, 1, 0.75], scale: [0.95, 1.08, 0.95]}}
          transition={{duration: 2.2, repeat: Infinity, ease: 'easeInOut'}}
          style={{transformOrigin: '40px 8px'}}
        />

        {/* Side ear sensors */}
        <rect x="7" y="34" width="6" height="16" rx="3" fill="#1e293b" stroke="#4f6bff" strokeOpacity="0.6" strokeWidth="1.2" />
        <rect x="67" y="34" width="6" height="16" rx="3" fill="#1e293b" stroke="#8b5cf6" strokeOpacity="0.6" strokeWidth="1.2" />

        {/* Main rounded robot head */}
        <rect
          x="13"
          y="20"
          width="54"
          height="46"
          rx="18"
          fill={`url(#${headGradId})`}
          stroke={`url(#${rimGradId})`}
          strokeWidth="2"
        />

        {/* Inner glossy visor */}
        <rect
          x="20"
          y="29"
          width="40"
          height="26"
          rx="11"
          fill={`url(#${visorGradId})`}
          stroke="rgba(148, 163, 184, 0.16)"
          strokeWidth="1"
        />

        {/* Subtle visor reflection */}
        <path
          d="M25 32.5H43"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Left & Right glowing cyan eyes with periodic blink */}
        <motion.g
          filter={`url(#${eyeGlowId})`}
          animate={{scaleY: [1, 1, 1, 0.08, 1, 1]}}
          transition={{
            duration: 4.5,
            repeat: Infinity,
            times: [0, 0.45, 0.88, 0.91, 0.94, 1],
            ease: 'easeInOut',
          }}
          style={{transformOrigin: '40px 41px'}}
        >
          {mood === 'happy' ? (
            <>
              <path
                d="M27.5 42.5C28.8 39 32.8 39 34 42.5"
                stroke="#06b6d4"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M46 42.5C47.2 39 51.2 39 52.5 42.5"
                stroke="#06b6d4"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <rect x="27" y="36.5" width="7" height="9.5" rx="3.5" fill="#06b6d4" />
              <circle cx="29.4" cy="39.2" r="1.2" fill="#e0f2fe" />
              <rect x="46" y="36.5" width="7" height="9.5" rx="3.5" fill="#06b6d4" />
              <circle cx="48.4" cy="39.2" r="1.2" fill="#e0f2fe" />
            </>
          )}
        </motion.g>

        {/* Subtle chin accent */}
        <rect
          x="34"
          y="59"
          width="12"
          height="2.4"
          rx="1.2"
          fill={mood === 'thinking' ? '#8b5cf6' : '#4f6bff'}
          fillOpacity="0.8"
        />
      </svg>
    </motion.div>
  );
});
