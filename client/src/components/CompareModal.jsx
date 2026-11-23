import { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Check, Info, Scale, Trash2, X } from 'lucide-react';
import { useBookmarks } from '../contexts/bookmarks-context';
import { APPLE_EASE, TIER_META, calcLocalEvaluation } from '../utils/admission';
import './CompareModal.css';

export default function CompareModal({ universities = [], evaluatedMap = {}, referenceScore = null }) {
  const {
    compareIds,
    compareOpen,
    setCompareOpen,
    toggleCompare,
    clearCompare,
    isBookmarked,
    toggleBookmark,
  } = useBookmarks();

  useEffect(() => {
    if (!compareOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setCompareOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [compareOpen, setCompareOpen]);

  const items = useMemo(() => {
    return compareIds
      .map((id) => {
        const evalItem = evaluatedMap[id];
        const rawUni = universities.find((u) => u.id === id);
        if (!evalItem && !rawUni) return null;
        const base = evalItem || rawUni;
        const scoreEval = evalItem
          ? {
              probability: evalItem.probability,
              bucket: evalItem.bucket,
              scoreDelta: evalItem.scoreDelta,
            }
          : referenceScore
            ? calcLocalEvaluation(referenceScore, base.cutoffRange)
            : null;
        return { ...base, scoreEval };
      })
      .filter(Boolean);
  }, [compareIds, evaluatedMap, universities, referenceScore]);

  const minAxis = 310;
  const maxAxis = 415;
  const toPct = (v) => Math.max(0, Math.min(100, ((v - minAxis) / (maxAxis - minAxis)) * 100));

  return (
    <AnimatePresence>
      {compareOpen && items.length > 0 && (
        <motion.div
          className="modal-backdrop compare-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="compare-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.target === e.currentTarget && setCompareOpen(false)}
        >
          <motion.div
            className="compare-sheet"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: APPLE_EASE }}
          >
            <div className="compare-head">
              <div>
                <span className="compare-eyebrow">
                  <Scale size={13} strokeWidth={1.9} />
                  대학 간 입시 조건 비교
                </span>
                <h2 id="compare-modal-title" className="compare-title">
                  선택한 {items.length}개 대학 한눈에 비교하기
                </h2>
                {referenceScore && (
                  <p className="compare-sub num">
                    기준 점수 <strong>{referenceScore}점</strong> 대비 2025학년도 합격선과 주요 전형 조건을 나란히 비교합니다.
                  </p>
                )}
              </div>
              <div className="compare-head-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={clearCompare}
                >
                  <Trash2 size={14} strokeWidth={1.7} />
                  비교 비우기
                </button>
                <button
                  type="button"
                  className="modal-icon-close"
                  onClick={() => setCompareOpen(false)}
                  aria-label="비교 창 닫기"
                >
                  <X size={18} strokeWidth={1.8} />
                </button>
              </div>
            </div>

            <div className="compare-scroll">
              <div
                className="compare-columns"
                style={{ gridTemplateColumns: `repeat(${items.length}, minmax(220px, 1fr))` }}
              >
                {items.map((item) => {
                  const bookmarked = isBookmarked(item.id);
                  const evalInfo = item.scoreEval;

                  return (
                    <article key={item.id} className="compare-col">
                      <div className="compare-col-top">
                        <div>
                          <span className="compare-group-chip">{item.group}</span>
                          <h3 className="compare-uni-name">{item.university}</h3>
                          <p className="compare-dept-name">
                            {item.department || '전 계열 비교'}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="compare-col-remove"
                          onClick={() => toggleCompare(item.id)}
                          aria-label={`${item.university} 비교에서 제거`}
                        >
                          <X size={14} strokeWidth={2} />
                        </button>
                      </div>

                      {/* Eligibility Row */}
                      <div className="compare-section">
                        <span className="compare-label">지원 가능성 구분</span>
                        {evalInfo ? (
                          <div className="compare-tier-box">
                            <span className={`tier-badge ${evalInfo.bucket}`}>
                              <span className="tier-dot" />
                              {TIER_META[evalInfo.bucket].label}
                            </span>
                            <div className="compare-prob-row num">
                              <strong>추정 {evalInfo.probability}%</strong>
                              <span className={evalInfo.scoreDelta >= 0 ? 'pos' : 'neg'}>
                                ({evalInfo.scoreDelta > 0 ? '+' : ''}
                                {evalInfo.scoreDelta}점)
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="compare-muted">성적 입력 후 산출됩니다</span>
                        )}
                      </div>

                      {/* Cutoff Visual Row */}
                      <div className="compare-section">
                        <span className="compare-label">2025 정시 합격선</span>
                        <div className="compare-cutoff-big num">
                          평균 <strong>{item.cutoff}점</strong>
                        </div>
                        <div className="compare-mini-track" aria-hidden="true">
                          <div
                            className={`compare-mini-band ${evalInfo?.bucket || 'target'}`}
                            style={{
                              left: `${toPct(item.cutoffRange.min)}%`,
                              width: `${Math.max(6, toPct(item.cutoffRange.max) - toPct(item.cutoffRange.min))}%`,
                            }}
                          />
                          {referenceScore && (
                            <div
                              className="compare-mini-user"
                              style={{ left: `${toPct(referenceScore)}%` }}
                            />
                          )}
                        </div>
                        <span className="compare-range-caption num">
                          최저 {item.cutoffRange.min}점 – 최고 {item.cutoffRange.max}점
                        </span>
                      </div>

                      {/* Admission Type & Competition Metrics */}
                      <div className="compare-section">
                        <span className="compare-label">전형 방식 · 경쟁 지표</span>
                        <p className="compare-text">{item.admissionType}</p>
                        <span className="compare-range-caption num" style={{ marginTop: 4, display: 'block' }}>
                          2025 경쟁률 <strong>{item.competitionRate ?? 5.0}:1</strong> · 충원율 <strong>{item.waitlistRatio ?? 75}%</strong>
                        </span>
                      </div>

                      {/* English Rule */}
                      <div className="compare-section">
                        <span className="compare-label">영어 반영 (2등급 감점)</span>
                        <p className="compare-text">
                          {item.englishRule}
                          {item.englishPenalties && (
                            <strong className="num" style={{ display: 'block', marginTop: 3 }}>
                              2등급 {item.englishPenalties[2]}점 / 3등급 {item.englishPenalties[3]}점
                            </strong>
                          )}
                        </p>
                      </div>

                      {/* Strategic Note */}
                      <div className="compare-section compare-note-sec">
                        <span className="compare-label">핵심 입시 포인트</span>
                        <p className="compare-text">{item.note}</p>
                      </div>

                      {/* Bookmark Action */}
                      <button
                        type="button"
                        className={`btn btn-sm compare-save-btn ${bookmarked ? 'btn-primary' : 'btn-soft'}`}
                        onClick={() => toggleBookmark(item.id, item.department || '', item.university)}
                      >
                        {bookmarked ? <Check size={14} strokeWidth={2.2} /> : <Bookmark size={14} strokeWidth={1.8} />}
                        {bookmarked ? '관심 대학 저장됨' : '관심 대학 저장'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="compare-footnote">
              <Info size={13} strokeWidth={1.8} />
              <span>
                각 대학 입학처 및 대입정보포털(어디가) 2025학년도 정시 합격자 평균 기준입니다. 영역별 반영비율과 변환표준점수에 따라 실제 유불리는 달라질 수 있습니다.
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
