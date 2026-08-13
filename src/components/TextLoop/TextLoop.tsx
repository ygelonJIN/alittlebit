import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import './TextLoop.css';

const VIEW_W = 400;
const VIEW_H = 200;
const CY = VIEW_H / 2;
const SAFE_TOTAL_WIDTH = 5000;

interface TextLoopProps {
  text?: string;
  speed?: number;
  direction?: string;
  separator?: string;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  color?: string;
  totalWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

const TextLoop = ({
  text = 'LOCKED',
  speed = 120,
  direction = 'forward',
  separator = '•',
  fontSize = 200,
  fontWeight = 300,
  letterSpacing = 10,
  uppercase = true,
  color = 'var(--text)',
  totalWidth = 5000,
  className = '',
  style = {}
}: TextLoopProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<SVGTextElement>(null);
  const containerGroupRef = useRef<SVGGElement>(null);

  const [unitWidth, setUnitWidth] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const unit = useMemo(() => {
    const base = uppercase ? String(text).toUpperCase() : String(text);
    const gap = separator ? ` ${separator} ` : '   ';
    return `${base}${gap}`;
  }, [text, separator, uppercase]);

  const textStyle = useMemo(
    () => ({
      fontSize: `${fontSize}px`,
      fontWeight,
      whiteSpace: 'pre' as const,
      fill: color
    }),
    [fontSize, fontWeight, color]
  );

  useLayoutEffect(() => {
    const measureEl = measureRef.current;
    if (!measureEl) return;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      try {
        const w = measureEl.getComputedTextLength();
        if (w > 0) {
          setUnitWidth(w);
          setIsReady(true);
        }
      } catch (e) {
        console.error('Text measurement failed', e);
      }
    };

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        requestAnimationFrame(() => { if (!cancelled) measure(); });
      }).catch(measure);
    } else {
      measure();
    }

    return () => { cancelled = true; };
  }, [unit, fontSize, fontWeight, letterSpacing]);

  const reps = useMemo(() => {
    if (!unitWidth) return 1;
    return Math.ceil(totalWidth / unitWidth);
  }, [unitWidth, totalWidth]);

  // GSAP动画
  useLayoutEffect(() => {
    const target = containerGroupRef.current;
    if (!target || !isReady || unitWidth <= 0 || speed <= 0) return;

    const duration = unitWidth / speed;
    const moveX = direction === 'forward' ? -unitWidth : unitWidth;
    const startX = direction === 'forward' ? 0 : -unitWidth;

    const ctx = gsap.context(() => {
      gsap.fromTo(target,
        { x: startX },
        {
          x: moveX + startX,
          duration,
          ease: 'none',
          repeat: -1,
          force3D: false
        }
      );
    });

    return () => ctx.revert();
  }, [isReady, unitWidth, speed, direction]);

  return (
    <div ref={rootRef} className={`text-loop ${className}`}
      style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        opacity: isReady ? 1 : 0, transition: 'opacity 0.3s ease', ...style
      }}>

      <svg className="text-loop-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMinYMid meet"
        style={{ width: '100%', height: '100%', overflow: 'visible' }}>

        <text ref={measureRef} style={textStyle} dominantBaseline="central"
              x="0" y={CY} opacity="0">
          {unit}
        </text>

        {isReady && (
          <g ref={containerGroupRef}>
            {Array.from({ length: reps }).map((_, i) => (
              <text
                key={i}
                className="text-loop-text"
                style={textStyle}
                dominantBaseline="central"
                x={i * unitWidth}
                y={CY}
              >
                {unit}
              </text>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
};

export default TextLoop;
