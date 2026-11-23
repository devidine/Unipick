import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Award,
  Compass,
  Flame,
  Info,
  RotateCcw,
  Sliders,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useBookmarks } from '../contexts/bookmarks-context';
import { APPLE_EASE, TIER_META, calcLocalEvaluation } from '../utils/admission';
import { AnimatedNumber } from './MotionPrimitives';
import './StrategyLab.css';

const LAB_TABS = [
  {
    id: 'scanner',
    label: '학과 피벗 · 환산 역전 스캐너',
    badge: '간판 업그레이드',
    Icon: Zap,
  },
  {
    id: 'waitlist',
    label: '최초합 vs 추합 차수별 생존 분석',
    badge: '예비번호 회전율',
    Icon: Flame,
  },
  {
    id: 'reverse',
    label: '목표 대학 합격 역산 · 과목별 ROI',
    badge: '최단 합격 처방',
    Icon: Sliders,
  },
];

export default function StrategyLab({ meta, onPivotMajor }) {
  const { openDetail } = useBookmarks();
  const [activeTab, setActiveTab] = useState('scanner');
  const [waitlistFilter, setWaitlistFilter] = useState('sweet');

  const universities = useMemo(() => meta?.universities || [], [meta?.universities]);
  const insights = meta?.strategyInsights || {
    departmentPivots: [],
    scoreInversions: [],
    waitlistSweetSpots: [],
  };

  // 목표 대학 역산 시뮬레이터용 기본 목표 대학 (소신 또는 도전 상위 대학 중 가장 근접한 대학 자동 선택)
  const defaultTargetUni = useMemo(() => {
    const reachOrChallenge = universities
      .filter((u) => u.probability < 68 && u.probability >= 8)
      .sort((a, b) => b.probability - a.probability);
    if (reachOrChallenge.length > 0) return reachOrChallenge[0];
    return universities[0] || null;
  }, [universities]);

  const [selectedTargetId, setSelectedTargetId] = useState('');
  const targetUni = useMemo(() => {
    if (selectedTargetId) {
      const found = universities.find((u) => u.id === selectedTargetId);
      if (found) return found;
    }
    return defaultTargetUni;
  }, [selectedTargetId, universities, defaultTargetUni]);

  // 과목별 추가 점수 슬라이더 상태 (역산 연구소)
  const [gainKor, setGainKor] = useState(0);
  const [gainMath, setGainMath] = useState(0);
  const [gainInq, setGainInq] = useState(0);
  const [targetEngGrade, setTargetEngGrade] = useState(null);

  const activeTargetEng = targetEngGrade ?? (meta?.englishGrade || 1);

  // 선택한 목표 대학에 대한 실시간 역산 결과 계산
  const reverseSimResult = useMemo(() => {
    if (!targetUni) return null;
    const w = targetUni.weights || { kor: 33.3, math: 33.3, inq: 33.4 };

    // 대학별 영역 반영비율 가중치(평균 33.3% 대비 레버리지) 반영
    const korMultiplier = w.kor / 33.3;
    const mathMultiplier = w.math / 33.3;
    const inqMultiplier = w.inq / 33.4;

    const weightedSubjectGain = Number(
      (gainKor * korMultiplier + gainMath * mathMultiplier + gainInq * inqMultiplier).toFixed(1)
    );
    const rawSubjectGain = gainKor + gainMath + gainInq;

    const currentEngPenalty = targetUni.englishPenalty ?? 0;
    const nextEngPenalty =
      targetUni.englishPenalties?.[activeTargetEng] ?? currentEngPenalty;
    const engGain = Number((nextEngPenalty - currentEngPenalty).toFixed(1));

    const totalEffectiveGain = Number((weightedSubjectGain + engGain).toFixed(1));
    const simulatedEffectiveScore = Number(
      ((targetUni.effectiveScore || meta?.effectiveScore || 378) + totalEffectiveGain).toFixed(1)
    );

    const evalRes = calcLocalEvaluation(simulatedEffectiveScore, targetUni.cutoffRange);
    const neededForTarget = Math.max(
      0,
      Number((targetUni.cutoffRange.avg - (targetUni.effectiveScore || meta?.effectiveScore || 378)).toFixed(1))
    );
    const neededForSafety = Math.max(
      0,
      Number(
        (
          targetUni.cutoffRange.avg +
          3.5 -
          (targetUni.effectiveScore || meta?.effectiveScore || 378)
        ).toFixed(1)
      )
    );

    // 최고 효율 과목 판별
    let bestRoiSubject = '수학';
    let bestRoiWeight = w.math;
    if (w.kor > w.math && w.kor >= w.inq) {
      bestRoiSubject = '국어';
      bestRoiWeight = w.kor;
    } else if (w.inq > w.math && w.inq > w.kor) {
      bestRoiSubject = '탐구(2과목)';
      bestRoiWeight = w.inq;
    }

    return {
      weights: w,
      korMultiplier: Number(korMultiplier.toFixed(2)),
      mathMultiplier: Number(mathMultiplier.toFixed(2)),
      inqMultiplier: Number(inqMultiplier.toFixed(2)),
      rawSubjectGain,
      weightedSubjectGain,
      engGain,
      totalEffectiveGain,
      simulatedEffectiveScore,
      simulatedProbability: evalRes.probability,
      simulatedBucket: evalRes.bucket,
      probDelta: evalRes.probability - targetUni.probability,
      neededForTarget,
      neededForSafety,
      bestRoiSubject,
      bestRoiWeight,
    };
  }, [targetUni, gainKor, gainMath, gainInq, activeTargetEng, meta?.effectiveScore]);

  // 최단 합격 루트 자동 처방 버튼 핸들러
  const handleAutoPrescribe = () => {
    if (!targetUni || !reverseSimResult) return;
    const currentEff = targetUni.effectiveScore || meta?.effectiveScore || 378;
    const goalScore = targetUni.cutoffRange.avg + 2.5; // 안정·적정 상단 목표
    let gap = Math.max(2, goalScore - currentEff);

    // 1) 영어 등급이 2등급 이하이고 해당 대학 영어 감점이 크면 영어 1등급 우선 처방
    const currentEng = meta?.englishGrade || 1;
    let nextEng = currentEng;
    if (currentEng >= 2 && (targetUni.englishPenalty ?? 0) <= -1.5) {
      nextEng = 1;
      const savedByEng = Math.abs(targetUni.englishPenalty ?? 0);
      gap = Math.max(0, gap - savedByEng);
    }

    const w = targetUni.weights || { kor: 33.3, math: 33.3, inq: 33.4 };
    // 반영비율이 가장 높은 과목에 60%, 두 번째 과목에 40% 배분
    if (w.math >= w.kor && w.math >= w.inq) {
      const mGain = Math.min(15, Math.ceil((gap * 0.62) / (w.math / 33.3)));
      const kOrIGain = Math.min(12, Math.max(0, Math.ceil(gap - mGain * (w.math / 33.3))));
      setGainMath(mGain);
      if (w.kor >= w.inq) {
        setGainKor(kOrIGain);
        setGainInq(0);
      } else {
        setGainInq(kOrIGain);
        setGainKor(0);
      }
    } else if (w.kor >= w.math && w.kor >= w.inq) {
      const kGain = Math.min(15, Math.ceil((gap * 0.62) / (w.kor / 33.3)));
      const mGain = Math.min(12, Math.max(0, Math.ceil(gap - kGain * (w.kor / 33.3))));
      setGainKor(kGain);
      setGainMath(mGain);
      setGainInq(0);
    } else {
      const iGain = Math.min(15, Math.ceil((gap * 0.6) / (w.inq / 33.4)));
      const mGain = Math.min(12, Math.max(0, Math.ceil(gap - iGain * (w.inq / 33.4))));
      setGainInq(iGain);
      setGainMath(mGain);
      setGainKor(0);
    }
    setTargetEngGrade(nextEng);
  };

  const handleResetReverse = () => {
    setGainKor(0);
    setGainMath(0);
    setGainInq(0);
    setTargetEngGrade(null);
  };

  // 추합 차수별 생존 분석 목록 필터링
  const waitlistList = useMemo(() => {
    if (waitlistFilter === 'sweet') {
      const sweet = universities.filter(
        (u) =>
          u.waitlistWave?.stage === 'wave12' ||
          u.waitlistWave?.stage === 'final_wave' ||
          (u.waitlistWave?.stage === 'initial' && u.probability < 88)
      );
      return sweet.length > 0 ? sweet.slice(0, 8) : universities.slice(0, 8);
    }
    if (waitlistFilter === 'high_turnover') {
      return [...universities]
        .filter((u) => (u.waitlistRatio || 0) >= 80)
        .sort((a, b) => b.waitlistRatio - a.waitlistRatio)
        .slice(0, 8);
    }
    return universities.slice(0, 10);
  }, [universities, waitlistFilter]);

  if (!meta) return null;

  return (
    <section className="strategy-lab-card" aria-label="UniPick 정시 전략 연구소">
      {/* Dark Space Black Lab Header */}
      <div className="lab-header">
        <div className="lab-header-copy">
          <div className="lab-eyebrow">
            <Sparkles size={13} strokeWidth={2.2} />
            <span>UNIPICK STRATEGY LAB · 정시 3대 킬러 분석 엔진</span>
          </div>
          <h3 className="lab-title">
            단순 커트라인 표에서는 보이지 않는 역전 루트를 찾습니다
          </h3>
          <p className="lab-subtitle">
            동일 점수로 대학 급수를 높이는 <strong>학과 피벗 스캐너</strong>, 예비번호 회전율을 반영한 <strong>추합 차수별 생존 판정</strong>, 목표 대학 합격을 위한 <strong>과목별 최소 점수 역산(ROI)</strong>을 실시간으로 시뮬레이션하세요.
          </p>
        </div>

        {/* 3 Killer Engine Tab Buttons */}
        <div className="lab-tabs" role="tablist" aria-label="정시 전략 연구소 엔진 선택">
          {LAB_TABS.map(({ id, label, badge, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`lab-tab-btn ${active ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={14} strokeWidth={2.1} />
                <span className="lab-tab-label">{label}</span>
                <span className="lab-tab-badge">{badge}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ENGINE 1: 학과 피벗 & 환산 역전 스캐너
         ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'scanner' && (
        <div className="lab-panel">
          <div className="lab-section-block">
            <div className="lab-sec-head">
              <div>
                <span className="lab-sec-tag">Engine 01 · Department Pivot Alpha</span>
                <h4 className="lab-sec-title">
                  같은 점수로 대학 간판을 높이는 동일 대학 내 ‘학과 피벗’ 찬스
                </h4>
                <p className="lab-sec-desc">
                  현재 희망 학과(<strong>{meta.major}</strong>) 대신 동일 대학 내 광역·융합·전략 학과로 방향을 틀었을 때 합격 가능성이 큰 폭으로 점프하는 모집단위입니다.
                </p>
              </div>
            </div>

            {insights.departmentPivots?.length > 0 ? (
              <div className="pivot-cards-grid">
                {insights.departmentPivots.map((pv) => (
                  <motion.article
                    key={`${pv.universityId}-${pv.toDepartment}`}
                    className="pivot-card"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: APPLE_EASE }}
                  >
                    <div className="pivot-card-top">
                      <div>
                        <span className="pivot-group-pill">{pv.group}</span>
                        <h5 className="pivot-uni-name">{pv.university}</h5>
                      </div>
                      <span className="pivot-gain-badge num">
                        합격률 +{pv.probGain}%p 상승 ▲
                      </span>
                    </div>

                    <div className="pivot-compare-box num">
                      <div className="pivot-side from">
                        <span className="pivot-side-label">현재 희망 전공</span>
                        <strong className="pivot-dept">{pv.fromDepartment}</strong>
                        <span className="pivot-stat">
                          컷 {pv.fromCutoff}점 · 추정 {pv.fromProbability}%
                        </span>
                      </div>

                      <div className="pivot-arrow-circle" aria-hidden="true">
                        <ArrowRight size={15} strokeWidth={2.2} />
                      </div>

                      <div className="pivot-side to">
                        <span className="pivot-side-label">피벗 전략 학과 ({pv.deptTierLabel})</span>
                        <strong className="pivot-dept">{pv.toDepartment}</strong>
                        <span className="pivot-stat highlight">
                          컷 {pv.toCutoff}점 (-{pv.cutoffSaved}점) · <strong>{pv.toProbability}% ({pv.toTierLabel})</strong>
                        </span>
                      </div>
                    </div>

                    <p className="pivot-reason">{pv.reason}</p>

                    <div className="pivot-actions">
                      {onPivotMajor && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => onPivotMajor(pv.toDepartment)}
                        >
                          <Compass size={13} strokeWidth={2} />
                          ‘{pv.toDepartment}’로 전체 대학 재분석
                        </button>
                      )}
                    </div>
                  </motion.article>
                ))}
              </div>
            ) : (
              <div className="lab-empty-note">
                현재 선택한 전공(<strong>{meta.major}</strong>)이 이미 해당 계열에서 가장 유리한 전략 모집단위로 설정되어 있습니다.
              </div>
            )}
          </div>

          {/* Score Inversion Cards */}
          <div className="lab-section-block">
            <div className="lab-sec-head">
              <div>
                <span className="lab-sec-tag">Engine 01-B · Conversion Score Inversion</span>
                <h4 className="lab-sec-title">
                  내 성적 구조(영어 {meta.englishGrade}등급 · {meta.subjectProfile?.strengthType || `${meta.category}계열`})에서 환산 이득이 가장 큰 대학
                </h4>
              </div>
            </div>

            <div className="inversion-grid">
              {insights.scoreInversions?.map((inv) => (
                <article key={inv.universityId} className="inversion-card">
                  <div className="inversion-top">
                    <div>
                      <span className="inversion-subject-tag">{inv.maxSubject}</span>
                      <h5 className="inversion-uni">
                        {inv.university} <span>{inv.department}</span>
                      </h5>
                    </div>
                    <span className={`tier-badge ${inv.bucket}`}>
                      <span className="tier-dot" />
                      {inv.tierLabel} {inv.probability}%
                    </span>
                  </div>
                  <p className="inversion-reason">{inv.reason}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ENGINE 2: 최초합 vs 추합(예비번호) 차수별 생존 시뮬레이터
         ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'waitlist' && (
        <div className="lab-panel">
          <div className="lab-sec-head waitlist-head-row">
            <div>
              <span className="lab-sec-tag">Engine 02 · Waitlist Wave & Turnover Simulator</span>
              <h4 className="lab-sec-title">
                최초합격 컷 vs 1·2차 추합 컷 vs 최종 전화찬스 마지노선 정밀 비교
              </h4>
              <p className="lab-sec-desc">
                정시 합격자의 약 절반은 추가합격(예비번호 충원)으로 합격합니다. 2025학년도 대학별 실제 충원율(예비번호 회전 바퀴 수)을 반영해 내 점수가 어느 추합 차수에 위치하는지 시뮬레이션합니다.
              </p>
            </div>

            <div className="waitlist-filter-pills">
              <button
                type="button"
                className={`waitlist-pill ${waitlistFilter === 'sweet' ? 'active' : ''}`}
                onClick={() => setWaitlistFilter('sweet')}
              >
                내 점수 추합 경합권
              </button>
              <button
                type="button"
                className={`waitlist-pill ${waitlistFilter === 'high_turnover' ? 'active' : ''}`}
                onClick={() => setWaitlistFilter('high_turnover')}
              >
                충원율 80%↑ 고회전 대학
              </button>
              <button
                type="button"
                className={`waitlist-pill ${waitlistFilter === 'all' ? 'active' : ''}`}
                onClick={() => setWaitlistFilter('all')}
              >
                상위 10개교 전체
              </button>
            </div>
          </div>

          <div className="waitlist-wave-list">
            {waitlistList.map((u) => {
              const wv = u.waitlistWave;
              if (!wv) return null;

              // 게이지 스케일: finalCutoff - 6 ~ initialCutoff + 6
              const minS = wv.finalCutoff - 6;
              const maxS = wv.initialCutoff + 6;
              const toWavePct = (val) =>
                Math.max(2, Math.min(98, ((val - minS) / Math.max(1, maxS - minS)) * 100));

              const finalPct = toWavePct(wv.finalCutoff);
              const wave12Pct = toWavePct(wv.wave12Cutoff);
              const initPct = toWavePct(wv.initialCutoff);
              const userPct = toWavePct(u.effectiveScore ?? meta.effectiveScore);

              return (
                <article key={u.id} className={`waitlist-row-card stage-${wv.stage}`}>
                  <div className="waitlist-row-top">
                    <div className="waitlist-uni-block">
                      <div className="waitlist-badges">
                        <span className={`wave-stage-badge stage-${wv.stage}`}>
                          {wv.waveBadge}
                        </span>
                        <span className="waitlist-turnover-pill num">
                          2025 충원율 <strong>{u.waitlistRatio}%</strong> (예비 약 {wv.rotations}바퀴 회전)
                        </span>
                        <span className="waitlist-group-tag">{u.group}</span>
                      </div>
                      <h5 className="waitlist-uni-title">
                        {u.university} <span>· {u.department}</span>
                      </h5>
                    </div>

                    <div className="waitlist-right-stat num">
                      <strong className={`tier-text-${u.bucket}`}>{u.probability}%</strong>
                      <span>내 환산 {u.effectiveScore}점</span>
                    </div>
                  </div>

                  {/* 3-Stage Wave Bar */}
                  <div className="wave-bar-container">
                    <div className="wave-bar-track">
                      {/* Zone 3: 3차~최종 추합 구간 */}
                      <div
                        className="wave-zone zone-final"
                        style={{
                          left: `${finalPct}%`,
                          width: `${Math.max(4, wave12Pct - finalPct)}%`,
                        }}
                        title="3차~최종 문닫기 추합권"
                      />
                      {/* Zone 2: 1~2차 주력 추합 구간 */}
                      <div
                        className="wave-zone zone-wave12"
                        style={{
                          left: `${wave12Pct}%`,
                          width: `${Math.max(4, initPct - wave12Pct)}%`,
                        }}
                        title="1~2차 주력 추합권"
                      />
                      {/* Zone 1: 최초합격 안정권 */}
                      <div
                        className="wave-zone zone-initial"
                        style={{
                          left: `${initPct}%`,
                          width: `${Math.max(6, 98 - initPct)}%`,
                        }}
                        title="최초합격 안정권"
                      />

                      {/* User Score Pin */}
                      <div
                        className="wave-user-marker"
                        style={{ left: `${userPct}%` }}
                      >
                        <span className="wave-user-tag num">내 점수 {u.effectiveScore}</span>
                      </div>
                    </div>

                    <div className="wave-thresholds-row num">
                      <span>최종 추합 마지노선: <strong>{wv.finalCutoff}점</strong></span>
                      <span>1·2차 추합 기준: <strong>{wv.wave12Cutoff}점</strong></span>
                      <span>최초합 안정선: <strong>{wv.initialCutoff}점</strong></span>
                    </div>
                  </div>

                  <div className="waitlist-row-foot">
                    <p className="waitlist-summary-text">{wv.stageSummary}</p>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openDetail(u)}
                    >
                      모집요강 상세
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ENGINE 3: 목표 대학 합격 역산 & 과목별 투자 ROI 시뮬레이터
         ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'reverse' && targetUni && reverseSimResult && (
        <div className="lab-panel">
          <div className="reverse-top-bar">
            <div className="reverse-select-group">
              <label htmlFor="reverse-target-select" className="reverse-select-label">
                역산 목표 대학 선택
              </label>
              <select
                id="reverse-target-select"
                className="reverse-uni-select"
                value={targetUni.id}
                onChange={(e) => {
                  setSelectedTargetId(e.target.value);
                  handleResetReverse();
                }}
              >
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    [{TIER_META[u.bucket]?.shortLabel} {u.probability}%] {u.university} · {u.department} (기준 컷 {u.cutoff}점)
                  </option>
                ))}
              </select>
            </div>

            <div className="reverse-preset-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleAutoPrescribe}
              >
                <Sparkles size={14} strokeWidth={2} />
                최단 합격 루트 자동 처방
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleResetReverse}
              >
                <RotateCcw size={13} strokeWidth={2} />
                초기화
              </button>
            </div>
          </div>

          <div className="reverse-grid">
            {/* Left: Interactive Subject Gain Sliders with Real-Time ROI Multipliers */}
            <div className="reverse-sliders-card">
              <div className="reverse-card-head">
                <h4 className="reverse-card-title">
                  과목별 목표 점수 상승 시뮬레이션
                </h4>
                <span className="reverse-roi-tip">
                  1순위 고효율 과목: <strong>{reverseSimResult.bestRoiSubject} ({reverseSimResult.bestRoiWeight}% 반영)</strong>
                </span>
              </div>

              {/* Korean Slider */}
              <div className="roi-slider-row">
                <div className="roi-slider-top">
                  <span className="roi-subj-name">
                    국어 표준점수 추가 확보
                    <small className="num">반영비율 {reverseSimResult.weights.kor}% (효율 ×{reverseSimResult.korMultiplier})</small>
                  </span>
                  <strong className="roi-subj-val num">
                    +{gainKor}점 → 환산 +{Number((gainKor * reverseSimResult.korMultiplier).toFixed(1))}점
                  </strong>
                </div>
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={1}
                  value={gainKor}
                  onChange={(e) => setGainKor(Number(e.target.value))}
                  className="apple-slider"
                  aria-label="국어 추가 점수 슬라이더"
                />
              </div>

              {/* Math Slider */}
              <div className="roi-slider-row">
                <div className="roi-slider-top">
                  <span className="roi-subj-name">
                    수학 표준점수 추가 확보
                    <small className="num">반영비율 {reverseSimResult.weights.math}% (효율 ×{reverseSimResult.mathMultiplier})</small>
                  </span>
                  <strong className="roi-subj-val num">
                    +{gainMath}점 → 환산 +{Number((gainMath * reverseSimResult.mathMultiplier).toFixed(1))}점
                  </strong>
                </div>
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={1}
                  value={gainMath}
                  onChange={(e) => setGainMath(Number(e.target.value))}
                  className="apple-slider"
                  aria-label="수학 추가 점수 슬라이더"
                />
              </div>

              {/* Inquiry Slider */}
              <div className="roi-slider-row">
                <div className="roi-slider-top">
                  <span className="roi-subj-name">
                    탐구(2과목 합) 표준점수 추가 확보
                    <small className="num">반영비율 {reverseSimResult.weights.inq}% (효율 ×{reverseSimResult.inqMultiplier})</small>
                  </span>
                  <strong className="roi-subj-val num">
                    +{gainInq}점 → 환산 +{Number((gainInq * reverseSimResult.inqMultiplier).toFixed(1))}점
                  </strong>
                </div>
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={1}
                  value={gainInq}
                  onChange={(e) => setGainInq(Number(e.target.value))}
                  className="apple-slider"
                  aria-label="탐구 추가 점수 슬라이더"
                />
              </div>

              {/* Target English Grade Selector */}
              <div className="roi-eng-row">
                <span className="roi-subj-name">
                  목표 영어 등급 조정
                  <small>{targetUni.englishRule}</small>
                </span>
                <div className="roi-eng-pills num">
                  {[1, 2, 3, 4].map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`roi-eng-pill ${activeTargetEng === g ? 'active' : ''}`}
                      onClick={() => setTargetEngGrade(g)}
                    >
                      {g}등급 ({targetUni.englishPenalties?.[g] ?? 0}점)
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Live Reverse-Engineered Outcome Gauge */}
            <div className="reverse-outcome-card">
              <div className="reverse-outcome-head">
                <span className="reverse-outcome-eyebrow">{targetUni.group} · {targetUni.admissionType}</span>
                <h4 className="reverse-outcome-uni">
                  {targetUni.university} <span>{targetUni.department}</span>
                </h4>
              </div>

              <div className="reverse-prob-comparison num">
                <div className="reverse-prob-box current">
                  <span>현재 합격 적합도</span>
                  <strong>{targetUni.probability}%</strong>
                  <small>{TIER_META[targetUni.bucket]?.label}</small>
                </div>

                <div className="reverse-prob-arrow">
                  <TrendingUp size={20} strokeWidth={2.2} />
                  {reverseSimResult.probDelta !== 0 && (
                    <span className={reverseSimResult.probDelta > 0 ? 'pos' : 'neg'}>
                      {reverseSimResult.probDelta > 0 ? `+${reverseSimResult.probDelta}%p` : `${reverseSimResult.probDelta}%p`}
                    </span>
                  )}
                </div>

                <div className={`reverse-prob-box simulated tier-bg-${reverseSimResult.simulatedBucket}`}>
                  <span>역산 시뮬레이션 결과</span>
                  <strong>
                    <AnimatedNumber value={reverseSimResult.simulatedProbability} suffix="%" />
                  </strong>
                  <small>{TIER_META[reverseSimResult.simulatedBucket]?.label}</small>
                </div>
              </div>

              <div className="reverse-metrics-list num">
                <div className="reverse-metric-row">
                  <span>학과 평균 합격선 (최저–최고)</span>
                  <strong>{targetUni.cutoff}점 ({targetUni.cutoffRange.min}–{targetUni.cutoffRange.max})</strong>
                </div>
                <div className="reverse-metric-row">
                  <span>시뮬레이션 환산 점수 (상승분)</span>
                  <strong>
                    {reverseSimResult.simulatedEffectiveScore}점 (
                    {reverseSimResult.totalEffectiveGain >= 0 ? `+${reverseSimResult.totalEffectiveGain}` : reverseSimResult.totalEffectiveGain}점)
                  </strong>
                </div>
                <div className="reverse-metric-row">
                  <span>적정권(60%) / 안정권(80%)까지 초기 격차</span>
                  <strong>
                    {reverseSimResult.neededForTarget > 0
                      ? `적정까지 +${reverseSimResult.neededForTarget}점 / 안정까지 +${reverseSimResult.neededForSafety}점`
                      : '이미 적정·안정권 진입 완료'}
                  </strong>
                </div>
              </div>

              <div className="reverse-prescription-note">
                <Award size={16} strokeWidth={2} />
                <p>
                  <strong>{targetUni.shortName} 맞춤 처방:</strong> 이 모집단위는{' '}
                  <strong>{reverseSimResult.bestRoiSubject} 반영 비중({reverseSimResult.bestRoiWeight}%)</strong>이 가장 높습니다.
                  {reverseSimResult.totalEffectiveGain > 0
                    ? ` 단순 표준점수 +${reverseSimResult.rawSubjectGain}점 상승이 반영비율 가중치와 영어 보정을 거쳐 실질 환산 +${reverseSimResult.totalEffectiveGain}점 효과를 냅니다.`
                    : ` 상단 '최단 합격 루트 자동 처방' 버튼을 누르면 가장 적은 점수 상승으로 합격선을 돌파하는 과목 조합을 계산합니다.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="lab-footer-note">
        <Info size={13} strokeWidth={1.8} />
        <span>
          정시 전략 연구소의 학과 피벗·추합 차수·과목별 ROI 시뮬레이션은 2025학년도 각 대학 입학처 발표 반영비율, 충원율 및 최종 70% 컷 분포를 기반으로 산출됩니다.
        </span>
      </div>
    </section>
  );
}
