import { useState, useEffect, useMemo, useId } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Cloud,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { consultApi } from '../utils/api';
import { useAuth } from '../contexts/auth-context';
import { useToast } from '../contexts/toast-context';
import {
  APPLE_EASE,
  deleteGuestHistoryItem,
  formatReportSummaryText,
  loadGuestHistory,
} from '../utils/admission';
import AnalysisReport from '../components/AnalysisReport';
import { AnimatedNumber } from '../components/MotionPrimitives';
import './HistoryPage.css';

function ScoreTrendChart({ records }) {
  const gradId = useId();

  const points = useMemo(() => {
    const items = [...records].slice(0, 10).reverse();
    if (items.length < 2) return null;

    const scores = items.map((r) => r.score);
    const min = Math.max(200, Math.min(...scores) - 10);
    const max = Math.min(450, Math.max(...scores) + 10);
    const range = Math.max(20, max - min);

    const w = 520;
    const h = 88;
    const padX = 24;
    const padY = 18;

    return items.map((item, idx) => {
      const x = padX + (idx / (items.length - 1)) * (w - padX * 2);
      const y = h - padY - ((item.score - min) / range) * (h - padY * 2);
      return { x, y, score: item.score, major: item.major };
    });
  }, [records]);

  if (!points) return null;

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPoints = `${points[0].x},76 ${polyline} ${points[points.length - 1].x},76`;

  return (
    <div className="trend-card">
      <div className="trend-head">
        <span className="trend-title">최근 분석 점수 추이</span>
        <span className="trend-sub num">최근 {points.length}회 기록</span>
      </div>
      <svg viewBox="0 0 520 92" className="trend-svg" role="img" aria-label="최근 분석 점수 추이 그래프">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(17, 17, 20, 0.22)" />
            <stop offset="100%" stopColor="rgba(17, 17, 20, 0)" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#${gradId})`} />
        <polyline
          fill="none"
          stroke="var(--ink-primary)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polyline}
        />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.8" fill="var(--bg-canvas)" stroke="var(--ink-primary)" strokeWidth="2.2" />
            <text
              x={p.x}
              y={p.y - 8}
              textAnchor="middle"
              fontSize="10.5"
              fontWeight="600"
              fill="var(--ink-secondary)"
            >
              {p.score}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function HistoryPage({
  onOpenAuth,
  onNavigate,
  onStartNew,
  onReAnalyze,
  onResimulate,
}) {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const handleGoMain = () => {
    if (onStartNew) onStartNew();
    else if (onNavigate) onNavigate('main');
  };
  const triggerReAnalyze = onResimulate || onReAnalyze;

  const [serverRecords, setServerRecords] = useState([]);
  const [guestRecords, setGuestRecords] = useState(() => loadGuestHistory());
  const [loading, setLoading] = useState(Boolean(user));
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    consultApi
      .list()
      .then((data) => {
        if (active && data?.success) {
          setServerRecords(data.consultations || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const records = useMemo(() => {
    if (user) {
      // 서버 기록과 로컬 스냅샷 병합 (중복 조건 제거)
      const combined = [...serverRecords];
      for (const g of guestRecords) {
        const dup = combined.some(
          (s) => s.score === g.score && s.major === g.major && s.category === g.category
        );
        if (!dup) combined.push(g);
      }
      return combined;
    }
    return guestRecords;
  }, [user, serverRecords, guestRecords]);

  const stats = useMemo(() => {
    if (records.length === 0) return { count: 0, maxScore: 0, avgScore: 0 };
    const scores = records.map((r) => r.score);
    return {
      count: records.length,
      maxScore: Math.max(...scores),
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    };
  }, [records]);

  const handleOpenRecord = async (record) => {
    setDetailLoading(true);
    try {
      if (!record.isGuest && user && !String(record.id).startsWith('guest-')) {
        const data = await consultApi.getById(record.id);
        if (data?.success && data.consultation) {
          setSelectedDetail(data.consultation);
          return;
        }
      }

      // 게스트 로컬 스냅샷 실시간 복원
      const hydrated = await consultApi.analyze({
        score: record.score,
        major: record.major,
        category: record.category || undefined,
        englishGrade: record.englishGrade || 1,
        subjects: record.subjectProfile || null,
        save: false,
      });

      if (hydrated?.success) {
        setSelectedDetail({
          id: record.id,
          isGuest: true,
          score: record.score,
          major: record.major,
          category: record.category,
          level: record.level,
          created_at: record.created_at,
          result_meta: hydrated.meta,
          analysis: hydrated,
        });
      } else {
        toast.error('분석 리포트를 불러오지 못했습니다.');
      }
    } catch {
      toast.error('서버와 통신하지 못했습니다.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (record) => {
    const id = record.id;
    if (record.isGuest || String(id).startsWith('guest-')) {
      const nextGuest = deleteGuestHistoryItem(id);
      setGuestRecords(nextGuest);
      if (selectedDetail?.id === id) setSelectedDetail(null);
      setDeleteConfirmId(null);
      toast.info('로컬 분석 스냅샷을 삭제했습니다.');
      return;
    }

    try {
      const data = await consultApi.remove(id);
      if (data?.success) {
        setServerRecords((prev) => prev.filter((r) => r.id !== id));
        if (selectedDetail?.id === id) setSelectedDetail(null);
        setDeleteConfirmId(null);
        toast.info('분석 내역을 삭제했습니다.');
        if (refreshUser) refreshUser();
      } else {
        toast.error(data?.error || '삭제에 실패했습니다.');
      }
    } catch {
      toast.error('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleCopyDetailSummary = async () => {
    const meta = selectedDetail?.analysis?.meta;
    if (!meta) return;
    try {
      await navigator.clipboard.writeText(formatReportSummaryText(meta));
      toast.success('선택한 분석 내역 요약이 클립보드에 복사되었습니다.');
    } catch {
      toast.error('클립보드 복사에 실패했습니다.');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const normalized = dateStr.includes('T') ? dateStr : `${dateStr.replace(' ', 'T')}Z`;
      const d = new Date(normalized);
      return d.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // 상세 리포트 보기 화면
  if (selectedDetail) {
    return (
      <div className="history-page">
        <div className="page-container history-layout">
          <div className="detail-toolbar">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedDetail(null)}
            >
              <ArrowLeft size={14} strokeWidth={2} />
              내역 목록으로
            </button>

            <div className="detail-toolbar-right">
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={() =>
                  triggerReAnalyze &&
                  triggerReAnalyze({
                    score: selectedDetail.score,
                    major: selectedDetail.major,
                    category: selectedDetail.category,
                    englishGrade: selectedDetail.result_meta?.englishGrade || 1,
                    autoRun: true,
                  })
                }
              >
                <RefreshCw size={13} strokeWidth={1.9} />
                이 조건으로 다시 시뮬레이션
              </button>

              <button
                type="button"
                className="btn btn-danger-ghost btn-sm"
                onClick={() => handleDelete(selectedDetail)}
              >
                <Trash2 size={13} strokeWidth={1.8} />
                내역 삭제
              </button>
            </div>
          </div>

          <AnalysisReport
            report={{
              meta: selectedDetail.analysis?.meta,
              saved: true,
            }}
            baseScore={selectedDetail.score}
            onCopyReportSummary={handleCopyDetailSummary}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="page-container history-layout">
        <motion.header
          className="history-top-header"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: APPLE_EASE }}
        >
          <div>
            <span className="page-eyebrow">Analysis History</span>
            <h1 className="page-headline">분석 내역 및 성적 추이</h1>
            <p className="page-subline">
              {user
                ? `${user.displayName}님의 저장된 입시 시뮬레이션 기록과 모의고사 점수 변화 추이를 비교합니다.`
                : '이 브라우저에 저장된 입시 분석 스냅샷을 확인하고 점수 변화 추이를 비교합니다.'}
            </p>
          </div>
          <div className="history-header-actions">
            {!user && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onOpenAuth('login')}
              >
                <Cloud size={14} strokeWidth={1.9} />
                계정 연동
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleGoMain}
            >
              새 성적 분석
            </button>
          </div>
        </motion.header>

        {/* Overview KPI + Trend Chart */}
        {records.length > 0 && (
          <div className="history-overview-grid num">
            <div className="history-kpi-strip">
              <div className="history-kpi">
                <span className="history-kpi-label">총 분석 횟수</span>
                <strong className="history-kpi-val">
                  <AnimatedNumber value={stats.count} suffix="회" />
                </strong>
              </div>
              <div className="history-kpi">
                <span className="history-kpi-label">최고 표준점수</span>
                <strong className="history-kpi-val">
                  <AnimatedNumber value={stats.maxScore} suffix="점" />
                </strong>
              </div>
              <div className="history-kpi">
                <span className="history-kpi-label">평균 표준점수</span>
                <strong className="history-kpi-val">
                  <AnimatedNumber value={stats.avgScore} suffix="점" />
                </strong>
              </div>
            </div>

            <ScoreTrendChart records={records} />
          </div>
        )}

        {/* History Records List */}
        {loading && records.length === 0 ? (
          <div className="history-skeletons">
            {[1, 2, 3].map((n) => (
              <div key={n} className="skeleton history-skeleton-item" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="history-empty-card">
            <div className="empty-icon-box">
              <Clock size={22} strokeWidth={1.6} />
            </div>
            <h2>저장된 분석 스냅샷이 없습니다</h2>
            <p>
              [입시 분석] 화면에서 성적과 희망 학과를 입력한 뒤 <strong>현재 결과 내역에 저장</strong> 버튼을 누르면 로그인 없이도 즉시 스냅샷이 기록됩니다.
            </p>
            <div className="empty-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGoMain}
              >
                첫 성적 스냅샷 저장하러 가기
              </button>
              {!user && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onOpenAuth('login')}
                >
                  로그인하여 기존 내역 불러오기
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className={`history-list ${detailLoading ? 'is-loading' : ''}`}>
            {records.map((rec, idx) => {
              const prevRec = records[idx + 1];
              const scoreDiff = prevRec ? rec.score - prevRec.score : null;

              return (
                <article key={rec.id} className="history-row">
                  <button
                    type="button"
                    className="history-row-main"
                    onClick={() => handleOpenRecord(rec)}
                    disabled={detailLoading}
                  >
                    <div className="history-score-pill num">
                      <span>{rec.score}점</span>
                    </div>

                    <div className="history-row-info">
                      <div className="history-row-title">
                        <strong>{rec.major}</strong>
                        <span className="history-track-tag">{rec.category}계열</span>
                        {rec.level && <span className="history-level-tag">{rec.level}</span>}
                        {scoreDiff !== null && scoreDiff !== 0 && (
                          <span className={`history-diff-badge num ${scoreDiff > 0 ? 'up' : 'down'}`}>
                            직전 대비 {scoreDiff > 0 ? `+${scoreDiff}점 ▲` : `${scoreDiff}점 ▼`}
                          </span>
                        )}
                        {rec.isGuest && (
                          <span className="history-local-tag">브라우저 스냅샷</span>
                        )}
                      </div>
                      <div className="history-row-meta num">
                        {rec.safetyCount !== null && rec.safetyCount !== undefined && (
                          <>
                            <span className="tier-text-safety">안정 {rec.safetyCount}</span>
                            <span>·</span>
                            <span className="tier-text-target">적정 {rec.targetCount}</span>
                            <span>·</span>
                            <span className="tier-text-reach">소신 {rec.reachCount}</span>
                            <span>·</span>
                          </>
                        )}
                        {rec.englishGrade && rec.englishGrade > 1 && (
                          <>
                            <span>영어 {rec.englishGrade}등급</span>
                            <span>·</span>
                          </>
                        )}
                        <span>{formatDate(rec.created_at)}</span>
                      </div>
                    </div>

                    <ChevronRight size={17} strokeWidth={1.8} className="history-arrow" />
                  </button>

                  <div className="history-row-actions">
                    {deleteConfirmId === rec.id ? (
                      <div className="delete-confirm-inline">
                        <button
                          type="button"
                          className="btn btn-danger-ghost btn-sm"
                          onClick={() => handleDelete(rec)}
                        >
                          삭제
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="row-delete-btn"
                        onClick={() => setDeleteConfirmId(rec.id)}
                        aria-label="내역 삭제"
                      >
                        <Trash2 size={15} strokeWidth={1.7} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
