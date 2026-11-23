import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Bookmark, Check, Info, Scale, X } from 'lucide-react';
import { useBookmarks } from '../contexts/bookmarks-context';
import { APPLE_EASE, TIER_META, calcLocalEvaluation } from '../utils/admission';
import './UniversityDetailModal.css';

export default function UniversityDetailModal({ referenceScore = null, onAnalyzeDepartment }) {
  const {
    detailTarget,
    closeDetail,
    isBookmarked,
    toggleBookmark,
    isComparing,
    toggleCompare,
  } = useBookmarks();

  useEffect(() => {
    if (!detailTarget) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [detailTarget, closeDetail]);

  const uni = detailTarget;
  const evalData = uni
    ? uni.probability !== undefined
      ? {
          probability: uni.probability,
          bucket: uni.bucket,
          scoreDelta: uni.scoreDelta,
        }
      : referenceScore
        ? calcLocalEvaluation(referenceScore, uni.cutoffRange)
        : null
    : null;

  const activeScore = uni?.effectiveScore ?? referenceScore;
  const bookmarked = uni ? isBookmarked(uni.id) : false;
  const comparing = uni ? isComparing(uni.id) : false;

  // 미니 분포 막대 계산 (310 ~ 420)
  const minAxis = 305;
  const maxAxis = 420;
  const toPct = (v) => Math.max(0, Math.min(100, ((v - minAxis) / (maxAxis - minAxis)) * 100));

  return (
    <AnimatePresence>
      {uni && (
        <motion.div
          className="modal-backdrop detail-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="uni-detail-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.target === e.currentTarget && closeDetail()}
        >
          <motion.div
            className="detail-sheet"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.28, ease: APPLE_EASE }}
          >
            {/* Header */}
            <div className="detail-sheet-head">
              <div>
                <div className="detail-pill-row">
                  <span className="detail-group-pill">{uni.group}</span>
                  <span className="detail-admission-pill">{uni.admissionType}</span>
                </div>
                <h2 id="uni-detail-title" className="detail-uni-title">
                  {uni.university}
                </h2>
                {uni.department && (
                  <p className="detail-matched-dept">
                    매칭 학과: <strong>{uni.department}</strong>
                  </p>
                )}
              </div>
              <button
                type="button"
                className="modal-icon-close"
                onClick={closeDetail}
                aria-label="상세 정보 닫기"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>

            <div className="detail-sheet-scroll">
            {/* Score Comparison Box (when score available) */}
            {evalData && (
              <div className="detail-eval-card">
                <div className="detail-eval-top">
                  <span className={`tier-badge ${evalData.bucket}`}>
                    <span className="tier-dot" />
                    {TIER_META[evalData.bucket].label}
                  </span>
                  <div className="detail-eval-numbers num">
                    <span className={`eval-delta ${evalData.scoreDelta >= 0 ? 'pos' : 'neg'}`}>
                      기준 평균 대비 {evalData.scoreDelta > 0 ? '+' : ''}
                      {evalData.scoreDelta}점
                    </span>
                    <strong className={`eval-prob tier-text-${evalData.bucket}`}>
                      추정 {evalData.probability}%
                    </strong>
                  </div>
                </div>

                {/* Mini Cutoff Position Bar */}
                {activeScore && (
                  <div className="detail-range-visual">
                    <div className="detail-range-track">
                      <div
                        className={`detail-range-band ${evalData.bucket}`}
                        style={{
                          left: `${toPct(uni.cutoffRange.min)}%`,
                          width: `${Math.max(4, toPct(uni.cutoffRange.max) - toPct(uni.cutoffRange.min))}%`,
                        }}
                      />
                      <div
                        className={`detail-range-avg ${evalData.bucket}`}
                        style={{ left: `${toPct(uni.cutoffRange.avg)}%` }}
                      />
                      <div
                        className="detail-range-user"
                        style={{ left: `${toPct(activeScore)}%` }}
                        title={`내 기준 점수: ${activeScore}점`}
                      />
                    </div>
                    <div className="detail-range-labels num">
                      <span>합격선 범위 {uni.cutoffRange.min}–{uni.cutoffRange.max}점</span>
                      <span>내 기준 {activeScore}점</span>
                    </div>
                  </div>
                )}

                <p className="detail-eval-basis">
                  <Info size={13} strokeWidth={1.8} />
                  {uni.waitlistWave
                    ? `${uni.waitlistWave.waveBadge} — ${uni.waitlistWave.stageSummary}`
                    : `2025학년도 합격자 표준점수 평균(${uni.cutoff}점) 대비 산출된 참고 지표이며, 실제 합격 여부는 대학별 환산점수·경쟁률에 따라 달라집니다.`}
                </p>
              </div>
            )}

            {/* Cutoff Metrics */}
            <div className="detail-metrics-grid num">
              <div className="detail-metric-tile">
                <span>최저 합격선</span>
                <strong>{uni.cutoffRange.min}점</strong>
              </div>
              <div className="detail-metric-tile highlight">
                <span>평균 커트라인</span>
                <strong>{uni.cutoff}점</strong>
              </div>
              <div className="detail-metric-tile">
                <span>상위 합격선</span>
                <strong>{uni.cutoffRange.max}점</strong>
              </div>
            </div>

            {/* Key Admission Info */}
            <div className="detail-info-list">
              <div className="detail-info-row">
                <span className="detail-info-key">2025 경쟁률 · 충원율</span>
                <span className="detail-info-val num">
                  평균 경쟁률 <strong>{uni.competitionRate ?? 5.0}:1</strong> · 예비번호 충원율 <strong>{uni.waitlistRatio ?? 75}%</strong>
                </span>
              </div>
              {uni.weights && (
                <div className="detail-info-row">
                  <span className="detail-info-key">국·수·탐 반영비율</span>
                  <span className="detail-info-val num">
                    {uni.weights.인문
                      ? `인문(국 ${uni.weights.인문.kor}% · 수 ${uni.weights.인문.math}% · 탐 ${uni.weights.인문.inq}%) / 자연(국 ${uni.weights.자연?.kor ?? uni.weights.인문.kor}% · 수 ${uni.weights.자연?.math ?? uni.weights.인문.math}% · 탐 ${uni.weights.자연?.inq ?? uni.weights.인문.inq}%)`
                      : `국어 ${uni.weights.kor}% · 수학 ${uni.weights.math}% · 탐구 ${uni.weights.inq}%`}
                  </span>
                </div>
              )}
              <div className="detail-info-row">
                <span className="detail-info-key">영어 반영</span>
                <span className="detail-info-val">
                  {uni.englishRule}
                  {uni.englishPenalties && (
                    <span className=" num" style={{ display: 'block', fontSize: 12, color: 'var(--ink-tertiary)', marginTop: 2 }}>
                      등급별 환산 감점: 1등급 0점 · 2등급 {uni.englishPenalties[2]}점 · 3등급 {uni.englishPenalties[3]}점 · 4등급 {uni.englishPenalties[4]}점
                    </span>
                  )}
                </span>
              </div>
              <div className="detail-info-row">
                <span className="detail-info-key">입시 특징</span>
                <span className="detail-info-val">{uni.note}</span>
              </div>
              <div className="detail-info-row">
                <span className="detail-info-key">데이터 출처</span>
                <span className="detail-info-val">{uni.source}</span>
              </div>
            </div>

            {/* Departments by Track */}
            {uni.departments && (
              <div className="detail-depts-section">
                <h3 className="detail-depts-heading">주요 개설 학과 (클릭 시 해당 학과로 바로 분석)</h3>
                <div className="detail-tracks">
                  {['인문', '자연', '예체능'].map((track) => {
                    const list = uni.departments[track] || [];
                    if (list.length === 0) return null;
                    return (
                      <div key={track} className="detail-track-group">
                        <span className="detail-track-badge">{track}</span>
                        <div className="detail-dept-pills">
                          {list.map((dept) => (
                            <button
                              key={dept}
                              type="button"
                              className="detail-dept-pill"
                              onClick={() => {
                                closeDetail();
                                if (onAnalyzeDepartment) {
                                  onAnalyzeDepartment({
                                    score: activeScore || uni.cutoff,
                                    major: dept,
                                    category: track,
                                  });
                                }
                              }}
                            >
                              {dept}
                              <ArrowUpRight size={12} strokeWidth={1.8} />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            </div>

            {/* Footer Actions */}
            <div className="detail-sheet-footer">
              <button
                type="button"
                className={`btn ${bookmarked ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => toggleBookmark(uni.id, uni.department || '', uni.university)}
              >
                {bookmarked ? <Check size={15} strokeWidth={2.2} /> : <Bookmark size={15} strokeWidth={1.8} />}
                {bookmarked ? '관심 대학 저장됨' : '관심 대학 저장'}
              </button>

              <button
                type="button"
                className={`btn ${comparing ? 'btn-blue' : 'btn-soft'}`}
                onClick={() => toggleCompare(uni.id, uni.university)}
              >
                <Scale size={15} strokeWidth={1.8} />
                {comparing ? '비교 목록에 담김' : '대학 비교에 담기'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
