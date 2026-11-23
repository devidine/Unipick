import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  History,
  Info,
  RotateCcw,
  Scale,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useBookmarks } from '../contexts/bookmarks-context';
import { APPLE_EASE, TIER_META } from '../utils/admission';
import CutoffRangeChart from './CutoffRangeChart';
import PortfolioSimulator from './PortfolioSimulator';
import { AnimatedNumber, ScrollReveal } from './MotionPrimitives';
import './AnalysisReport.css';

const TIER_FILTERS = [
  { key: 'supportable', label: '지원 가능 전체' },
  { key: 'safety', label: '안정 지원' },
  { key: 'target', label: '적정 지원' },
  { key: 'reach', label: '소신 지원' },
  { key: 'all', label: '전체 21개교' },
];

const GROUP_FILTERS = ['전체', '가군', '나군', '다군'];

const SCORE_OFFSETS = [-10, -5, 0, +5, +10];

const ADMISSION_GUIDES = [
  {
    id: 'conversion',
    question: '표준점수 단순 합산과 대학별 환산점수는 어떻게 다른가요?',
    summary: '영역별 반영비율(국·수·탐)과 탐구 변환표준점수가 당락을 좌우합니다.',
    detail:
      '수능 표준점수 총점이 같더라도 국어 강세 대학(성균관대·경희대 인문 등)과 수학 강세 대학(서강대·서울대·한양대 자연 등)에 따라 유불리가 최대 3~6점까지 벌어집니다. 과목별 점수 계산기에 국·수·탐 점수를 입력하면 대학별 반영비율 유불리를 자동으로 계산해 드립니다.',
  },
  {
    id: 'group-strategy',
    question: '가·나·다군 3장 원서 조합은 어떤 비율로 구성하는 것이 좋나요?',
    summary: '안정 1장 · 적정 1장 · 소신 1장의 균형 배치가 표준 전략입니다.',
    detail:
      '정시 모집은 가·나·다군 각 1장씩 총 3번의 기회가 주어집니다. 다군(중앙대·성균관대·한양대·건국대·홍익대 등)은 상위권 중복 합격으로 예비번호 충원율이 90~165%로 높게 형성되므로, 상단의 가·나·다군 3장 원서 배치 시뮬레이터를 활용해 전년도 충원율까지 고려한 조합을 설계하세요.',
  },
];

export default function AnalysisReport({
  report,
  baseScore,
  simOffset = 0,
  onSimulateOffset,
  simulating = false,
  isPreview = false,
  onSaveSnapshot,
  onCopyShareLink,
  onCopyReportSummary,
}) {
  const {
    isBookmarked,
    toggleBookmark,
    isComparing,
    toggleCompare,
    openDetail,
  } = useBookmarks();

  const [tierFilter, setTierFilter] = useState('supportable');
  const [groupFilter, setGroupFilter] = useState('전체');
  const [searchQuery, setSearchQuery] = useState('');
  const [openGuideId, setOpenGuideId] = useState(null);

  const meta = report?.meta;

  const filteredUniversities = useMemo(() => {
    const allUnis = meta?.universities || [];
    return allUnis.filter((u) => {
      if (tierFilter === 'supportable' && u.bucket === 'challenge') return false;
      if (tierFilter === 'safety' && u.bucket !== 'safety') return false;
      if (tierFilter === 'target' && u.bucket !== 'target') return false;
      if (tierFilter === 'reach' && u.bucket !== 'reach') return false;

      if (groupFilter !== '전체') {
        const hasGroup = Array.isArray(u.groups)
          ? u.groups.includes(groupFilter)
          : String(u.group || '').includes(groupFilter.replace('군', ''));
        if (!hasGroup) return false;
      }

      if (searchQuery.trim()) {
        const kw = searchQuery.trim().toLowerCase();
        const matchName =
          u.university.toLowerCase().includes(kw) ||
          u.shortName.toLowerCase().includes(kw) ||
          (u.department && u.department.toLowerCase().includes(kw));
        if (!matchName) return false;
      }

      return true;
    });
  }, [meta?.universities, tierFilter, groupFilter, searchQuery]);

  if (!meta) return null;

  // 미니 합격선 바 계산 (310 ~ 420)
  const minAxis = 310;
  const maxAxis = 420;
  const toPct = (v) => Math.max(0, Math.min(100, ((v - minAxis) / (maxAxis - minAxis)) * 100));

  return (
    <motion.div
      className={`analysis-report ${simulating ? 'is-simulating' : ''}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: APPLE_EASE }}
    >
      {/* Preview Mode Banner */}
      {isPreview && (
        <div className="preview-banner">
          <Sparkles size={15} strokeWidth={1.9} />
          <span>
            <strong>실시간 입시 분석</strong> — 상단 성적이나 희망 학과를 변경하면 별도 버튼 클릭 없이도 지원 가능 대학과 3장 원서 포트폴리오가 즉시 재계산됩니다.
          </span>
        </div>
      )}

      {/* 1. Space Black & Graphite Executive Summary Banner */}
      <section className="report-summary-card">
        {simulating && <div className="summary-live-sweep" aria-hidden="true" />}
        <div className="summary-top-row">
          <div>
            <div className="summary-eyebrow">
              <span>{meta.category}계열</span>
              <span className="dot">·</span>
              <span>희망 전공: {meta.major}</span>
              <span className="dot">·</span>
              <span>영어 {meta.englishGrade}등급</span>
              {simOffset !== 0 && (
                <>
                  <span className="dot">·</span>
                  <span className="sim-active-badge">
                    점수 시뮬레이션 {simOffset > 0 ? `+${simOffset}` : simOffset}점 적용 중
                  </span>
                </>
              )}
            </div>
            <h2 className="summary-level">
              {meta.level}
              <span className="summary-percentile">({meta.percentileEstimate})</span>
            </h2>
          </div>

          <div className="summary-top-actions">
            <span className="summary-saved-pill">
              <span className="live-dot" />
              {report.saved ? '실시간 저장 완료' : '실시간 자동 분석'}
            </span>
            {onSaveSnapshot && (
              <button
                type="button"
                className="summary-action-btn"
                onClick={onSaveSnapshot}
                title="현재 분석 조건과 결과를 분석 내역에 저장합니다"
              >
                <History size={13} strokeWidth={2} />
                내역 저장
              </button>
            )}
            {onCopyShareLink && (
              <button
                type="button"
                className="summary-action-btn"
                onClick={onCopyShareLink}
                title="현재 성적·전공 조건이 담긴 공유 링크를 복사합니다"
              >
                <Share2 size={13} strokeWidth={2} />
                링크 공유
              </button>
            )}
            {onCopyReportSummary && (
              <button
                type="button"
                className="summary-action-btn"
                onClick={onCopyReportSummary}
                title="분석 리포트 요약 텍스트를 클립보드에 복사합니다"
              >
                <Copy size={13} strokeWidth={2} />
                요약 복사
              </button>
            )}
          </div>
        </div>

        <p className="summary-desc">
          입력하신 표준점수 합 <strong>{meta.score}점</strong>을 기준으로 서울 주요 21개 대학의 학과별 세분화 합격선·영어 감점·영역별 반영비율을 분석한 결과, 총{' '}
          <strong>{meta.supportableCount}개 대학</strong>이 지원 가능 구간(안정·적정·소신)에 해당합니다.
        </p>

        {/* Subject Balance Profile Strip (when 4-subject scores are provided) */}
        {meta.subjectProfile && (
          <div className="subject-profile-strip">
            <div className="subject-profile-badge">
              <SlidersHorizontal size={13} strokeWidth={2} />
              <strong>{meta.subjectProfile.strengthType}</strong>
            </div>
            <div className="subject-profile-scores num">
              <span>국어 {meta.subjectProfile.kor}점 ({meta.subjectProfile.korPct}%)</span>
              <span className="dot">·</span>
              <span>수학 {meta.subjectProfile.math}점 ({meta.subjectProfile.mathPct}%)</span>
              <span className="dot">·</span>
              <span>탐구합 {meta.subjectProfile.inq}점 ({meta.subjectProfile.inqPct}%)</span>
            </div>
            <p className="subject-profile-summary">{meta.subjectProfile.summary}</p>
          </div>
        )}

        {/* 4 Key KPI Tiles with Animated Count-Up Numbers */}
        <div className="kpi-grid num">
          <div className="kpi-tile score-tile">
            <span className="kpi-label">내 표준점수 합</span>
            <strong className="kpi-value">
              <AnimatedNumber value={meta.score} />
              <small>점</small>
            </strong>
            <span className="kpi-sub">
              {meta.englishPenalty < 0
                ? `영어 ${meta.englishGrade}등급 대학별 차등 감점 적용`
                : '영어 1등급 감점 없음'}
            </span>
          </div>

          <button
            type="button"
            className={`kpi-tile clickable ${tierFilter === 'safety' ? 'active-safety' : ''}`}
            onClick={() => setTierFilter(tierFilter === 'safety' ? 'supportable' : 'safety')}
          >
            <span className="kpi-label">안정 지원</span>
            <strong className="kpi-value tier-text-safety">
              <AnimatedNumber value={meta.safetyCount} />
              <small>개교</small>
            </strong>
            <span className="kpi-sub">추정 적합도 75% 이상</span>
          </button>

          <button
            type="button"
            className={`kpi-tile clickable ${tierFilter === 'target' ? 'active-target' : ''}`}
            onClick={() => setTierFilter(tierFilter === 'target' ? 'supportable' : 'target')}
          >
            <span className="kpi-label">적정 지원</span>
            <strong className="kpi-value tier-text-target">
              <AnimatedNumber value={meta.targetCount} />
              <small>개교</small>
            </strong>
            <span className="kpi-sub">추정 적합도 45% – 74%</span>
          </button>

          <button
            type="button"
            className={`kpi-tile clickable ${tierFilter === 'reach' ? 'active-reach' : ''}`}
            onClick={() => setTierFilter(tierFilter === 'reach' ? 'supportable' : 'reach')}
          >
            <span className="kpi-label">소신 지원</span>
            <strong className="kpi-value tier-text-reach">
              <AnimatedNumber value={meta.reachCount} />
              <small>개교</small>
            </strong>
            <span className="kpi-sub">추정 적합도 15% – 44%</span>
          </button>
        </div>

        {/* Score What-If Simulation Strip */}
        {baseScore && onSimulateOffset && (
          <div className="sim-bar">
            <div className="sim-label-group">
              <span className="sim-title">점수 변동 시뮬레이션</span>
              <span className="sim-hint">
                기준 {baseScore}점에서 점수 증감 시 지원 가능 대학 변화를 즉시 비교합니다
              </span>
            </div>
            <div className="sim-controls num">
              {SCORE_OFFSETS.map((offset) => {
                const targetScore = baseScore + offset;
                if (targetScore < 200 || targetScore > 450) return null;
                const active = simOffset === offset;
                return (
                  <button
                    key={offset}
                    type="button"
                    className={`sim-chip ${active ? 'active' : ''}`}
                    disabled={simulating}
                    onClick={() => onSimulateOffset(offset)}
                  >
                    {offset === 0 ? `기준 (${baseScore}점)` : `${offset > 0 ? `+${offset}` : offset}점`}
                  </button>
                );
              })}
              {simOffset !== 0 && (
                <button
                  type="button"
                  className="sim-reset-btn"
                  onClick={() => onSimulateOffset(0)}
                  title="원래 점수로 복원"
                >
                  <RotateCcw size={13} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Special Notice if No Supportable Universities */}
      {meta.supportableCount === 0 && (
        <div className="notice-banner">
          <AlertCircle size={18} strokeWidth={1.9} className="notice-icon" />
          <div>
            <strong>현재 점수대에서는 서울 주요 21개 대학이 모두 도전 구간(15% 미만)에 해당합니다.</strong>
            <p>
              아래 필터에서 <strong>전체 21개교</strong> 탭을 선택하면 각 대학과의 점수 격차를 확인할 수 있으며, 상단 점수 시뮬레이션 버튼(+5점, +10점)으로 목표 점수대를 탐색해 보세요.
            </p>
          </div>
        </div>
      )}

      {/* 2. Interactive 3-Slot Application Portfolio Simulator (가·나·다군 3장 배치) */}
      <PortfolioSimulator meta={meta} />

      {/* 3. Direct University Eligibility Explorer */}
      <section className="eligibility-board" aria-label="대학별 지원 가능성 목록">
          <div className="board-header">
            <div>
              <h3 className="board-title">대학별 지원 가능성</h3>
              <p className="board-subtitle">
                학과별 보정 합격선·경쟁률·충원율·영어 감점 유불리를 한눈에 비교하고 관심 대학을 저장하세요
              </p>
            </div>
            <span className="board-count-pill num">
              표시 중 <strong>{filteredUniversities.length}</strong> / {meta.totalEvaluated}개교
            </span>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="board-toolbar">
            <div className="tier-pill-tabs" role="tablist" aria-label="지원 가능성 구분 필터">
              {TIER_FILTERS.map((f) => {
                const count =
                  f.key === 'supportable'
                    ? meta.supportableCount
                    : f.key === 'safety'
                      ? meta.safetyCount
                      : f.key === 'target'
                        ? meta.targetCount
                        : f.key === 'reach'
                          ? meta.reachCount
                          : meta.totalEvaluated;

                const isActive = tierFilter === f.key;

                return (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`tier-tab-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setTierFilter(f.key)}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="reportTierFilterPill"
                        className="tier-tab-pill-bg"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="tier-tab-text">
                      {f.label} <span className="num">({count})</span>
                    </span>
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
                  placeholder="대학명 또는 학과명 빠른 검색 (예: 성균관대, 반도체, 경영)"
                  aria-label="지원 가능 대학 검색"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="검색어 지우기"
                  >
                    <X size={13} strokeWidth={2} />
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

          {/* University Cards Grid */}
          {filteredUniversities.length > 0 ? (
            <motion.div layout className="uni-visual-grid">
              <AnimatePresence mode="popLayout">
                {filteredUniversities.map((u, idx) => {
                  const bookmarked = isBookmarked(u.id);
                  const comparing = isComparing(u.id);
                  const tierInfo = TIER_META[u.bucket] || TIER_META.challenge;

                  return (
                    <motion.article
                      layout
                      key={u.id}
                      initial={{ opacity: 0, y: 12, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{
                        duration: 0.28,
                        delay: Math.min(idx * 0.025, 0.2),
                        ease: APPLE_EASE,
                      }}
                      whileHover={{ y: -3 }}
                      className={`uni-v-card tier-card-${u.bucket} ${comparing ? 'is-comparing' : ''}`}
                    >
                      <div
                        className="uni-v-body"
                        onClick={() => openDetail(u)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDetail(u);
                          }
                        }}
                      >
                        <div className="uni-v-top">
                          <div className="uni-v-identity">
                            <div className="uni-v-badges">
                              <span className={`tier-badge ${u.bucket}`}>
                                <span className="tier-dot" />
                                {tierInfo.label}
                              </span>
                              <span className="uni-v-group">{u.group}</span>
                              {u.deptAdjustment !== undefined && u.deptAdjustment !== 0 && (
                                <span className="uni-v-dept-tier">
                                  {u.deptTierLabel} ({u.deptAdjustment > 0 ? `+${u.deptAdjustment}` : u.deptAdjustment}점)
                                </span>
                              )}
                            </div>
                            <h4 className="uni-v-name">{u.university}</h4>
                            <p className="uni-v-dept">
                              {u.department}
                              {!u.isExactMatch && <span className="uni-v-fallback">유사 모집단위</span>}
                            </p>
                          </div>

                          <div className="uni-v-metric num">
                            <strong className={`uni-v-prob tier-text-${u.bucket}`}>
                              <AnimatedNumber value={u.probability} suffix="%" />
                            </strong>
                            <span className="uni-v-prob-sub">추정 적합도</span>
                          </div>
                        </div>

                        {/* Visual Cutoff Gauge */}
                        <div className="uni-v-gauge">
                          <div className="uni-v-track" aria-hidden="true">
                            <div
                              className={`uni-v-band ${u.bucket}`}
                              style={{
                                left: `${toPct(u.cutoffRange.min)}%`,
                                width: `${Math.max(5, toPct(u.cutoffRange.max) - toPct(u.cutoffRange.min))}%`,
                              }}
                            />
                            <div
                              className={`uni-v-avg ${u.bucket}`}
                              style={{ left: `${toPct(u.cutoff)}%` }}
                            />
                            <div
                              className="uni-v-user-pin"
                              style={{ left: `${toPct(u.effectiveScore ?? meta.effectiveScore)}%` }}
                            />
                          </div>
                          <div className="uni-v-gauge-meta num">
                            <span>
                              학과 기준 컷 <strong>{u.cutoff}점</strong> ({u.cutoffRange.min}–{u.cutoffRange.max})
                            </span>
                            <span className={u.scoreDelta >= 0 ? 'pos' : 'neg'}>
                              내 환산 {u.scoreDelta > 0 ? '+' : ''}
                              {u.scoreDelta}점
                            </span>
                          </div>
                        </div>

                        {/* Real-World Admission Metrics & Advantage Chips */}
                        <div className="uni-v-meta-chips num">
                          <span className="uni-v-chip">
                            경쟁률 {u.competitionRate ?? 5.0}:1
                          </span>
                          <span className="uni-v-chip">
                            충원율 {u.waitlistRatio ?? 75}%
                          </span>
                          {u.weights && (
                            <span className="uni-v-chip">
                              국{Math.round(u.weights.kor)}·수{Math.round(u.weights.math)}·탐{Math.round(u.weights.inq)}
                            </span>
                          )}
                          {u.englishAdvantage && (
                            <span className="uni-v-chip advantage">
                              영어 감점 최소 ({u.englishPenalty}점)
                            </span>
                          )}
                          {u.weightDelta !== undefined && Math.abs(u.weightDelta) >= 0.5 && (
                            <span
                              className={`uni-v-chip ${u.weightDelta > 0 ? 'advantage' : 'caution'}`}
                            >
                              {u.weightAdvantageLabel} ({u.weightDelta > 0 ? '+' : ''}
                              {u.weightDelta}점)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Footer Quick Actions */}
                      <div className="uni-v-actions">
                        <button
                          type="button"
                          className={`uni-v-act-btn ${bookmarked ? 'active-save' : ''}`}
                          onClick={() => toggleBookmark(u.id, u.department, u.university)}
                        >
                          {bookmarked ? <Check size={14} strokeWidth={2.2} /> : <Bookmark size={14} strokeWidth={1.8} />}
                          <span>{bookmarked ? '저장됨' : '관심 저장'}</span>
                        </button>

                        <button
                          type="button"
                          className={`uni-v-act-btn ${comparing ? 'active-compare' : ''}`}
                          onClick={() => toggleCompare(u.id, u.university)}
                        >
                          <Scale size={14} strokeWidth={1.8} />
                          <span>{comparing ? '비교 중' : '비교 담기'}</span>
                        </button>

                        <button
                          type="button"
                          className="uni-v-detail-link"
                          onClick={() => openDetail(u)}
                        >
                          <span>입시 정보</span>
                          <ChevronRight size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          ) : (
            <div className="board-empty">
              <p className="board-empty-title">선택한 필터 조건에 해당하는 대학이 없습니다.</p>
              <p className="board-empty-desc">
                전체 21개교 탭으로 전환하거나 검색어 및 모집군 필터를 초기화해 보세요.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setTierFilter('all');
                  setGroupFilter('전체');
                  setSearchQuery('');
                }}
              >
                전체 21개 대학 보기
              </button>
            </div>
          )}
        </section>

      {/* 4. Cutoff Range Distribution Chart */}
      <ScrollReveal delay={0.07}>
        <CutoffRangeChart
          universities={meta.universities}
          userScore={meta.effectiveScore}
          onSelectUniversity={(u) => openDetail(u)}
        />
      </ScrollReveal>

      {/* 5. Strategic Advice Section */}
      {meta.strategyPoints && meta.strategyPoints.length > 0 && (
        <ScrollReveal delay={0.09}>
          <section className="strategy-section">
            <div className="section-heading-row">
              <h3 className="section-heading">맞춤 지원 전략 포인트</h3>
              <p className="section-subheading">
                현재 점수대와 희망 전공({meta.major})에서 우선 점검해야 할 정시 핵심 체크리스트입니다
              </p>
            </div>
            <div className="strategy-grid">
              {meta.strategyPoints.map((pt, i) => (
                <div key={i} className="strategy-item">
                  <span className="strategy-tag">Point 0{i + 1}</span>
                  <h4 className="strategy-item-title">
                    {i === 0 ? '모집군 포트폴리오 배분' : i === 1 ? '영어 등급 및 대학별 유불리' : '영역별 반영비율 최적화'}
                  </h4>
                  <p className="strategy-item-body">{pt}</p>
                </div>
              ))}
            </div>
          </section>
        </ScrollReveal>
      )}

      {/* 6. Essential Admissions FAQ Accordion */}
      <ScrollReveal delay={0.1}>
        <section className="guide-section">
          <div className="section-heading-row">
            <h3 className="section-heading">정시 지표 해석 가이드</h3>
          </div>
          <div className="guide-accordion">
            {ADMISSION_GUIDES.map((g) => {
              const isOpen = openGuideId === g.id;
              return (
                <div key={g.id} className={`guide-row ${isOpen ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="guide-trigger"
                    onClick={() => setOpenGuideId(isOpen ? null : g.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="guide-trigger-text">
                      <span className="guide-q">{g.question}</span>
                      <span className="guide-summary">{g.summary}</span>
                    </div>
                    <ChevronDown
                      size={18}
                      strokeWidth={1.8}
                      className={`guide-chevron ${isOpen ? 'rotated' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="guide-body">
                      <p>{g.detail}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </ScrollReveal>

      {/* 7. Data Provenance & Disclaimer */}
      <footer className="provenance-card">
        <div className="provenance-title">
          <Info size={14} strokeWidth={1.9} />
          <span>데이터 산출 기준 및 유의사항 ({meta.dataSources?.year || '2025학년도 정시모집'})</span>
        </div>
        <p className="provenance-text">
          {meta.dataSources?.disclaimer}
        </p>
      </footer>
    </motion.div>
  );
}
