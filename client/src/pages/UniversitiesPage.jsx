import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, Bookmark, Check, ChevronRight, Scale, Search, X } from 'lucide-react';
import { universityApi } from '../utils/api';
import { useBookmarks } from '../contexts/bookmarks-context';
import { APPLE_EASE, TIER_META, calcLocalEvaluation } from '../utils/admission';
import './UniversitiesPage.css';

const TRACK_TABS = [
  { id: 'all', label: '전체 계열' },
  { id: '인문', label: '인문계열' },
  { id: '자연', label: '자연계열' },
  { id: '예체능', label: '예체능계열' },
];

const GROUP_TABS = ['전체 군', '가군', '나군', '다군'];

const TIER_TABS = [
  { id: 'all', label: '전체 판정' },
  { id: 'safety', label: '안정 지원' },
  { id: 'target', label: '적정 지원' },
  { id: 'reach', label: '소신 지원' },
];

const SORT_OPTIONS = [
  { id: 'cutoff-desc', label: '합격선 높은 순' },
  { id: 'cutoff-asc', label: '합격선 낮은 순' },
  { id: 'waitlist-desc', label: '충원율 높은 순' },
  { id: 'name-asc', label: '대학명 가나다순' },
];

export default function UniversitiesPage({ referenceScore = null, onReferenceScoreChange }) {
  const {
    isBookmarked,
    toggleBookmark,
    isComparing,
    toggleCompare,
    openDetail,
  } = useBookmarks();

  const [universities, setUniversities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trackFilter, setTrackFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('전체 군');
  const [tierFilter, setTierFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('cutoff-desc');
  const [customScore, setCustomScore] = useState(null);

  const localScore = customScore !== null ? customScore : referenceScore ? String(referenceScore) : '';

  useEffect(() => {
    let active = true;
    universityApi
      .list()
      .then((data) => {
        if (active && data?.success) {
          setUniversities(data.universities || []);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const parsedScore = useMemo(() => {
    const n = Math.round(Number(localScore));
    return Number.isFinite(n) && n >= 200 && n <= 450 ? n : null;
  }, [localScore]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = universities
      .map((u) => {
        const evalData = parsedScore ? calcLocalEvaluation(parsedScore, u.cutoffRange) : null;
        return { ...u, evalData };
      })
      .filter((u) => {
        if (trackFilter !== 'all') {
          const depts = u.departments?.[trackFilter] || [];
          if (depts.length === 0) return false;
        }

        if (groupFilter !== '전체 군') {
          const hasGroup = Array.isArray(u.groups)
            ? u.groups.includes(groupFilter)
            : String(u.group || '').includes(groupFilter.replace('군', ''));
          if (!hasGroup) return false;
        }

        if (tierFilter !== 'all' && parsedScore && u.evalData) {
          if (u.evalData.bucket !== tierFilter) return false;
        }

        if (q) {
          const nameMatch =
            u.university.toLowerCase().includes(q) ||
            (u.shortName && u.shortName.toLowerCase().includes(q));
          const deptMatch = Object.values(u.departments || {}).some((arr) =>
            arr.some((d) => d.toLowerCase().includes(q))
          );
          if (!nameMatch && !deptMatch) return false;
        }
        return true;
      });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'cutoff-asc') return a.cutoff - b.cutoff;
      if (sortBy === 'waitlist-desc') return (b.waitlistRatio || 0) - (a.waitlistRatio || 0);
      if (sortBy === 'name-asc') return a.university.localeCompare(b.university, 'ko');
      return b.cutoff - a.cutoff;
    });
  }, [universities, trackFilter, groupFilter, tierFilter, searchQuery, sortBy, parsedScore]);

  const minAxis = 310;
  const maxAxis = 415;
  const toPct = (v) => Math.max(0, Math.min(100, ((v - minAxis) / (maxAxis - minAxis)) * 100));

  return (
    <div className="universities-page">
      <div className="page-container uni-layout">
        {/* Page Header */}
        <motion.header
          className="uni-page-header"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: APPLE_EASE }}
        >
          <span className="page-eyebrow">2025학년도 서울 주요 21개 대학 정시 기준</span>
          <h1 className="uni-page-title">대학 및 모집단위 탐색</h1>
          <p className="uni-page-desc">
            합격자 표준점수 분포, 모집군, 전년도 경쟁률·충원율, 국·수·탐 반영비율 및 주요 개설 학과를 비교해 보세요.
          </p>
        </motion.header>

        {/* Rounded Frosted Toolbar */}
        <section className="uni-toolbar" aria-label="대학 검색 및 필터">
          <div className="toolbar-search">
            <Search size={16} strokeWidth={1.8} className="search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="대학명 또는 학과명 검색 (예: 성균관대, 반도체, 경영, 의예과)"
              aria-label="대학 또는 학과 검색"
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-icon-btn"
                onClick={() => setSearchQuery('')}
                aria-label="검색어 지우기"
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </div>

          <div className="toolbar-controls">
            {/* Track Tabs */}
            <div className="toolbar-pills" role="tablist" aria-label="계열 필터">
              {TRACK_TABS.map((t) => {
                const isActive = trackFilter === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`toolbar-pill ${isActive ? 'active' : ''}`}
                    onClick={() => setTrackFilter(t.id)}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="uniExplorerTrackPill"
                        className="toolbar-pill-bg"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="toolbar-pill-text">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Recruitment Group Tabs (가군 / 나군 / 다군) */}
            <div className="toolbar-pills" role="group" aria-label="모집군 필터">
              {GROUP_TABS.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`toolbar-pill ${groupFilter === g ? 'active' : ''}`}
                  onClick={() => setGroupFilter(g)}
                >
                  <span className="toolbar-pill-text">{g}</span>
                </button>
              ))}
            </div>

            {/* Optional Quick Score Comparison Input */}
            <div className="compare-score-input">
              <label htmlFor="explorer-score">내 점수 대조</label>
              <input
                id="explorer-score"
                type="number"
                min={200}
                max={450}
                value={localScore}
                onChange={(e) => {
                  setCustomScore(e.target.value);
                  const n = Math.round(Number(e.target.value));
                  if (Number.isFinite(n) && n >= 200 && n <= 450 && onReferenceScoreChange) {
                    onReferenceScoreChange(n);
                  }
                }}
                placeholder="385"
                className="num"
              />
            </div>

            {/* Sort Options */}
            <div className="toolbar-sort">
              <ArrowUpDown size={13} strokeWidth={1.8} className="sort-icon" />
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`sort-pill ${sortBy === s.id ? 'active' : ''}`}
                  onClick={() => setSortBy(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Support Tier Filter Row (when score is available) */}
          {parsedScore && (
            <div className="toolbar-tier-row">
              <span className="toolbar-tier-label num">내 점수({parsedScore}점) 기준 판정 필터:</span>
              <div className="toolbar-tier-pills">
                {TIER_TABS.map((tb) => (
                  <button
                    key={tb.id}
                    type="button"
                    className={`tier-filter-chip ${tierFilter === tb.id ? 'active' : ''}`}
                    onClick={() => setTierFilter(tb.id)}
                  >
                    {tb.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="uni-meta-line num">
          <span>
            총 <strong>{filteredList.length}</strong>개 대학 표시 중
          </span>
          {parsedScore && (
            <span className="compare-active-note">
              내 기준 점수 <strong>{parsedScore}점</strong> 대비 지원 가능성 배지가 함께 표시됩니다
            </span>
          )}
        </div>

        {/* Universities Cards Grid */}
        {loading ? (
          <div className="uni-explorer-grid">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="skeleton uni-skeleton-card" />
            ))}
          </div>
        ) : filteredList.length === 0 ? (
          <div className="uni-empty-box">
            <p>검색 조건에 일치하는 대학이나 학과가 없습니다.</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => {
                setTrackFilter('all');
                setGroupFilter('전체 군');
                setTierFilter('all');
                setSearchQuery('');
              }}
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <div className="uni-explorer-grid">
            {filteredList.map((u, idx) => {
              const evalData = u.evalData;
              const bookmarked = isBookmarked(u.id);
              const comparing = isComparing(u.id);

              const displayTrack = trackFilter !== 'all' ? trackFilter : '인문';
              const sampleDepts = [
                ...(u.departments?.[displayTrack] || []).slice(0, 3),
                ...(trackFilter === 'all' ? (u.departments?.자연 || []).slice(0, 2) : []),
              ].slice(0, 5);

              const trackWeights =
                u.weights?.[trackFilter === '자연' ? '자연' : '인문'] || u.weights?.인문;

              return (
                <motion.article
                  key={u.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.28,
                    delay: Math.min(idx * 0.025, 0.25),
                    ease: APPLE_EASE,
                  }}
                  whileHover={{ y: -3 }}
                  className={`uni-exp-card ${comparing ? 'is-comparing' : ''}`}
                >
                  <div
                    className="uni-exp-body"
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
                    <div className="uni-exp-top">
                      <div>
                        <div className="uni-exp-pills">
                          <span className="exp-group-tag">{u.group}</span>
                          {evalData && (
                            <span className={`tier-badge ${evalData.bucket}`}>
                              <span className="tier-dot" />
                              {TIER_META[evalData.bucket].label}
                            </span>
                          )}
                        </div>
                        <h2 className="uni-exp-name">{u.university}</h2>
                        <p className="uni-exp-type">{u.admissionType}</p>
                      </div>

                      <div className="uni-exp-cutoff num">
                        <strong>{u.cutoff}점</strong>
                        <span>평균 합격선</span>
                      </div>
                    </div>

                    {/* Cutoff Distribution Bar */}
                    <div className="exp-gauge">
                      <div className="exp-track" aria-hidden="true">
                        <div
                          className={`exp-band ${evalData?.bucket || 'target'}`}
                          style={{
                            left: `${toPct(u.cutoffRange.min)}%`,
                            width: `${Math.max(5, toPct(u.cutoffRange.max) - toPct(u.cutoffRange.min))}%`,
                          }}
                        />
                        <div
                          className={`exp-avg-dot ${evalData?.bucket || 'target'}`}
                          style={{ left: `${toPct(u.cutoff)}%` }}
                        />
                        {parsedScore && (
                          <div
                            className="exp-user-pin"
                            style={{ left: `${toPct(parsedScore)}%` }}
                          />
                        )}
                      </div>
                      <div className="exp-gauge-meta num">
                        <span>
                          합격 범위 {u.cutoffRange.min}–{u.cutoffRange.max}점
                        </span>
                        {evalData ? (
                          <span className={evalData.scoreDelta >= 0 ? 'pos' : 'neg'}>
                            내 점수 {evalData.scoreDelta > 0 ? '+' : ''}
                            {evalData.scoreDelta}점 (추정 {evalData.probability}%)
                          </span>
                        ) : (
                          <span className="exp-eng-short">{u.englishRule}</span>
                        )}
                      </div>
                    </div>

                    {/* 2025 Competition Rate, Waitlist Ratio & Subject Weights */}
                    <div className="exp-stats-chips num">
                      <span className="exp-stat-chip">
                        경쟁률 {u.competitionRate ?? 5.0}:1
                      </span>
                      <span className="exp-stat-chip">
                        충원율 {u.waitlistRatio ?? 75}%
                      </span>
                      {trackWeights && (
                        <span className="exp-stat-chip">
                          국{Math.round(trackWeights.kor)}·수{Math.round(trackWeights.math)}·탐{Math.round(trackWeights.inq)}
                        </span>
                      )}
                    </div>

                    {/* Sample Departments */}
                    <div className="exp-dept-preview">
                      {sampleDepts.map((d) => (
                        <span key={d} className="exp-dept-chip">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="uni-exp-actions">
                    <button
                      type="button"
                      className={`uni-v-act-btn ${bookmarked ? 'active-save' : ''}`}
                      onClick={() => toggleBookmark(u.id, sampleDepts[0] || '', u.university)}
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
                      <span>상세 보기</span>
                      <ChevronRight size={14} strokeWidth={2} />
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
