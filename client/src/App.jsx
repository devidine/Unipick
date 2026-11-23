import { useState, useEffect, useCallback, useMemo } from 'react';
import { MotionConfig, AnimatePresence, motion } from 'framer-motion';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/auth-context';
import { ToastProvider } from './contexts/ToastContext';
import { BookmarksProvider } from './contexts/BookmarksContext';
import { universityApi } from './utils/api';
import { APPLE_EASE } from './utils/admission';
import AmbientCanvas from './components/AmbientCanvas';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import AccountModal from './components/AccountModal';
import UniversityDetailModal from './components/UniversityDetailModal';
import CompareModal from './components/CompareModal';
import CompareDock from './components/CompareDock';
import MainAnalysisPage from './pages/MainAnalysisPage';
import UniversitiesPage from './pages/UniversitiesPage';
import SavedPage from './pages/SavedPage';
import HistoryPage from './pages/HistoryPage';
import './App.css';

function AppShell() {
  const { user } = useAuth();
  const [activePage, setActivePage] = useState('main');
  const [authModal, setAuthModal] = useState({ open: false, mode: 'login' });
  const [accountOpen, setAccountOpen] = useState(false);

  // 전역 서울권 21개 대학 기준 데이터
  const [universities, setUniversities] = useState([]);
  const [uniLoading, setUniLoading] = useState(true);

  // 현재 활성 분석 컨텍스트 (탭 전환 시에도 상태 유지 + 대학 탐색·관심 대학·비교 모달과 실시간 공유)
  const [mainLaunch, setMainLaunch] = useState({ key: 0, query: null });
  const [activeScore, setActiveScore] = useState(378);
  const [latestReport, setLatestReport] = useState(null);
  const [latestAnalysisMeta, setLatestAnalysisMeta] = useState({
    params: null,
    isPreview: true,
  });

  useEffect(() => {
    let active = true;
    universityApi
      .list()
      .then((data) => {
        if (active && data?.success && Array.isArray(data.universities)) {
          setUniversities(data.universities);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setUniLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const evaluatedMap = useMemo(() => {
    const map = {};
    if (latestReport?.allEvaluated) {
      for (const item of latestReport.allEvaluated) {
        map[item.id] = item;
      }
    }
    return map;
  }, [latestReport]);

  const handleNavigate = useCallback((page) => {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenAuth = useCallback((mode = 'login') => {
    setAuthModal({ open: true, mode });
  }, []);

  const handleJumpToAnalysis = useCallback((payload) => {
    setMainLaunch((prev) => ({
      key: prev.key + 1,
      query: { ...payload, autoRun: true },
    }));
    if (payload?.score) setActiveScore(Math.round(Number(payload.score)));
    setActivePage('main');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const effectiveScore = latestReport?.meta?.effectiveScore ?? activeScore;

  return (
    <>
      {/* 은은하게 움직이는 배경 그래픽 & 패럴랙스 캔버스 */}
      <AmbientCanvas />

      <div className="app-shell">
        <Navbar
          activePage={activePage}
          onNavigate={handleNavigate}
          onOpenAuth={handleOpenAuth}
          onOpenAccount={() => setAccountOpen(true)}
        />

        <main className="app-main">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: APPLE_EASE }}
            >
              {activePage === 'main' && (
                <MainAnalysisPage
                  key={mainLaunch.key}
                  initialQuery={mainLaunch.query}
                  cachedReport={latestReport}
                  cachedParams={latestAnalysisMeta.params}
                  cachedIsPreview={latestAnalysisMeta.isPreview}
                  onScoreChange={setActiveScore}
                  onReportUpdated={(data, params, previewFlag) => {
                    setLatestReport(data);
                    if (params) {
                      setLatestAnalysisMeta({ params, isPreview: Boolean(previewFlag) });
                    }
                  }}
                  onOpenAuth={handleOpenAuth}
                />
              )}

              {activePage === 'universities' && (
                <UniversitiesPage
                  universities={universities}
                  loading={uniLoading}
                  referenceScore={effectiveScore}
                />
              )}

              {activePage === 'saved' && (
                <SavedPage
                  universities={universities}
                  evaluatedMap={evaluatedMap}
                  referenceScore={effectiveScore}
                  onGoMain={() => handleNavigate('main')}
                  onGoExplore={() => handleNavigate('universities')}
                  onOpenAuth={handleOpenAuth}
                />
              )}

              {activePage === 'history' && (
                <HistoryPage
                  key={user?.id || 'guest'}
                  onOpenAuth={handleOpenAuth}
                  onStartNew={() => handleNavigate('main')}
                  onResimulate={handleJumpToAnalysis}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="site-footer">
          <div className="page-container site-footer-inner">
            <div className="footer-top">
              <div className="footer-brand">
                <span className="footer-mark" aria-hidden="true">U</span>
                <strong>UniPick</strong>
                <span className="footer-sep">·</span>
                <span>2025학년도 서울권 21개 대학 정시 입시 분석</span>
              </div>
              <p className="footer-copyright">
                Copyright 2026. UniPick inc. all rights reserved.
              </p>
            </div>
            <p className="footer-disclaimer">
              한국대학교육협의회 대입정보포털(어디가) 및 각 대학 입학처 발표 자료를 기준으로 제공되는 참고 지표입니다.
            </p>
          </div>
        </footer>

        {/* Floating Compare Dock */}
        <CompareDock universities={universities} />

        {/* University Detail Modal */}
        <UniversityDetailModal
          referenceScore={effectiveScore}
          onAnalyzeDepartment={handleJumpToAnalysis}
        />

        {/* Side-by-Side University Comparison Modal */}
        <CompareModal
          universities={universities}
          evaluatedMap={evaluatedMap}
          referenceScore={effectiveScore}
        />

        {/* Auth & Account Modals */}
        <AnimatePresence>
          {authModal.open && (
            <AuthModal
              key="auth-modal"
              initialMode={authModal.mode}
              onClose={() => setAuthModal((prev) => ({ ...prev, open: false }))}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {accountOpen && user && (
            <AccountModal
              key="account-modal"
              onClose={() => setAccountOpen(false)}
              onApplyTargetProfile={handleJumpToAnalysis}
              onNavigate={handleNavigate}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <ToastProvider>
          <BookmarksProvider>
            <AppShell />
          </BookmarksProvider>
        </ToastProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
