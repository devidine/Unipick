import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/auth-context';
import { useToast } from '../contexts/toast-context';
import { consultApi } from '../utils/api';
import { APPLE_EASE } from '../utils/admission';
import { AnimatedNumber } from '../components/MotionPrimitives';
import AnalysisReport from '../components/AnalysisReport';
import './HistoryPage.css';

function ScoreTrendChart({ items }) {
  const points = useMemo(() => {
    return [...items].slice(0, 10).reverse();
  }, [items]);

  if (points.length < 2) return null;

  const scores = points.map((p) => p.score);
  const minVal = Math.min(...scores) - 8;
  const maxVal = Math.max(...scores) + 8;
  const span = Math.max(10, maxVal - minVal);
  const width = 520;
  const height = 112;
  const padX = 24;
  const padY = 20;

  const coords = points.map((p, idx) => {
    const x =
      points.length === 1
        ? width / 2
        : padX + (idx / (points.length - 1)) * (width - padX * 2);
    const y = padY + (1 - (p.score - minVal) / span) * (height - padY * 2);
    return { x, y, ...p };
  });

  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  return (
    <div className="trend-card">
      <div className="trend-head">
        <span className="trend-title">최근 성적 추이</span>
        <span className="trend-sub num">최근 {points.length}건 기준</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="trend-svg"
        role="img"
        aria-label="최근 저장된 표준점수 추이 그래프"
      >
        <polyline
          fill="none"
          stroke="#0071e3"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={polyline}
        />
        {coords.map((c) => (
          <g key={c.id}>
            <circle cx={c.x} cy={c.y} r="4" fill="#ffffff" stroke="#0071e3" strokeWidth="2.2" />
            <text
              x={c.x}
              y={c.y - 10}
              textAnchor="middle"
              fontSize="10.5"
              fontWeight="600"
              fill="#515154"
            >
              {c.score}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function HistoryPage({ onOpenAuth, onStartNew, onResimulate }) {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(() => Boolean(user));
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    if (!user) return;

    let active = true;
    consultApi
      .list()
      .then((data) => {
        if (active && data?.success) {
          setConsultations(data.consultations || []);
        }
      })
      .catch(() => {
        if (active) toast.error('분석 내역을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user, toast]);

  const handleOpenDetail = async (id) => {
    setDetailLoading(true);
    try {
      const data = await consultApi.get(id);
      if (data?.success && data.consultation) {
        setSelectedDetail(data.consultation);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        toast.error(data?.error || '상세 내역을 불러오지 못했습니다.');
      }
    } catch {
      toast.error('서버 연결 오류가 발생했습니다.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const data = await consultApi.remove(id);
      if (data?.success) {
        setConsultations((prev) => prev.filter((c) => c.id !== id));
        if (selectedDetail?.id === id) setSelectedDetail(null);
        setConfirmDeleteId(null);
        toast.success('분석 내역이 삭제되었습니다.');
        if (refreshUser) refreshUser();
      } else {
        toast.error(data?.error || '삭제하지 못했습니다.');
      }
    } catch {
      toast.error('삭제 중 오류가 발생했습니다.');
    }
  };

  const stats = useMemo(() => {
    if (consultations.length === 0) return null;
    const latest = consultations[0];
    const highest = consultations.reduce((m, c) => (c.score > m ? c.score : m), 0);
    return { total: consultations.length, latest, highest };
  }, [consultations]);

  if (!user) {
    return (
      <div className="history-page">
        <div className="page-container">
          <div className="history-empty-card">
            <div className="empty-icon-box">
              <Clock size={24} strokeWidth={1.7} />
            </div>
            <h2>분석 내역 관리</h2>
            <p>
              로그인하면 성적 분석 결과가 자동으로 저장되어
              <br />
              모의고사별 점수 추이와 희망 학과별 지원 전략을 언제든 다시 비교할 수 있습니다.
            </p>
            <div className="empty-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onOpenAuth('login')}
              >
                로그인하기
              </button>
              <button type="button" className="btn btn-secondary" onClick={onStartNew}>
                비로그인으로 바로 분석
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedDetail && selectedDetail.analysis) {
    return (
      <div className="history-page">
        <div className="page-container history-layout">
          <div className="detail-toolbar">
            <button
              type="button"
              className="btn btn-soft btn-sm"
              onClick={() => setSelectedDetail(null)}
            >
              <ArrowLeft size={15} strokeWidth={1.8} />
              내역 목록으로
            </button>

            <div className="detail-toolbar-right">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  onResimulate({
                    score: selectedDetail.score,
                    major: selectedDetail.major,
                    category: selectedDetail.category,
                    englishGrade: selectedDetail.result_meta?.englishGrade || 1,
                  })
                }
              >
                <SlidersHorizontal size={14} strokeWidth={1.8} />
                이 조건으로 다시 시뮬레이션
              </button>
              <button
                type="button"
                className="btn btn-danger-ghost btn-sm"
                onClick={() => handleDelete(selectedDetail.id)}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                삭제
              </button>
            </div>
          </div>

          <AnalysisReport
            report={selectedDetail.analysis}
            savedNotice={new Date(selectedDetail.created_at).toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
            layoutPrefix="history-report"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="page-container history-layout">
        <header className="history-top-header">
          <div>
            <h1 className="uni-page-title">분석 내역</h1>
            <p className="uni-page-desc">
              저장된 정시 분석 리포트를 다시 열람하거나 조건을 바꿔 시뮬레이션할 수 있습니다.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={onStartNew}>
            새 성적 분석
            <ArrowRight size={15} strokeWidth={2} />
          </button>
        </header>

        {loading ? (
          <div className="history-skeletons">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton history-skeleton-item" />
            ))}
          </div>
        ) : consultations.length === 0 ? (
          <div className="history-empty-card">
            <div className="empty-icon-box">
              <SlidersHorizontal size={24} strokeWidth={1.7} />
            </div>
            <h2>저장된 분석 내역이 없습니다</h2>
            <p>첫 번째 수능 성적을 입력하고 서울권 대학 지원 가능성을 확인해보세요.</p>
            <button type="button" className="btn btn-primary" onClick={onStartNew}>
              첫 분석 시작하기
            </button>
          </div>
        ) : (
          <>
            {stats && (
              <div className="history-overview-grid">
                <div className="history-kpi-strip">
                  <div className="history-kpi">
                    <span className="history-kpi-label">누적 분석</span>
                    <strong className="history-kpi-val">
                      <AnimatedNumber value={stats.total} suffix="건" />
                    </strong>
                  </div>
                  <div className="history-kpi">
                    <span className="history-kpi-label">최근 입력 점수</span>
                    <strong className="history-kpi-val">
                      <AnimatedNumber value={stats.latest.score} suffix="점" />
                    </strong>
                  </div>
                  <div className="history-kpi">
                    <span className="history-kpi-label">최고 기록</span>
                    <strong className="history-kpi-val">
                      <AnimatedNumber value={stats.highest} suffix="점" />
                    </strong>
                  </div>
                </div>
                <ScoreTrendChart items={consultations} />
              </div>
            )}

            <div className={`history-list ${detailLoading ? 'is-loading' : ''}`}>
              {consultations.map((c, idx) => {
                const isConfirming = confirmDeleteId === c.id;
                return (
                  <motion.div
                    key={c.id}
                    className="history-row"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: Math.min(idx * 0.03, 0.2), ease: APPLE_EASE }}
                  >
                    <button
                      type="button"
                      className="history-row-main"
                      onClick={() => handleOpenDetail(c.id)}
                    >
                      <div className="history-score-pill num">{c.score}점</div>
                      <div className="history-row-info">
                        <div className="history-row-title">
                          <strong>{c.major}</strong>
                          <span className="history-track-tag">{c.category}</span>
                          <span className="history-level-tag">{c.level}</span>
                        </div>
                        <div className="history-row-meta num">
                          <span>{new Date(c.created_at).toLocaleDateString('ko-KR')}</span>
                          {c.reachCount !== null && (
                            <>
                              <span>·</span>
                              <span>
                                안정 {c.safetyCount} / 적정 {c.targetCount} / 소신 {c.reachCount}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={17} strokeWidth={1.7} className="history-arrow" />
                    </button>

                    <div className="history-row-actions">
                      {isConfirming ? (
                        <div className="delete-confirm-inline">
                          <button
                            type="button"
                            className="btn btn-danger-ghost btn-sm"
                            onClick={() => handleDelete(c.id)}
                          >
                            삭제 확인
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="row-delete-btn"
                          onClick={() => setConfirmDeleteId(c.id)}
                          aria-label={`${c.major} 분석 내역 삭제`}
                        >
                          <Trash2 size={15} strokeWidth={1.7} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
