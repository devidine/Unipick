import { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import './AmbientCanvas.css';

const PARTICLES = [
  { id: 1, left: '6%', top: '16%', size: 5, duration: 15, delay: 0, dark: true },
  { id: 2, left: '14%', top: '58%', size: 4, duration: 19, delay: -4, dark: false },
  { id: 3, left: '22%', top: '28%', size: 6, duration: 17, delay: -8, dark: true },
  { id: 4, left: '31%', top: '74%', size: 4, duration: 21, delay: -3, dark: false },
  { id: 5, left: '40%', top: '18%', size: 5, duration: 16, delay: -11, dark: true },
  { id: 6, left: '49%', top: '62%', size: 4, duration: 20, delay: -6, dark: false },
  { id: 7, left: '57%', top: '24%', size: 6, duration: 18, delay: -13, dark: true },
  { id: 8, left: '65%', top: '80%', size: 5, duration: 22, delay: -5, dark: false },
  { id: 9, left: '73%', top: '36%', size: 4, duration: 14, delay: -9, dark: true },
  { id: 10, left: '81%', top: '15%', size: 6, duration: 19, delay: -2, dark: false },
  { id: 11, left: '88%', top: '66%', size: 5, duration: 17, delay: -10, dark: true },
  { id: 12, left: '94%', top: '42%', size: 4, duration: 21, delay: -7, dark: false },
  { id: 13, left: '19%', top: '88%', size: 5, duration: 18, delay: -12, dark: true },
  { id: 14, left: '45%', top: '90%', size: 4, duration: 16, delay: -1, dark: false },
  { id: 15, left: '77%', top: '89%', size: 5, duration: 20, delay: -14, dark: true },
  { id: 16, left: '10%', top: '38%', size: 4, duration: 15, delay: -6, dark: false },
];

export default function AmbientCanvas() {
  const prefersReduced = useReducedMotion();
  const { scrollY } = useScroll();

  const orbLayerY = useTransform(scrollY, [0, 1800], [0, -110]);
  const ringsLayerY = useTransform(scrollY, [0, 1800], [0, -150]);

  const pointerX = useMotionValue(-400);
  const pointerY = useMotionValue(-400);
  const smoothX = useSpring(pointerX, { stiffness: 55, damping: 24, mass: 0.7 });
  const smoothY = useSpring(pointerY, { stiffness: 55, damping: 24, mass: 0.7 });

  useEffect(() => {
    if (prefersReduced) return;
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: fine)').matches) return;

    const handleMove = (e) => {
      pointerX.set(e.clientX - 240);
      pointerY.set(e.clientY - 240);
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => window.removeEventListener('pointermove', handleMove);
  }, [prefersReduced, pointerX, pointerY]);

  return (
    <div className="ambient-canvas" aria-hidden="true">
      {/* 1. 미세 도트 매트릭스 + 연속 빛 스윕 웨이브 */}
      <div className="ambient-dot-grid" />
      {!prefersReduced && <div className="ambient-sweep-beam" />}

      {/* 2. 지속적으로 흐르는 블랙·그라파이트·실버 블러 오브 (스크롤 패럴랙스) */}
      <motion.div
        className="ambient-orbs-layer"
        style={prefersReduced ? undefined : { y: orbLayerY }}
      >
        <div className="ambient-orb orb-obsidian" />
        <div className="ambient-orb orb-graphite" />
        <div className="ambient-orb orb-silver" />
        <div className="ambient-orb orb-smoke" />
      </motion.div>

      {/* 3. 마우스 움직임에 실시간 반응하는 소프트 그라파이트 라이트 베일 */}
      {!prefersReduced && (
        <motion.div
          className="ambient-pointer-veil"
          style={{ x: smoothX, y: smoothY }}
        />
      )}

      {/* 4. 연속 회전하는 오비탈 링과 이동하는 궤도 위성 노드 */}
      <motion.div
        className="ambient-geometry"
        style={prefersReduced ? undefined : { y: ringsLayerY }}
      >
        <svg viewBox="0 0 1400 900" fill="none" className="ambient-svg">
          {/* 우상단 회전 궤도 */}
          <g className="orbit-group orbit-cw" style={{ transformOrigin: '1120px 210px' }}>
            <circle cx="1120" cy="210" r="220" stroke="rgba(17,17,20,0.085)" strokeWidth="1.2" />
            <circle cx="1120" cy="210" r="320" stroke="rgba(17,17,20,0.065)" strokeWidth="1" strokeDasharray="5 9" />
            <circle cx="1340" cy="210" r="4.5" fill="rgba(17,17,20,0.38)" />
            <circle cx="1120" cy="530" r="3.5" fill="rgba(72,72,82,0.34)" />
          </g>

          {/* 좌하단 역회전 궤도 */}
          <g className="orbit-group orbit-ccw" style={{ transformOrigin: '200px 640px' }}>
            <circle cx="200" cy="640" r="190" stroke="rgba(17,17,20,0.08)" strokeWidth="1.2" />
            <circle cx="200" cy="640" r="285" stroke="rgba(72,72,82,0.07)" strokeWidth="1" strokeDasharray="4 10" />
            <circle cx="390" cy="640" r="4" fill="rgba(17,17,20,0.34)" />
            <circle cx="200" cy="355" r="3.5" fill="rgba(90,90,100,0.32)" />
          </g>
        </svg>
      </motion.div>

      {/* 5. 지속적으로 부유하는 모노톤 입자 */}
      {!prefersReduced && (
        <div className="ambient-particles">
          {PARTICLES.map((p) => (
            <span
              key={p.id}
              className={`ambient-dot ${p.dark ? 'dot-dark' : 'dot-silver'}`}
              style={{
                left: p.left,
                top: p.top,
                width: `${p.size}px`,
                height: `${p.size}px`,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
