import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { APPLE_EASE, TIER_META } from '../utils/admission';
import './CutoffRangeChart.css';

export default function CutoffRangeChart({
  items,
  userScore,
  showAll,
  onToggleShowAll,
  totalCount,
  onSelectUniversity = null,
}) {
  const { minScale, maxScale, ticks } = useMemo(() => {
    const scores = items.flatMap((u) => [u.cutoffRange.min, u.cutoffRange.max]);
    scores.push(userScore);
    const rawMin = Math.min(...scores, 310);
    const rawMax = Math.max(...scores, 412);
    const min = Math.floor((rawMin - 6) / 10) * 10;
    const max = Math.ceil((rawMax + 6) / 10) * 10;
    const step = max - min > 120 ? 30 : 20;
    const tickList = [];
    for (let v = min; v <= max; v += step) {
      tickList.push(v);
    }
    return { minScale: min, maxScale: max, ticks: tickList };
  }, [items, userScore]);

  const toPct = (val) => {
    const clamped = Math.max(minScale, Math.min(maxScale, val));
    return ((clamped - minScale) / (maxScale - minScale)) * 100;
  };

  const userPct = toPct(userScore);

  return (
    <section className="chart-card" aria-label="대학별 커트라인 분포와 내 점수 위치">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">커트라인 분포 대비 내 위치</h3>
          <p className="chart-subtitle">
            2025학년도 대학별 합격선 범위(최저–최고) 안에서 내 기준 점수({userScore}점)의 위치를 비교합니다.
          </p>
        </div>
        {(totalCount > items.length || showAll) && (
          <div className="chart-toggle" role="group" aria-label="표시 대학 범위">
            <button
              type="button"
              className={`chart-toggle-btn ${!showAll ? 'active' : ''}`}
              onClick={() => onToggleShowAll(false)}
            >
              핵심 구간
            </button>
            <button
              type="button"
              className={`chart-toggle-btn ${showAll ? 'active' : ''}`}
              onClick={() => onToggleShowAll(true)}
            >
              전체 {totalCount}개교
            </button>
          </div>
        )}
      </div>

      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-swatch range" />
          <span>합격선 범위 (최저–최고)</span>
        </span>
        <span className="legend-item">
          <span className="legend-swatch avg" />
          <span>평균 합격선</span>
        </span>
        <span className="legend-item">
          <span className="legend-swatch user" />
          <span>
            내 기준 점수 (<strong className="num">{userScore}점</strong>)
          </span>
        </span>
      </div>

      {/* Axis Header */}
      <div className="chart-grid-header">
        <span className="col-uni">대학 · 학과</span>
        <div className="col-track axis-track">
          {ticks.map((t) => (
            <span key={t} className="axis-tick num" style={{ left: `${toPct(t)}%` }}>
              {t}
            </span>
          ))}
        </div>
        <span className="col-metric">평균 대비 · 구분</span>
      </div>

      {/* Rows */}
      <div className="chart-rows">
        {items.map((item) => {
          const leftPct = toPct(item.cutoffRange.min);
          const rightPct = toPct(item.cutoffRange.max);
          const widthPct = Math.max(2.5, rightPct - leftPct);
          const avgPct = toPct(item.cutoffRange.avg);
          const deltaPrefix = item.scoreDelta > 0 ? '+' : '';
          const tier = TIER_META[item.bucket] || TIER_META.target;

          return (
            <button
              key={item.id}
              type="button"
              className="chart-row"
              onClick={() => onSelectUniversity && onSelectUniversity(item)}
            >
              <div className="col-uni">
                <span className="row-uni-name">{item.shortName || item.university}</span>
                <span className="row-dept-name">{item.department}</span>
              </div>

              <div className="col-track" aria-hidden="true">
                <div className="track-rail" />
                {ticks.map((t) => (
                  <span key={t} className="track-gridline" style={{ left: `${toPct(t)}%` }} />
                ))}
                <motion.div
                  className={`track-range ${item.bucket}`}
                  initial={false}
                  animate={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  transition={{ duration: 0.45, ease: APPLE_EASE }}
                />
                <motion.div
                  className={`track-avg-dot ${item.bucket}`}
                  initial={false}
                  animate={{ left: `${avgPct}%` }}
                  transition={{ duration: 0.45, ease: APPLE_EASE }}
                />
                <motion.div
                  className="track-user-line"
                  initial={false}
                  animate={{ left: `${userPct}%` }}
                  transition={{ duration: 0.45, ease: APPLE_EASE }}
                />
              </div>

              <div className="col-metric num">
                <span className={`row-delta ${item.scoreDelta >= 0 ? 'pos' : 'neg'}`}>
                  {deltaPrefix}
                  {item.scoreDelta}
                </span>
                <span className={`tier-badge ${item.bucket}`}>
                  {tier.shortLabel} {item.probability}%
                </span>
                {onSelectUniversity && (
                  <ChevronRight size={14} strokeWidth={1.8} className="row-chevron" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
