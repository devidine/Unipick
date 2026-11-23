import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDown,
  Calculator,
  Check,
  ChevronDown,
  Save,
  SlidersHorizontal,
} from 'lucide-react';
import { consultApi, universityApi } from '../utils/api';
import { useAuth } from '../contexts/auth-context';
import { useToast } from '../contexts/toast-context';
import { APPLE_EASE } from '../utils/admission';
import AnalysisReport from '../components/AnalysisReport';
import './MainAnalysisPage.css';

const FALLBACK_MAJORS = [
  '컴퓨터공학과',
  '경영학과',
  '경제학과',
  '전자공학과',
  '소프트웨어학과',
  '심리학과',
  '시각디자인학과',
];

const QUICK_PRESETS = [
  { score: 392, major: '경영학과', label: '392 · 경영' },
  { score: 378, major: '컴퓨터공학과', label: '378 · 컴공' },
  { score: 352, major: '시각디자인학과', label: '352 · 디자인' },
];

const CATEGORIES = [
  { id: '', label: '자동 판별' },
  { id: '인문', label: '인문' },
  { id: '자연', label: '자연' },
  { id: '예체능', label: '예체능' },
];

const ENGLISH_GRADES = [1, 2, 3, 4, 5];

export default function MainAnalysisPage({
  initialQuery = null,
  cachedReport = null,
  cachedParams = null,
  cachedIsPreview = true,
  onScoreChange,
  onReportUpdated,
  onOpenAuth,
}) {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const hasValidCache = Boolean(!initialQuery?.autoRun && cachedReport && cachedParams);

  const [score, setScore] = useState(() =>
    initialQuery?.score
      ? String(initialQuery.score)
      : hasValidCache
        ? String(cachedParams.score)
        : '378'
  );
  const [major, setMajor] = useState(() =>
    initialQuery?.major
      ? initialQuery.major
      : hasValidCache
        ? cachedParams.major
        : '컴퓨터공학과'
  );
  const [category, setCategory] = useState(() =>
    initialQuery?.category !== undefined
      ? initialQuery.category || ''
      : hasValidCache
        ? cachedParams.category || ''
        : ''
  );
  const [englishGrade, setEnglishGrade] = useState(() =>
    initialQuery?.englishGrade
      ? initialQuery.englishGrade
      : hasValidCache
        ? cachedParams.englishGrade || 1
        : 1
  );

  // 초간편 UX: 세부 설정(과목 합산기·계열·영어 등급)은 필요할 때만 깔끔하게 펼침
  const [showAdvanced, setShowAdvanced] = useState(() =>
    Boolean(
      (initialQuery?.englishGrade && initialQuery.englishGrade > 1) ||
        (hasValidCache && (cachedParams.englishGrade > 1 || cachedParams.category))
    )
  );
  const [subjects, setSubjects] = useState({ kor: '132', math: '130', sub1: '60', sub2: '56' });
  const [popularMajors, setPopularMajors] = useState(FALLBACK_MAJORS);

  const [report, setReport] = useState(() => (hasValidCache ? cachedReport : null));
  const [isPreview, setIsPreview] = useState(() =>
    initialQuery?.autoRun ? false : hasValidCache ? cachedIsPreview : true
  );
  const [baseParams, setBaseParams] = useState(() => (hasValidCache ? cachedParams : null));
  const [simOffset, setSimOffset] = useState(0);
  const [loading, setLoading] = useState(() => !hasValidCache);
  const [liveSyncing, setLiveSyncing] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [formError, setFormError] = useState('');

  const reportSectionRef = useRef(null);
  const hasInteractedRef = useRef(Boolean(initialQuery?.autoRun || (hasValidCache && !cachedIsPreview)));
  const lastFetchedSigRef = useRef(
    hasValidCache
      ? `${cachedParams.score}|${cachedParams.major}|${cachedParams.category || ''}|${cachedParams.englishGrade || 1}`
      : ''
  );

  // 인기 학과 로드
  useEffect(() => {
    let active = true;
    universityApi
      .list()
      .then((data) => {
        if (active && data?.success && Array.isArray(data.popularMajors)) {
          setPopularMajors(data.popularMajors.map((m) => m.name));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // 실시간 자동 재계산 (점수 슬라이더·입력·학과·계열·영어 변경 시 160ms 디바운스로 즉시 반영)
  useEffect(() => {
    const numScore = Math.round(Number(score));
    const trimmedMajor = major.trim();
    if (!Number.isFinite(numScore) || numScore < 200 || numScore > 450 || !trimmedMajor) {
      return;
    }

    const sig = `${numScore}|${trimmedMajor}|${category}|${englishGrade}`;
    if (sig === lastFetchedSigRef.current && report) {
      return;
    }

    let cancelled = false;
    const isInitialLoad = !report;
    const delay = isInitialLoad ? 0 : 160;

    const timer = window.setTimeout(async () => {
      if (!isInitialLoad) setLiveSyncing(true);
      try {
        const shouldAutoSave = Boolean(
          initialQuery?.autoRun &&
            isInitialLoad &&
            localStorage.getItem('unipick_token')
        );
        const data = await consultApi.analyze({
          score: numScore,
          major: trimmedMajor,
          category: category || undefined,
          englishGrade,
          save: shouldAutoSave,
        });

        if (cancelled) return;
        if (data?.success) {
          lastFetchedSigRef.current = sig;
          const nextParams = {
            score: numScore,
            major: trimmedMajor,
            category,
            englishGrade,
          };
          const previewFlag = !hasInteractedRef.current;
          setReport(data);
          setIsPreview(previewFlag);
          setBaseParams(nextParams);
          setSimOffset(0);
          setFormError('');
          if (onScoreChange) onScoreChange(numScore);
          if (onReportUpdated) onReportUpdated(data, nextParams, previewFlag);
          if (data.saved && refreshUser) refreshUser();
        }
      } catch {
        if (!cancelled && isInitialLoad) {
          setFormError('서버와 통신하지 못했습니다.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLiveSyncing(false);
        }
      }
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    score,
    major,
    category,
    englishGrade,
    report,
    initialQuery,
    onScoreChange,
    onReportUpdated,
    refreshUser,
  ]);

  // 명시적 분석 확인 / 로그인 시 내역 저장
  const handleSubmit = async (e) => {
    e.preventDefault();
    const numScore = Math.round(Number(score));
    const trimmedMajor = major.trim();

    if (!Number.isFinite(numScore) || numScore < 200 || numScore > 450) {
      setFormError('표준점수 합은 200점에서 450점 사이의 숫자로 입력해주세요.');
      return;
    }
    if (!trimmedMajor) {
      setFormError('희망 학과를 입력하거나 인기 학과를 선택해주세요.');
      return;
    }

    hasInteractedRef.current = true;
    setFormError('');
    setSavingRecord(true);

    try {
      const data = await consultApi.analyze({
        score: numScore,
        major: trimmedMajor,
        category: category || undefined,
        englishGrade,
        save: Boolean(user),
      });

      if (data?.success) {
        const nextParams = {
          score: numScore,
          major: trimmedMajor,
          category,
          englishGrade,
        };
        lastFetchedSigRef.current = `${numScore}|${trimmedMajor}|${category}|${englishGrade}`;
        setReport(data);
        setIsPreview(false);
        setBaseParams(nextParams);
        setSimOffset(0);
        if (onScoreChange) onScoreChange(numScore);
        if (onReportUpdated) onReportUpdated(data, nextParams, false);
        if (data.saved) {
          toast.success('현재 분석 결과가 내역에 저장되었습니다.');
          if (refreshUser) refreshUser();
        }
        reportSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        setFormError(data?.error || '분석을 완료하지 못했습니다.');
      }
    } catch {
      setFormError('서버와 통신하지 못했습니다.');
    } finally {
      setSavingRecord(false);
    }
  };

  const handleSimulateOffset = useCallback(
    async (offset) => {
      if (!baseParams) return;
      const nextScore = baseParams.score + offset;
      if (nextScore < 200 || nextScore > 450) return;

      hasInteractedRef.current = true;
      setSimOffset(offset);
      setLiveSyncing(true);
      try {
        const data = await consultApi.analyze({
          score: nextScore,
          major: baseParams.major,
          category: baseParams.category || undefined,
          englishGrade: baseParams.englishGrade,
          save: false,
        });
        if (data?.success) {
          setReport(data);
          setIsPreview(false);
          if (onReportUpdated) onReportUpdated(data, baseParams, false);
        }
      } finally {
        setLiveSyncing(false);
      }
    },
    [baseParams, onReportUpdated]
  );

  const handlePresetClick = (preset) => {
    hasInteractedRef.current = true;
    setScore(String(preset.score));
    setMajor(preset.major);
    setCategory('');
    setEnglishGrade(1);
    setFormError('');
  };

  const handleApplySubjectSum = () => {
    const sum =
      (Number(subjects.kor) || 0) +
      (Number(subjects.math) || 0) +
      (Number(subjects.sub1) || 0) +
      (Number(subjects.sub2) || 0);
    if (sum < 200 || sum > 450) {
      toast.error(`합산 점수(${sum}점)가 유효 범위(200~450점)를 벗어납니다.`);
      return;
    }
    hasInteractedRef.current = true;
    setScore(String(Math.round(sum)));
    toast.success(`과목 합산 점수 ${Math.round(sum)}점이 실시간 반영되었습니다.`);
  };

  const subjectSumPreview =
    (Number(subjects.kor) || 0) +
    (Number(subjects.math) || 0) +
    (Number(subjects.sub1) || 0) +
    (Number(subjects.sub2) || 0);

  const sliderScore = Math.max(200, Math.min(450, Number(score) || 378));

  return (
    <div className="main-page">
      {/* Compact, Effortless Hero + Instant Live Studio */}
      <section className="hero-band">
        <div className="page-container hero-wrap">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: APPLE_EASE }}
          >
            <div className="live-pill-badge">
              <span className="live-dot" aria-hidden="true" />
              <span>{liveSyncing ? '실시간 계산 반영 중...' : '점수 입력 즉시 실시간 자동 분석'}</span>
            </div>

            <h1 className="hero-headline">
              성적만 움직이면,
              <br />
              지원 가능 대학이 바로 보입니다.
            </h1>
            <p className="hero-lead">
              복잡한 절차 없이 표준점수와 희망 학과만 선택하세요. 2025학년도 서울권 21개 대학 정시 합격선 기준으로 즉시 비교합니다.
            </p>
          </motion.div>

          {/* Ultra-Simple 2-Field Live Condition Studio */}
          <motion.form
            className="condition-card"
            onSubmit={handleSubmit}
            noValidate
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.46, delay: 0.06, ease: APPLE_EASE }}
          >
            {liveSyncing && <div className="card-live-scanline" aria-hidden="true" />}

            <div className="condition-grid">
              {/* 1. Score Live Control */}
              <div className="cond-block">
                <div className="cond-label-row">
                  <label htmlFor="main-score" className="cond-label">
                    내 수능 표준점수 합
                  </label>
                  <span className="cond-hint num">200 – 450점</span>
                </div>

                <div className="score-row">
                  <div className="score-pill-input">
                    <input
                      id="main-score"
                      type="number"
                      inputMode="numeric"
                      min={200}
                      max={450}
                      value={score}
                      onChange={(e) => {
                        hasInteractedRef.current = true;
                        setScore(e.target.value);
                        if (formError) setFormError('');
                      }}
                      placeholder="378"
                      className="score-num-field num"
                    />
                    <span className="score-unit-label">점</span>
                  </div>

                  <div className="slider-col">
                    <input
                      type="range"
                      min={200}
                      max={450}
                      step={1}
                      value={sliderScore}
                      onChange={(e) => {
                        hasInteractedRef.current = true;
                        setScore(e.target.value);
                        if (formError) setFormError('');
                      }}
                      className="apple-slider"
                      aria-label="표준점수 조절 슬라이더"
                    />
                    <div className="slider-ticks num">
                      <span>200</span>
                      <span>325</span>
                      <span>380</span>
                      <span>450</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Major One-Tap Control */}
              <div className="cond-block">
                <div className="cond-label-row">
                  <label htmlFor="main-major" className="cond-label">
                    희망 학과
                  </label>
                  <span className="cond-hint">탭하거나 직접 입력</span>
                </div>

                <input
                  id="main-major"
                  type="text"
                  value={major}
                  onChange={(e) => {
                    hasInteractedRef.current = true;
                    setMajor(e.target.value);
                    if (formError) setFormError('');
                  }}
                  placeholder="예: 컴퓨터공학과, 경영학과"
                  maxLength={60}
                  className="major-pill-input"
                />

                <div className="major-quick-chips" aria-label="인기 학과 원터치 선택">
                  {popularMajors.slice(0, 6).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`major-quick-chip ${major === m ? 'active' : ''}`}
                      onClick={() => {
                        hasInteractedRef.current = true;
                        setMajor(m);
                        if (formError) setFormError('');
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Clean Action & Optional Settings Bar */}
            <div className="cond-action-bar">
              <div className="cond-left-tools">
                <button
                  type="button"
                  className={`advanced-toggle-btn ${showAdvanced ? 'open' : ''}`}
                  onClick={() => setShowAdvanced((v) => !v)}
                  aria-expanded={showAdvanced}
                >
                  <SlidersHorizontal size={13} strokeWidth={1.9} />
                  <span>
                    세부 설정 · {category || '자동'} · 영어 {englishGrade === 5 ? '5등급↓' : `${englishGrade}등급`}
                  </span>
                  <ChevronDown size={13} className={showAdvanced ? 'rotated' : ''} />
                </button>

                <div className="preset-inline">
                  {QUICK_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="preset-btn num"
                      onClick={() => handlePresetClick(p)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary cond-submit-btn"
                disabled={savingRecord}
              >
                {user ? (
                  <>
                    <Save size={14} strokeWidth={2} />
                    {savingRecord ? '저장 중...' : '내역에 저장하고 보기'}
                  </>
                ) : (
                  <>
                    결과 바로 보기
                    <ArrowDown size={15} strokeWidth={2} />
                  </>
                )}
              </button>
            </div>

            {/* Collapsible Optional Settings (Subject Sum + Track + English) */}
            <AnimatePresence initial={false}>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.24, ease: APPLE_EASE }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="advanced-drawer">
                    <div className="adv-options-grid">
                      <div className="cond-option">
                        <span className="cond-opt-label">계열 지정</span>
                        <div className="cond-opt-pills" role="group" aria-label="계열 선택">
                          {CATEGORIES.map((c) => (
                            <button
                              key={c.id || 'auto'}
                              type="button"
                              className={`cond-opt-pill ${category === c.id ? 'active' : ''}`}
                              onClick={() => {
                                hasInteractedRef.current = true;
                                setCategory(c.id);
                              }}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="cond-option">
                        <span className="cond-opt-label">영어 등급</span>
                        <div className="cond-opt-pills" role="group" aria-label="영어 등급 선택">
                          {ENGLISH_GRADES.map((g) => (
                            <button
                              key={g}
                              type="button"
                              className={`cond-opt-pill num ${englishGrade === g ? 'active' : ''}`}
                              onClick={() => {
                                hasInteractedRef.current = true;
                                setEnglishGrade(g);
                              }}
                            >
                              {g === 5 ? '5등급↓' : `${g}등급`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="calc-drawer">
                      <div className="calc-head">
                        <span className="calc-head-title">
                          <Calculator size={13} strokeWidth={1.9} />
                          과목별 표준점수 합산기
                        </span>
                        <span className="num calc-sum-inline">
                          합계 <strong>{subjectSumPreview}점</strong>
                        </span>
                      </div>
                      <div className="calc-row-wrap">
                        <div className="calc-inputs">
                          <label>
                            <span>국어</span>
                            <input
                              type="number"
                              min={50}
                              max={160}
                              value={subjects.kor}
                              onChange={(e) => setSubjects((s) => ({ ...s, kor: e.target.value }))}
                              className="num"
                            />
                          </label>
                          <label>
                            <span>수학</span>
                            <input
                              type="number"
                              min={50}
                              max={160}
                              value={subjects.math}
                              onChange={(e) => setSubjects((s) => ({ ...s, math: e.target.value }))}
                              className="num"
                            />
                          </label>
                          <label>
                            <span>탐구 1</span>
                            <input
                              type="number"
                              min={20}
                              max={90}
                              value={subjects.sub1}
                              onChange={(e) => setSubjects((s) => ({ ...s, sub1: e.target.value }))}
                              className="num"
                            />
                          </label>
                          <label>
                            <span>탐구 2</span>
                            <input
                              type="number"
                              min={20}
                              max={90}
                              value={subjects.sub2}
                              onChange={(e) => setSubjects((s) => ({ ...s, sub2: e.target.value }))}
                              className="num"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm calc-apply-btn"
                          onClick={handleApplySubjectSum}
                        >
                          <Check size={13} strokeWidth={2.2} />
                          적용
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {formError && (
              <p className="cond-error" role="alert">
                {formError}
              </p>
            )}
          </motion.form>
        </div>
      </section>

      {/* Instant Live Results Band */}
      <section ref={reportSectionRef} className="results-band">
        <div className="page-container results-wrap">
          {loading && !report ? (
            <div className="report-skeleton-stack" aria-label="분석 결과 로딩 중">
              <div className="skeleton skel-summary" />
              <div className="skel-cards-grid">
                <div className="skeleton skel-card" />
                <div className="skeleton skel-card" />
                <div className="skeleton skel-card" />
                <div className="skeleton skel-card" />
              </div>
            </div>
          ) : report ? (
            <>
              {!user && !isPreview && (
                <div className="guest-save-strip">
                  <div className="guest-save-copy">
                    <Save size={15} strokeWidth={1.9} />
                    <span>로그인하면 분석 내역과 관심 대학을 기기 간 동기화해 보관할 수 있습니다.</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onOpenAuth('login')}
                  >
                    로그인하여 저장
                  </button>
                </div>
              )}

              <AnalysisReport
                report={report}
                baseScore={baseParams?.score ?? null}
                simOffset={simOffset}
                onSimulateOffset={handleSimulateOffset}
                simLoading={liveSyncing}
                isPreview={isPreview}
                savedNotice={
                  report.saved
                    ? '내역 저장됨'
                    : simOffset !== 0
                      ? '시뮬레이션 반영'
                      : liveSyncing
                        ? '계산 중...'
                        : '실시간 반영'
                }
                layoutPrefix="main-report"
              />
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
