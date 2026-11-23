import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Bookmark,
  Check,
  CheckCircle2,
  Compass,
  Info,
  Layers,
  Scale,
  Sparkles,
} from 'lucide-react';
import { useBookmarks } from '../contexts/bookmarks-context';
import { APPLE_EASE, TIER_META, evaluatePortfolioCombination } from '../utils/admission';
import { AnimatedNumber } from './MotionPrimitives';
import './PortfolioSimulator.css';

const STRATEGY_PRESETS = [
  {
    key: 'balanced',
    label: '균형 추천',
    sub: '안정 1 · 적정 1 · 소신 1',
  },
  {
    key: 'safe',
    label: '안정 우선',
    sub: '안정 2 · 적정 1',
  },
  {
    key: 'ambitious',
    label: '소신 도전',
    sub: '적정 1 · 소신 2',
  },
];

const GROUPS = ['가군', '나군', '다군'];

export default function PortfolioSimulator({ meta }) {
  const { isBookmarked, toggleBookmark, openDetail, openCompareGroup } = useBookmarks();
  const [strategyKey, setStrategyKey] = useState('balanced');
  const [customOverrides, setCustomOverrides] = useState({ condKey: '', slots: {} });

  const condKey = `${meta?.score}-${meta?.major}-${meta?.category}-${meta?.englishGrade}`;

  const universities = useMemo(() => meta?.universities || [], [meta?.universities]);

  const uniMap = useMemo(() => {
    const map = {};
    for (const u of universities) {
      map[u.id] = u;
    }
    return map;
  }, [universities]);

  // 모집군별 선택 가능한 대학 목록
  const groupCandidates = useMemo(() => {
    const hasGroup = (uni, g) => {
      if (Array.isArray(uni.groups)) return uni.groups.includes(g);
      return String(uni.group || '').includes(g.replace('군', ''));
    };

    return {
      가군: universities.filter((u) => hasGroup(u, '가군')),
      나군: universities.filter((u) => hasGroup(u, '나군')),
      다군: universities.filter((u) => hasGroup(u, '다군')),
    };
  }, [universities]);

  // 현재 활성화된 가·나·다군 슬롯 계산
  const activeSlots = useMemo(() => {
    const presetSlots = meta?.recommendedPortfolios?.[strategyKey]?.slots || {};
    const overrides = customOverrides.condKey === condKey ? customOverrides.slots : {};

    const result = {};
    for (const g of GROUPS) {
      const overrideId = overrides[g];
      if (overrideId && uniMap[overrideId]) {
        result[g] = uniMap[overrideId];
      } else {
        const base = presetSlots[g];
        result[g] = base && uniMap[base.id] ? uniMap[base.id] : base || null;
      }
    }
    return result;
  }, [meta?.recommendedPortfolios, strategyKey, customOverrides, condKey, uniMap]);

  const isCustomized =
    customOverrides.condKey === condKey && Object.keys(customOverrides.slots).length > 0;

  const evaluation = useMemo(
    () => evaluatePortfolioCombination(activeSlots),
    [activeSlots]
  );

  const handleSelectPreset = (key) => {
    setStrategyKey(key);
    setCustomOverrides({ condKey, slots: {} });
  };

  const handleSlotChange = (group, nextUniId) => {
    setCustomOverrides((prev) => {
      const baseSlots = prev.condKey === condKey ? prev.slots : {};
      return {
        condKey,
        slots: {
          ...baseSlots,
          [group]: nextUniId,
        },
      };
    });
  };

  const handleSaveAllThree = () => {
    for (const g of GROUPS) {
      const item = activeSlots[g];
      if (item && !isBookmarked(item.id)) {
        toggleBookmark(item.id, item.department, item.university);
      }
    }
  };

  const handleCompareAllThree = () => {
    const ids = GROUPS.map((g) => activeSlots[g]?.id).filter(Boolean);
    openCompareGroup(ids);
  };

  if (!meta?.recommendedPortfolios) return null;

  return (
    <section className="portfolio-sim-card" aria-label="가·나·다군 3장 원서 배치 시뮬레이터">
      {/* Top Executive Header */}
      <div className="portfolio-sim-head">
        <div className="portfolio-sim-title-block">
          <div className="portfolio-sim-eyebrow">
            <Layers size={13} strokeWidth={2} />
            <span>가·나·다군 3장 실전 원서 배치 시뮬레이터</span>
            {isCustomized && <span className="portfolio-custom-tag">사용자 커스텀 조합</span>}
          </div>
          <h3 className="portfolio-sim-title">
            정시 3장 원서 최적 포트폴리오 설계
          </h3>
          <p className="portfolio-sim-sub">
            모집군(가·나·다군)별 지원 대학을 조합해 3장 중 1개교 이상 합격할 기대율과 포트폴리오 균형도를 즉시 시뮬레이션합니다.
          </p>
        </div>

        {/* Dark Space Black Combined Probability Metric */}
        <div className="portfolio-combined-box">
          <div className="portfolio-combined-main">
            <span className="portfolio-combined-label">1개교 이상 합격 기대율</span>
            <strong className="portfolio-combined-val num">
              <AnimatedNumber value={evaluation.combinedProbability} suffix="%" />
            </strong>
          </div>
          <div className="portfolio-combined-divider" />
          <div className="portfolio-combined-risk num">
            <span>전원 불합격 위험</span>
            <strong className={evaluation.failAllRisk >= 30 ? 'warn' : 'safe'}>
              <AnimatedNumber value={evaluation.failAllRisk} suffix="%" />
            </strong>
          </div>
        </div>
      </div>

      {/* Strategy Preset Selector Bar */}
      <div className="portfolio-toolbar">
        <div className="portfolio-preset-tabs" role="tablist" aria-label="포트폴리오 추천 전략 선택">
          {STRATEGY_PRESETS.map((p) => {
            const active = strategyKey === p.key && !isCustomized;
            return (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`portfolio-preset-btn ${active ? 'active' : ''}`}
                onClick={() => handleSelectPreset(p.key)}
              >
                <Sparkles size={13} strokeWidth={2} />
                <span className="preset-btn-label">{p.label}</span>
                <span className="preset-btn-sub">{p.sub}</span>
              </button>
            );
          })}
        </div>

        <div className="portfolio-quick-actions">
          <button
            type="button"
            className="btn btn-soft btn-sm"
            onClick={handleCompareAllThree}
          >
            <Scale size={14} strokeWidth={1.8} />
            3개교 나란히 비교
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleSaveAllThree}
          >
            <Bookmark size={14} strokeWidth={1.8} />
            3장 모두 관심 저장
          </button>
        </div>
      </div>

      {/* 3 Recruitment Group Slot Cards (가군 / 나군 / 다군) */}
      <div className="portfolio-slots-grid">
        {GROUPS.map((group, idx) => {
          const slot = activeSlots[group];
          const candidates = groupCandidates[group] || [];
          const bookmarked = slot ? isBookmarked(slot.id) : false;

          return (
            <motion.article
              key={group}
              className={`portfolio-slot-card ${slot ? `tier-border-${slot.bucket}` : ''}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: idx * 0.05, ease: APPLE_EASE }}
            >
              <div className="portfolio-slot-top">
                <div className="portfolio-slot-group-tag">
                  <span className="slot-group-dot" />
                  <strong>{group} 원서 카드</strong>
                </div>
                {slot && (
                  <span className={`tier-badge ${slot.bucket}`}>
                    <span className="tier-dot" />
                    {TIER_META[slot.bucket]?.label || slot.tierLabel}
                  </span>
                )}
              </div>

              {slot ? (
                <>
                  <div className="portfolio-slot-body">
                    <div className="portfolio-slot-uni-row">
                      <div>
                        <h4 className="portfolio-slot-uni">{slot.university}</h4>
                        <p className="portfolio-slot-dept">{slot.department}</p>
                      </div>
                      <div className="portfolio-slot-prob num">
                        <strong className={`tier-text-${slot.bucket}`}>
                          <AnimatedNumber value={slot.probability} suffix="%" />
                        </strong>
                        <span>추정 적합도</span>
                      </div>
                    </div>

                    {/* Key Metrics Row */}
                    <div className="portfolio-slot-metrics num">
                      <div className="slot-metric-item">
                        <span>학과 기준 컷</span>
                        <strong>{slot.cutoff}점</strong>
                      </div>
                      <div className="slot-metric-item">
                        <span>내 환산 편차</span>
                        <strong className={slot.scoreDelta >= 0 ? 'pos' : 'neg'}>
                          {slot.scoreDelta > 0 ? '+' : ''}
                          {slot.scoreDelta}점
                        </strong>
                      </div>
                      <div className="slot-metric-item">
                        <span>2025 충원율</span>
                        <strong>{slot.waitlistRatio ?? 75}%</strong>
                      </div>
                    </div>

                    {/* Advantage Micro Tags */}
                    <div className="portfolio-slot-tags">
                      <span className="slot-micro-tag">
                        경쟁률 {slot.competitionRate ?? 5.0}:1
                      </span>
                      {slot.englishAdvantage && (
                        <span className="slot-micro-tag advantage">
                          영어 감점 최소 ({slot.englishPenalty}점)
                        </span>
                      )}
                      {slot.weightDelta !== undefined && Math.abs(slot.weightDelta) >= 0.5 && (
                        <span
                          className={`slot-micro-tag ${slot.weightDelta > 0 ? 'advantage' : 'caution'}`}
                        >
                          {slot.weightAdvantageLabel} ({slot.weightDelta > 0 ? '+' : ''}
                          {slot.weightDelta}점)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Interactive University Switcher for this Group */}
                  <div className="portfolio-slot-Controls">
                    <label className="slot-select-label" htmlFor={`slot-select-${group}`}>
                      {group} 대학 변경
                    </label>
                    <select
                      id={`slot-select-${group}`}
                      className="slot-uni-select"
                      value={slot.id}
                      onChange={(e) => handleSlotChange(group, e.target.value)}
                    >
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          [{TIER_META[c.bucket]?.shortLabel || c.tierShort} {c.probability}%] {c.shortName} · {c.department} ({c.cutoff}점)
                        </option>
                      ))}
                    </select>

                    <div className="slot-action-row">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => openDetail(slot)}
                      >
                        <Info size={13} strokeWidth={1.8} />
                        모집요강 상세
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${bookmarked ? 'btn-primary' : 'btn-soft'}`}
                        onClick={() => toggleBookmark(slot.id, slot.department, slot.university)}
                      >
                        {bookmarked ? <Check size={13} strokeWidth={2.2} /> : <Bookmark size={13} strokeWidth={1.8} />}
                        {bookmarked ? '저장됨' : '관심 저장'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="portfolio-slot-empty">
                  <p>{group}에 해당하는 모집 대학이 없습니다.</p>
                </div>
              )}
            </motion.article>
          );
        })}
      </div>

      {/* Portfolio Diagnosis Banner */}
      <div className={`portfolio-diagnosis-bar tone-${evaluation.diagnosisTone}`}>
        <div className="diagnosis-icon">
          {evaluation.diagnosisTone === 'warn' ? (
            <AlertTriangle size={16} strokeWidth={2} />
          ) : evaluation.diagnosisTone === 'good' ? (
            <CheckCircle2 size={16} strokeWidth={2} />
          ) : (
            <Compass size={16} strokeWidth={2} />
          )}
        </div>
        <div className="diagnosis-content">
          <strong>{evaluation.diagnosisTitle}</strong>
          <p>{evaluation.diagnosisText}</p>
        </div>
      </div>
    </section>
  );
}
