import { useEffect, useState } from 'react';
import { motion, useMotionValue, animate, useReducedMotion } from 'framer-motion';
import { APPLE_EASE } from '../utils/admission';

/**
 * 숫자 및 입시 분석 결과의 부드러운 카운트업 애니메이션
 */
export function AnimatedNumber({ value, decimals = 0, suffix = '', prefix = '', className = '' }) {
  const prefersReduced = useReducedMotion();
  const numericValue = Number(value) || 0;
  const motionVal = useMotionValue(numericValue);
  const [display, setDisplay] = useState(numericValue);

  useEffect(() => {
    if (prefersReduced) {
      motionVal.set(numericValue);
      return;
    }

    const controls = animate(motionVal, numericValue, {
      duration: 0.55,
      ease: APPLE_EASE,
      onUpdate: (latest) => {
        setDisplay(latest);
      },
    });

    return () => controls.stop();
  }, [numericValue, prefersReduced, motionVal]);

  const shown = prefersReduced ? numericValue : display;
  const formatted = decimals > 0 ? shown.toFixed(decimals) : Math.round(shown).toString();

  return (
    <span className={`num ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

/**
 * 스크롤 진입 시 자연스럽게 나타나는 콘텐츠 래퍼
 */
export function ScrollReveal({ children, className = '', delay = 0 }) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 'some' }}
      transition={{ duration: 0.4, delay, ease: APPLE_EASE }}
    >
      {children}
    </motion.div>
  );
}
