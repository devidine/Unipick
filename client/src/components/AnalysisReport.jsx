import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Info,
  RotateCcw,
  Scale,
  Search,
  X,
} from 'lucide-react';
import { useBookmarks } from '../contexts/bookmarks-context';
import { APPLE_EASE, TIER_META } from '../utils/admission';
import { AnimatedNumber, ScrollReveal } from './MotionPrimitives';
import CutoffRangeChart from './CutoffRangeChart';
import './AnalysisReport.css';

const FILTER_TABS = [
  { id: 'all', label: '전체' },
  { id: 'safety', label: '안정 지원' },
  { id: 'target', label: '적정 지원' },
  { id: 'reach', label: '소신 지원' },
  { id: 'bookmarked', label: '관심 대학' },
];

const GROUP_FILTERS = ['전체', '가군', '나군', '다군'];
const SIM_OFFSETS = [-10, -5, 0, 5, 10];

export default function AnalysisReport({
  report,
  baseScore = null,
  simOffset = 0,
  onSimulateOffset = null,
  simLoading = false,
  savedNotice = null,
  isPreview = false,
  layoutPrefix = 'report',
}) {
  const { isBookmarked, toggleBookmark, isComparing, toggleCompare, openDetail } = useBookmarks();

  const [showAllChart, setShowAllChart] = useState(false);
  const [tierFilter, setTierFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('전체');
  const [searchQuery, setSearchQuery] = useState('');
  const [openGuideId, setOpenGuideId] = useState(null);

  const { meta, assessment, medicalNotice, structured, allEvaluated, tips, guide, dataSources } =
    report;

  // 커트라인 분포 차트 표시 항목
  const chartItems = useMemo(() => {
    if (showAllChart) return allEvaluated;
    const picked = [...structured.reach, ...structured.target, ...structured.safety];
    if (picked.length > 0) {
      return [...picked].sort((a, b) => b.cutoff - a.cutoff);
    }
    return allEvaluated.slice(-7);
  }, [showAllChart, structured, allEvaluated]);

  // 검색 & 필터가 적용된 대학 카드 목록
  const filteredUniversities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allEvaluated.filter((u) => {
      if (tierFilter === 'bookmarked' && !isBookmarked(u.id)) return false;
      if (['safety', 'target', 'reach'].includes(tierFilter) && u.bucket !== tierFilter) {
        return false;
      }
      if (groupFilter !== '전체' && !u.group.includes(groupFilter.replace('군', ''))) {
        return false;
      }
      if (q) {
        const hitName =
          u.university.toLowerCase().includes(q) ||
          (u.shortName || '').toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q);
        if (!hitName) return false;
      }
      return true;
    });
  }, [allEvaluated, tierFilter, groupFilter, searchQuery, isBookmarked]);

  // 미니 위치 바용 스케일
  const minAxis = 305;
  const maxAxis = 420;
  const toPct = (v) => Math.max(0, Math.min(100, ((v - minAxis) / (maxAxis - minAxis)) * 100));

  return (
    <div className={`analysis-report ${simLoading ? 'is-simulating' : ''}`}>
      {/* Preview Mode Notice (Honest & Clear) */}
      {isPreview && (
        <div className="preview-banner">
          <Info size={15} strokeWidth={1.9} />
          <span>
            현재 <strong>예시 성적({meta.score}점 · {meta.major})</strong> 기준의 2025학년도 공식 데이터 분석 미리보기입니다. 위 입력창에 본인 성적을 입력하면 즉시 맞춤형 결과로 전환됩니다.
          </span>
        </div>
      )}

      {/* 1. Space Black & Graphite Executive Summary Card */}
      <motion.section
        className="report-summary-card summary-obsidian"
        aria-label="입시 분석 핵심 요약"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: APPLE_EASE }}
      >
        {simLoading && <div className="summary-live-sweep" aria-hidden="true" />}
        <div className="summary-top-row">
          <div>
            <div className="summary-eyebrow">
              <span>{meta.category}계열</span>
              <span className="dot">·</span>
              <span>{meta.major}</span>
              {meta.englishGrade > 1 && (
                <>
                  <span className="dot">·</span>
                  <span>영어 {meta.englishGrade}등급 보정 반영</span>
                </>
              )}
            </div>
            <h2 className="summary-level">
              {assessment.level}
              <span className="summary-percentile">{assessment.percentileRange}</span>
            </h2>
          </div>
          {savedNotice && (
            <span className="summary-saved-pill">
              <span className="live-dot" aria-hidden="true" />
              {savedNotice}
            </span>
          )}
        </div>

          <p className="summary-desc">{assessment.desc}</p>

          <div className="kpi-grid">
            <div className="kpi-tile score-tile">
              <span className="kpi-label">기준 표준점수</span>
              <div className="kpi-value">
                <AnimatedNumber value={meta.score} />
                <small>점</small>
              </div>
              <span className="kpi-sub num">
                {meta.englishPenalty < 0
                  ? `영어 보정 후 ${meta.effectiveScore}점 (${meta.englishPenalty})`
                  : '영어 1등급 기준 (감점 없음)'}
              </span>
            </div>

            <button
              type="button"
              className={`kpi-tile clickable ${tierFilter === 'safety' ? 'active-safety' : ''}`}
              onClick={() => setTierFilter((prev) => (prev === 'safety' ? 'all' : 'safety'))}
            >
              <span className="kpi-label">안정 지원</span>
              <div className="kpi-value tier-text-safety">
                <AnimatedNumber value={meta.safetyCount} />
                <small>개교</small>
              </div>
              <span className="kpi-sub">추정 적합도 75% 이상</span>
            </button>

            <button
              type="button"
              className={`kpi-tile clickable ${tierFilter === 'target' ? 'active-target' : ''}`}
              onClick={() => setTierFilter((prev) => (prev === 'target' ? 'all' : 'target'))}
            >
              <span className="kpi-label">적정 지원</span>
              <div className="kpi-value tier-text-target">
                <AnimatedNumber value={meta.targetCount} />
                <small>개교</small>
              </div>
              <span className="kpi-sub">추정 적합도 45–74%</span>
            </button>

            <button
              type="button"
              className={`kpi-tile clickable ${tierFilter === 'reach' ? 'active-reach' : ''}`}
              onClick={() => setTierFilter((prev) => (prev === 'reach' ? 'all' : 'reach'))}
            >
              <span className="kpi-label">소신 지원</span>
              <div className="kpi-value tier-text-reach">
                <AnimatedNumber value={meta.reachCount} />
                <small>개교</small>
              </div>
              <span className="kpi-sub">추정 적합도 15–44%</span>
            </button>
          </div>

          {/* Interactive Score Simulation Stepper */}
          {onSimulateOffset && baseScore !== null && (
            <div className="sim-bar">
              <div className="sim-label-group">
                <span className="sim-title">점수 변동 시뮬레이션</span>
                <span className="sim-hint">
                  표준점수가 ±5점, ±10점 변할 때 지원 가능 대학 구간의 변화를 바로 확인하세요.
                </span>
              </div>
              <div className="sim-controls" role="group" aria-label="점수 오프셋 선택">
                {SIM_OFFSETS.map((offset) => {
                  const simulated = baseScore + offset;
                  const disabled = simulated < 200 || simulated > 450;
                  const active = simOffset === offset;
                  return (
                    <button
                      key={offset}
                      type="button"
                      disabled={disabled}
                      className={`sim-chip num ${active ? 'active' : ''}`}
                      onClick={() => onSimulateOffset(offset)}
                    >
                      {offset === 0 ? `기준 ${baseScore}` : `${offset > 0 ? '+' : ''}${offset}점`}
                    </button>
                  );
                })}
                {simOffset !== 0 && (
                  <button
                    type="button"
                    className="sim-reset-btn"
                    onClick={() => onSimulateOffset(0)}
                    aria-label="기준 점수로 복원"
                  >
                    <RotateCcw size={14} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.section>

      {/* Medical Track Special Notice */}
      {medicalNotice && (
        <div className="notice-banner" role="note">
          <AlertTriangle size={16} strokeWidth={1.8} className="notice-icon" />
          <p>{medicalNotice}</p>
        </div>
      )}

      {/* 2. Interactive Visual Eligibility Board (Search, Filter, Bookmark, Compare) */}
      <motion.section
        className="eligibility-board"
        aria-label="지원 가능 대학 목록 및 비교"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, delay: 0.05, ease: APPLE_EASE }}
      >
          <div className="board-header">
            <div>
              <h3 className="board-title">지원 가능 대학 한눈에 보기</h3>
              <p className="board-subtitle">
                대학 카드를 눌러 학과·전형 상세 정보를 확인하거나, 최대 4개 대학을 선택해 나란히 비교해보세요.
              </p>
            </div>
            <span className="board-count-pill num">
              {filteredUniversities.length}개 대학 표시
            </span>
          </div>

          {/* Rounded Filter & Search Toolbar */}
          <div className="board-toolbar">
            <div className="tier-pill-tabs" role="tablist" aria-label="지원 가능성 필터">
              {FILTER_TABS.map((tab) => {
                const isActive = tierFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`tier-tab-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setTierFilter(tab.id)}
                  >
                    {isActive && (
                      <motion.span
                        layoutId={`${layoutPrefix}-tier-pill`}
                        className="tier-tab-pill-bg"
                        transition={{ duration: 0.25, ease: APPLE_EASE }}
                      />
                    )}
                    <span className="tier-tab-text">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="board-search-row">
              <div className="board-search-box">
                <Search size={15} strokeWidth={1.8} className="search-icon" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="대학 또는 학과 검색"
                  aria-label="결과 내 대학 또는 학과 검색"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="검색어 지우기"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="group-filter-pills" role="group" aria-label="모집군 필터">
                {GROUP_FILTERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`group-pill-btn ${groupFilter === g ? 'active' : ''}`}
                    onClick={() => setGroupFilter(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Visual University Cards Grid */}
          {filteredUniversities.length === 0 ? (
            <div className="board-empty">
              <p className="board-empty-title">선택한 조건에 해당하는 대학이 없습니다.</p>
              <p className="board-empty-desc">
                필터를 &lsquo;전체&rsquo;로 변경하거나 검색어를 비워 전체 서울권 대학을 확인해보세요.
              </p>
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={() => {
                  setTierFilter('all');
                  setGroupFilter('전체');
                  setSearchQuery('');
                }}
              >
                필터 초기화
              </button>
            </div>
          ) : (
            <motion.div className="uni-visual-grid" layout>
              <AnimatePresence mode="popLayout">
                {filteredUniversities.map((entry, idx) => {
                  const tier = TIER_META[entry.bucket] || TIER_META.target;
                  const bookmarked = isBookmarked(entry.id);
                  const comparing = isComparing(entry.id);
                  const deltaSign = entry.scoreDelta > 0 ? '+' : '';

                  return (
                    <motion.article
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{
                        duration: 0.28,
                        delay: Math.min(idx * 0.025, 0.2),
                        ease: APPLE_EASE,
                      }}
                      whileHover={{ y: -3 }}
                      className={`uni-v-card ${comparing ? 'is-comparing' : ''}`}
                    >
                      {/* Clickable Main Info Area -> Opens Detail Sheet */}
                      <div
                        className="uni-v-body"
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          openDetail({ ...entry, effectiveScore: meta.effectiveScore })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDetail({ ...entry, effectiveScore: meta.effectiveScore });
                          }
                        }}
                      >
                        <div className="uni-v-top">
                          <div className="uni-v-identity">
                            <div className="uni-v-badges">
                              <span className={`tier-badge ${entry.bucket}`}>
                                <span className="tier-dot" />
                                {tier.label}
                              </span>
                              <span className="uni-v-group">{entry.group}</span>
                            </div>
                            <h4 className="uni-v-name">{entry.university}</h4>
                            <p className="uni-v-dept">
                              {entry.department}
                              {!entry.exactMatch && (
                                <span className="uni-v-fallback">동일 계열 대표</span>
                              )}
                            </p>
                          </div>

                          <div className="uni-v-metric num">
                            <span className={`uni-v-prob tier-text-${entry.bucket}`}>
                              {entry.probability}%
                            </span>
                            <span className="uni-v-prob-sub">추정 적합도</span>
                          </div>
                        </div>

                        {/* Visual Cutoff Position Gauge */}
                        <div className="uni-v-gauge">
                          <div className="uni-v-track" aria-hidden="true">
                            <div
                              className={`uni-v-band ${entry.bucket}`}
                              style={{
                                left: `${toPct(entry.cutoffRange.min)}%`,
                                width: `${Math.max(
                                  6,
                                  toPct(entry.cutoffRange.max) - toPct(entry.cutoffRange.min)
                                )}%`,
                              }}
                            />
                            <div
                              className={`uni-v-avg ${entry.bucket}`}
                              style={{ left: `${toPct(entry.cutoffRange.avg)}%` }}
                            />
                            <div
                              className="uni-v-user-pin"
                              style={{ left: `${toPct(meta.effectiveScore)}%` }}
                            />
                          </div>
                          <div className="uni-v-gauge-meta num">
                            <span>
                              2025 평균 <strong>{entry.cutoff}점</strong> ({entry.cutoffRange.min}–
                              {entry.cutoffRange.max})
                            </span>
                            <span className={entry.scoreDelta >= 0 ? 'pos' : 'neg'}>
                              평균 대비 {deltaSign}
                              {entry.scoreDelta}점
                            </span>
                          </div>
                        </div>

                        <p className="uni-v-admission">{entry.admissionType} · 영어 {entry.englishRule}</p>
                      </div>

                      {/* Card Footer Action Bar */}
                      <div className="uni-v-actions">
                        <button
                          type="button"
                          className={`uni-v-act-btn ${bookmarked ? 'active-save' : ''}`}
                          onClick={() =>
                            toggleBookmark(entry.id, entry.department, entry.university)
                          }
                        >
                          {bookmarked ? (
                            <Check size={14} strokeWidth={2.2} />
                          ) : (
                            <Bookmark size={14} strokeWidth={1.8} />
                          )}
                          {bookmarked ? '저장됨' : '관심 저장'}
                        </button>

                        <button
                          type="button"
                          className={`uni-v-act-btn ${comparing ? 'active-compare' : ''}`}
                          onClick={() => toggleCompare(entry.id, entry.university)}
                        >
                          <Scale size={14} strokeWidth={1.8} />
                          {comparing ? '비교 담김' : '비교 담기'}
                        </button>

                        <button
                          type="button"
                          className="uni-v-detail-link"
                          onClick={() =>
                            openDetail({ ...entry, effectiveScore: meta.effectiveScore })
                          }
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
          )}
      </motion.section>

      {/* 3. Precision Cutoff Range Distribution Chart */}
      <ScrollReveal delay={0.05}>
        <CutoffRangeChart
          items={chartItems}
          userScore={meta.effectiveScore}
          showAll={showAllChart}
          onToggleShowAll={setShowAllChart}
          totalCount={allEvaluated.length}
          onSelectUniversity={(item) =>
            openDetail({ ...item, effectiveScore: meta.effectiveScore })
          }
        />
      </ScrollReveal>

      {/* 4. Personalized Strategy Cards */}
      {tips && tips.length > 0 && (
        <ScrollReveal delay={0.05}>
          <section className="strategy-section" aria-label="맞춤형 지원 전략">
            <div className="section-heading-row">
              <h3 className="section-heading">맞춤형 지원 전략</h3>
              <p className="section-subheading">
                입력하신 계열과 점수대, 영어 등급을 종합해 확인해야 할 핵심 전략입니다.
              </p>
            </div>
            <div className="strategy-grid">
              {tips.map((tip, idx) => (
                <div key={idx} className="strategy-item">
                  <span className="strategy-tag">{tip.tag}</span>
                  <h4 className="strategy-item-title">{tip.title}</h4>
                  <p className="strategy-item-body">{tip.body}</p>
                </div>
              ))}
            </div>
          </section>
        </ScrollReveal>
      )}

      {/* 5. Reference Guide Accordion */}
      {guide && guide.length > 0 && (
        <ScrollReveal delay={0.05}>
          <section className="guide-section" aria-label="정시 지원 핵심 가이드">
            <div className="section-heading-row">
              <h3 className="section-heading">정시 지원 핵심 가이드</h3>
              <p className="section-subheading">
                원서 접수 전 반드시 점검해야 할 반영비율·영어 감점·모집군 배치 기준을 정리했습니다.
              </p>
            </div>

            <div className="guide-accordion">
              {guide.map((item) => {
                const isOpen = openGuideId === item.id;
                return (
                  <div key={item.id} className={`guide-row ${isOpen ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="guide-trigger"
                      aria-expanded={isOpen}
                      onClick={() => setOpenGuideId(isOpen ? null : item.id)}
                    >
                      <div className="guide-trigger-text">
                        <span className="guide-q">{item.title}</span>
                        <span className="guide-summary">{item.summary}</span>
                      </div>
                      <ChevronDown
                        size={17}
                        strokeWidth={1.8}
                        className={`guide-chevron ${isOpen ? 'rotated' : ''}`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.24, ease: APPLE_EASE }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div className="guide-body">{item.content}</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </section>
        </ScrollReveal>
      )}

      {/* 6. Transparent Data Provenance */}
      {dataSources && (
        <footer className="provenance-card">
          <div className="provenance-title">
            <Info size={14} strokeWidth={1.9} />
            <span>데이터 출처 및 추정치 산출 기준</span>
          </div>
          <p className="provenance-text">
            {dataSources.primary} 및 {dataSources.secondary} ({dataSources.baseYear}학년도 정시 기준) 데이터를 바탕으로
            입력하신 표준점수와 대학별 합격선 범위(최저–최고)의 상대적 위치를 계산한 참고 지표입니다.{' '}
            {dataSources.note}
          </p>
        </footer>
      )}
    </div>
  );
}
