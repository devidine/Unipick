import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Bookmark,
  ChevronRight,
  Info,
  Scale,
  Trash2,
} from 'lucide-react';
import { useBookmarks } from '../contexts/bookmarks-context';
import { useAuth } from '../contexts/auth-context';
import { APPLE_EASE, TIER_META, calcLocalEvaluation } from '../utils/admission';
import { AnimatedNumber } from '../components/MotionPrimitives';
import './SavedPage.css';

export default function SavedPage({
  universities = [],
  evaluatedMap = {},
  referenceScore = null,
  onGoMain,
  onGoExplore,
  onOpenAuth,
}) {
  const { user } = useAuth();
  const {
    bookmarks,
    toggleBookmark,
    isComparing,
    toggleCompare,
    setCompareOpen,
    openDetail,
  } = useBookmarks();

  const savedItems = useMemo(() => {
    return bookmarks
      .map((bm) => {
        const evalItem = evaluatedMap[bm.universityId];
        const rawUni = universities.find((u) => u.id === bm.universityId);
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
        return {
          ...base,
          savedDepartment: bm.department || evalItem?.department || '',
          scoreEval,
        };
      })
      .filter(Boolean);
  }, [bookmarks, evaluatedMap, universities, referenceScore]);

  // 상위 최대 3개 관심 대학 기준 가·나·다군 조합 분석
  const portfolioSummary = useMemo(() => {
    const scored = savedItems.filter((item) => item.scoreEval);
    if (scored.length === 0) return null;
    const topThree = scored.slice(0, 3);
    const failAll = topThree.reduce(
      (acc, item) => acc * (1 - item.scoreEval.probability / 100),
      1
    );
    const atLeastOne = Math.min(99, Math.round((1 - failAll) * 100));
    const hasSafety = topThree.some((i) => i.scoreEval.bucket === 'safety');
    const hasTarget = topThree.some((i) => i.scoreEval.bucket === 'target');
    const allReach = topThree.every(
      (i) => i.scoreEval.bucket === 'reach' || i.scoreEval.bucket === 'challenge'
    );

    let advice = '안정·적정·소신 비율을 균형 있게 조정해보세요.';
    if (allReach) {
      advice = '저장된 후보가 모두 소신·도전 구간입니다. 안정 지원 대학 1곳 이상을 추가하는 것을 권장합니다.';
    } else if (hasSafety && hasTarget) {
      advice = '안정권과 적정권이 조화를 이룬 균형 잡힌 지원 포트폴리오입니다.';
    } else if (!hasSafety && topThree.length >= 2) {
      advice = '안정 지원 구간(75% 이상) 대학을 1곳 더 담아두면 하방 리스크를 줄일 수 있습니다.';
    }
    return { count: topThree.length, atLeastOne, advice };
  }, [savedItems]);

  const handleCompareAllSaved = () => {
    const toCompare = savedItems.slice(0, 4);
    toCompare.forEach((item) => {
      if (!isComparing(item.id)) {
        toggleCompare(item.id);
      }
    });
    setCompareOpen(true);
  };

  return (
    <div className="saved-page">
      <div className="page-container saved-layout">
        <header className="saved-top-header">
          <div>
            <h1 className="uni-page-title">관심 대학</h1>
            <p className="uni-page-desc">
              저장해 둔 목표 대학들을 한곳에서 관리하고, 전형 조건과 합격선을 나란히 비교할 수 있습니다.
            </p>
          </div>
          {savedItems.length >= 2 && (
            <button
              type="button"
              className="btn btn-blue"
              onClick={handleCompareAllSaved}
            >
              <Scale size={15} strokeWidth={1.9} />
              관심 대학 한 번에 비교
            </button>
          )}
        </header>

        {!user && savedItems.length > 0 && (
          <div className="saved-sync-banner">
            <div className="saved-sync-copy">
              <Info size={15} strokeWidth={1.9} />
              <span>현재 브라우저에 임시 저장 중입니다. 로그인하면 계정에 영구 동기화됩니다.</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onOpenAuth('login')}
            >
              로그인하여 동기화
            </button>
          </div>
        )}

        {savedItems.length === 0 ? (
          <div className="saved-empty-card">
            <div className="saved-empty-icon">
              <Bookmark size={24} strokeWidth={1.7} />
            </div>
            <h2>아직 저장된 관심 대학이 없습니다</h2>
            <p>
              입시 분석 결과나 대학 탐색에서 목표 대학의 &lsquo;관심 저장&rsquo;을 누르면
              <br />
              이곳에 모여 한눈에 비교하고 지원 조합을 점검할 수 있습니다.
            </p>
            <div className="saved-empty-actions">
              <button type="button" className="btn btn-primary" onClick={onGoMain}>
                성적 분석하러 가기
                <ArrowRight size={15} strokeWidth={2} />
              </button>
              <button type="button" className="btn btn-secondary" onClick={onGoExplore}>
                21개 대학 둘러보기
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Portfolio Balance Summary */}
            {portfolioSummary && (
              <section className="saved-portfolio-card">
                <div className="sp-copy">
                  <span className="sp-eyebrow">
                    상위 {portfolioSummary.count}개 관심 대학 기준 조합 참고치
                  </span>
                  <h2 className="sp-title">
                    {referenceScore ? `기준 점수 ${referenceScore}점 포트폴리오 점검` : '지원 조합 점검'}
                  </h2>
                  <p className="sp-advice">{portfolioSummary.advice}</p>
                </div>
                <div className="sp-stat">
                  <span className="sp-stat-label">1개교 이상 추정 기대율</span>
                  <div className="sp-stat-val">
                    <AnimatedNumber value={portfolioSummary.atLeastOne} suffix="%" />
                  </div>
                </div>
              </section>
            )}

            {/* Saved University Cards */}
            <motion.div className="saved-grid" layout>
              <AnimatePresence mode="popLayout">
                {savedItems.map((item) => {
                  const tier = item.scoreEval ? TIER_META[item.scoreEval.bucket] : null;
                  const comparing = isComparing(item.id);

                  return (
                    <motion.article
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.25, ease: APPLE_EASE }}
                      whileHover={{ y: -3 }}
                      className={`saved-uni-card ${comparing ? 'is-comparing' : ''}`}
                    >
                      <div
                        className="saved-card-body"
                        role="button"
                        tabIndex={0}
                        onClick={() => openDetail({ ...item, effectiveScore: referenceScore })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDetail({ ...item, effectiveScore: referenceScore });
                          }
                        }}
                      >
                        <div className="saved-card-top">
                          <div>
                            <div className="saved-badges">
                              {tier && (
                                <span className={`tier-badge ${item.scoreEval.bucket}`}>
                                  <span className="tier-dot" />
                                  {tier.label}
                                </span>
                              )}
                              <span className="exp-group-tag">{item.group}</span>
                            </div>
                            <h3 className="saved-uni-name">{item.university}</h3>
                            <p className="saved-dept">
                              {item.savedDepartment || item.admissionType}
                            </p>
                          </div>

                          <div className="saved-right-metric num">
                            {item.scoreEval ? (
                              <>
                                <strong className={`tier-text-${item.scoreEval.bucket}`}>
                                  {item.scoreEval.probability}%
                                </strong>
                                <span>
                                  평균 대비 {item.scoreEval.scoreDelta > 0 ? '+' : ''}
                                  {item.scoreEval.scoreDelta}점
                                </span>
                              </>
                            ) : (
                              <>
                                <strong>{item.cutoff}점</strong>
                                <span>평균 커트라인</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="saved-meta-box num">
                          <span>2025 합격선 {item.cutoffRange.min}–{item.cutoffRange.max}점</span>
                          <span>·</span>
                          <span>영어 {item.englishRule}</span>
                        </div>

                        <p className="saved-note">{item.note}</p>
                      </div>

                      <div className="saved-card-footer">
                        <button
                          type="button"
                          className={`uni-v-act-btn ${comparing ? 'active-compare' : ''}`}
                          onClick={() => toggleCompare(item.id, item.university)}
                        >
                          <Scale size={14} strokeWidth={1.8} />
                          {comparing ? '비교 담김' : '비교 담기'}
                        </button>

                        <button
                          type="button"
                          className="uni-v-act-btn"
                          onClick={() => toggleBookmark(item.id, '', item.university)}
                        >
                          <Trash2 size={14} strokeWidth={1.8} />
                          저장 해제
                        </button>

                        <button
                          type="button"
                          className="uni-v-detail-link"
                          onClick={() => openDetail({ ...item, effectiveScore: referenceScore })}
                        >
                          상세
                          <ChevronRight size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
