import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpDown,
  Bookmark,
  Check,
  ChevronRight,
  Scale,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useBookmarks } from '../contexts/bookmarks-context';
import { APPLE_EASE, TIER_META, calcLocalEvaluation } from '../utils/admission';
import './UniversitiesPage.css';

const CATEGORY_TABS = ['전체', '인문', '자연', '예체능'];
const SORT_OPTIONS = [
  { id: 'cutoff_desc', label: '커트라인 높은순' },
  { id: 'cutoff_asc', label: '낮은순' },
  { id: 'name_asc', label: '가나다순' },
];

export default function UniversitiesPage({
  universities = [],
  loading = false,
  referenceScore = null,
}) {
  const { isBookmarked, toggleBookmark, isComparing, toggleCompare, openDetail } = useBookmarks();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('전체');
  const [sortBy, setSortBy] = useState('cutoff_desc');
  const [compareScore, setCompareScore] = useState(() =>
    referenceScore ? String(referenceScore) : ''
  );

  const parsedCompareScore = useMemo(() => {
    if (!compareScore.trim()) return null;
    const n = Number(compareScore);
    return Number.isFinite(n) && n >= 200 && n <= 450 ? Number(n.toFixed(1)) : null;
  }, [compareScore]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = universities.filter((u) => {
      if (category !== '전체' && (!u.departments[category] || u.departments[category].length === 0)) {
        return false;
      }
      if (!q) return true;
      if (u.university.toLowerCase().includes(q) || u.shortName.toLowerCase().includes(q)) {
        return true;
      }
      return Object.values(u.departments).some((depts) =>
        depts.some((d) => d.toLowerCase().includes(q))
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'cutoff_asc') return a.cutoff - b.cutoff;
      if (sortBy === 'name_asc') return a.university.localeCompare(b.university, 'ko');
      return b.cutoff - a.cutoff;
    });
  }, [universities, query, category, sortBy]);

  const minAxis = 305;
  const maxAxis = 420;
  const toPct = (v) => Math.max(0, Math.min(100, ((v - minAxis) / (maxAxis - minAxis)) * 100));

  return (
    <div className="universities-page">
      <div className="page-container uni-layout">
        <header className="uni-page-header">
          <h1 className="uni-page-title">서울권 21개 대학 탐색</h1>
          <p className="uni-page-desc">
            대학별 2025학년도 정시 합격선과 개설 학과, 전형 조건을 시각적으로 비교하고 관심 대학을 저장하세요.
          </p>
        </header>

        {/* Rounded Filter & Score Comparison Toolbar */}
        <div className="uni-toolbar">
          <div className="toolbar-search">
            <Search size={16} strokeWidth={1.8} className="search-icon" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="대학명 또는 학과명 검색 (예: 서울대, 컴퓨터)"
              aria-label="대학 또는 학과 검색"
            />
            {query && (
              <button
                type="button"
                className="clear-icon-btn"
                onClick={() => setQuery('')}
                aria-label="검색어 지우기"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="toolbar-controls">
            <div className="toolbar-pills" role="tablist" aria-label="계열 필터">
              {CATEGORY_TABS.map((cat) => {
                const isActive = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`toolbar-pill ${isActive ? 'active' : ''}`}
                    onClick={() => setCategory(cat)}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="uni-cat-pill"
                        className="toolbar-pill-bg"
                        transition={{ duration: 0.24, ease: APPLE_EASE }}
                      />
                    )}
                    <span className="toolbar-pill-text">{cat}</span>
                  </button>
                );
              })}
            </div>

            <div className="compare-score-input">
              <SlidersHorizontal size={13} strokeWidth={1.9} />
              <label htmlFor="uni-compare-score">내 점수 비교</label>
              <input
                id="uni-compare-score"
                type="number"
                min={200}
                max={450}
                placeholder="예: 378"
                value={compareScore}
                onChange={(e) => setCompareScore(e.target.value)}
                className="num"
              />
            </div>

            <div className="toolbar-sort" role="group" aria-label="정렬 기준">
              <ArrowUpDown size={13} strokeWidth={1.8} className="sort-icon" aria-hidden="true" />
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`sort-pill ${sortBy === opt.id ? 'active' : ''}`}
                  onClick={() => setSortBy(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Count Meta */}
        <div className="uni-meta-line">
          <span className="num">총 {filtered.length}개 대학</span>
          {parsedCompareScore && (
            <span className="compare-active-note num">
              기준 점수 <strong>{parsedCompareScore}점</strong> 대비 추정 지원 구간 표시 중
            </span>
          )}
        </div>

        {/* Visual University Card Grid */}
        {loading ? (
          <div className="uni-explorer-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton uni-skeleton-card" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="uni-empty-box">
            조건에 맞는 대학이 없습니다. 검색어나 계열 필터를 조정해보세요.
          </div>
        ) : (
          <motion.div className="uni-explorer-grid" layout>
            <AnimatePresence mode="popLayout">
              {filtered.map((u, idx) => {
                const evalInfo = parsedCompareScore
                  ? calcLocalEvaluation(parsedCompareScore, u.cutoffRange)
                  : null;
                const tier = evalInfo ? TIER_META[evalInfo.bucket] : null;
                const bookmarked = isBookmarked(u.id);
                const comparing = isComparing(u.id);
                const previewDepts =
                  category !== '전체'
                    ? (u.departments[category] || []).slice(0, 4)
                    : [...(u.departments.인문 || []).slice(0, 2), ...(u.departments.자연 || []).slice(0, 2)];

                return (
                  <motion.article
                    key={u.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{
                      duration: 0.26,
                      delay: Math.min(idx * 0.02, 0.16),
                      ease: APPLE_EASE,
                    }}
                    whileHover={{ y: -3 }}
                    className={`uni-exp-card ${comparing ? 'is-comparing' : ''}`}
                  >
                    <div
                      className="uni-exp-body"
                      role="button"
                      tabIndex={0}
                      onClick={() => openDetail({ ...u, effectiveScore: parsedCompareScore })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openDetail({ ...u, effectiveScore: parsedCompareScore });
                        }
                      }}
                    >
                      <div className="uni-exp-top">
                        <div>
                          <div className="uni-exp-pills">
                            {tier && (
                              <span className={`tier-badge ${evalInfo.bucket}`}>
                                <span className="tier-dot" />
                                {tier.label}
                              </span>
                            )}
                            <span className="exp-group-tag">{u.group}</span>
                          </div>
                          <h2 className="uni-exp-name">{u.university}</h2>
                          <p className="uni-exp-type">{u.admissionType}</p>
                        </div>

                        <div className="uni-exp-cutoff num">
                          <strong>{u.cutoff}점</strong>
                          <span>평균 합격선</span>
                        </div>
                      </div>

                      {/* Visual Cutoff Position Track */}
                      <div className="exp-gauge">
                        <div className="exp-track" aria-hidden="true">
                          <div
                            className={`exp-band ${evalInfo?.bucket || 'target'}`}
                            style={{
                              left: `${toPct(u.cutoffRange.min)}%`,
                              width: `${Math.max(
                                6,
                                toPct(u.cutoffRange.max) - toPct(u.cutoffRange.min)
                              )}%`,
                            }}
                          />
                          <div
                            className={`exp-avg-dot ${evalInfo?.bucket || 'target'}`}
                            style={{ left: `${toPct(u.cutoffRange.avg)}%` }}
                          />
                          {parsedCompareScore && (
                            <div
                              className="exp-user-pin"
                              style={{ left: `${toPct(parsedCompareScore)}%` }}
                            />
                          )}
                        </div>
                        <div className="exp-gauge-meta num">
                          <span>범위 {u.cutoffRange.min}–{u.cutoffRange.max}점</span>
                          {evalInfo ? (
                            <span className={evalInfo.scoreDelta >= 0 ? 'pos' : 'neg'}>
                              {evalInfo.scoreDelta > 0 ? '+' : ''}
                              {evalInfo.scoreDelta}점 · 추정 {evalInfo.probability}%
                            </span>
                          ) : (
                            <span className="exp-eng-short">영어: {u.englishRule}</span>
                          )}
                        </div>
                      </div>

                      {/* Representative Departments */}
                      <div className="exp-dept-preview">
                        {previewDepts.map((dept) => (
                          <span key={dept} className="exp-dept-chip">
                            {dept}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="uni-exp-actions">
                      <button
                        type="button"
                        className={`uni-v-act-btn ${bookmarked ? 'active-save' : ''}`}
                        onClick={() => toggleBookmark(u.id, previewDepts[0] || '', u.university)}
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
                        onClick={() => toggleCompare(u.id, u.university)}
                      >
                        <Scale size={14} strokeWidth={1.8} />
                        {comparing ? '비교 담김' : '비교 담기'}
                      </button>

                      <button
                        type="button"
                        className="uni-v-detail-link"
                        onClick={() => openDetail({ ...u, effectiveScore: parsedCompareScore })}
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
      </div>
    </div>
  );
}
