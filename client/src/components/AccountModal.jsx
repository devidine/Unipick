import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Bookmark,
  Check,
  Clock,
  CloudUpload,
  Compass,
  KeyRound,
  LogOut,
  Shield,
  Sparkles,
  Target,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/auth-context';
import { useBookmarks } from '../contexts/bookmarks-context';
import { useToast } from '../contexts/toast-context';
import { consultApi } from '../utils/api';
import { APPLE_EASE, loadGuestHistory } from '../utils/admission';
import './AccountModal.css';

const AVATAR_THEMES = [
  { id: 'obsidian', label: '스페이스 블랙', bg: '#111114' },
  { id: 'graphite', label: '티타늄 그라파이트', bg: '#3f3f46' },
  { id: 'emerald', label: '에메랄드 그린', bg: '#15803d' },
  { id: 'cobalt', label: '코발트 블루', bg: '#1d4ed8' },
  { id: 'amber', label: '앰버 골드', bg: '#b45309' },
];

const TARGET_UNIVERSITIES = [
  '서울대학교',
  '연세대학교',
  '고려대학교',
  '성균관대학교',
  '서강대학교',
  '한양대학교',
  '중앙대학교',
  '경희대학교',
  '한국외국어대학교',
  '서울시립대학교',
  '건국대학교',
  '동국대학교',
  '홍익대학교',
  '국민대학교',
  '숭실대학교',
  '세종대학교',
  '단국대학교',
  '광운대학교',
  '명지대학교',
  '상명대학교',
  '가톨릭대학교',
];

export default function AccountModal({ onClose, onApplyTargetProfile, onNavigate }) {
  const { user, updateProfile, changePassword, refreshUser, logout } = useAuth();
  const { bookmarks } = useBookmarks();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('profile');
  const [displayName, setDisplayName] = useState(() => user?.displayName || user?.username || '');
  const [avatar, setAvatar] = useState(() => user?.avatar || 'obsidian');
  const [statusMessage, setStatusMessage] = useState(() => user?.statusMessage || '');
  const [targetScore, setTargetScore] = useState(() => String(user?.targetScore || 385));
  const [targetMajor, setTargetMajor] = useState(() => user?.targetMajor || '컴퓨터공학부');
  const [targetUniversity, setTargetUniversity] = useState(() => user?.targetUniversity || '성균관대학교');
  const [examTrack, setExamTrack] = useState(() => user?.examTrack || '자연');
  const [saving, setSaving] = useState(false);

  // 비밀번호 변경 상태
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // 클라우드 동기화 상태
  const [syncingCloud, setSyncingCloud] = useState(false);
  const guestSnapshots = useMemo(() => loadGuestHistory(), []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!user) return null;

  const activeAvatarTheme =
    AVATAR_THEMES.find((t) => t.id === avatar) || AVATAR_THEMES[0];

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      toast.error('표시 이름을 입력해주세요.');
      return;
    }
    const parsedScore = Math.round(Number(targetScore));
    if (!Number.isFinite(parsedScore) || parsedScore < 200 || parsedScore > 450) {
      toast.error('목표 표준점수는 200~450점 사이로 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const res = await updateProfile({
        displayName: trimmedName,
        avatar,
        statusMessage: statusMessage.trim(),
        targetScore: parsedScore,
        targetMajor: targetMajor.trim() || '컴퓨터공학부',
        targetUniversity,
        examTrack,
      });
      if (res?.success) {
        toast.success('내 입시 프로필과 목표 조건이 저장되었습니다.');
      } else {
        toast.error(res?.error || '저장에 실패했습니다.');
      }
    } catch {
      toast.error('서버 연결에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleRunTargetAnalysis = () => {
    const parsedScore = Math.min(450, Math.max(200, Math.round(Number(targetScore) || 385)));
    if (onApplyTargetProfile) {
      onApplyTargetProfile({
        score: parsedScore,
        major: targetMajor.trim() || '컴퓨터공학부',
        category: examTrack,
      });
    }
    toast.success(`내 목표 성적(${parsedScore}점 · ${targetMajor})으로 입시 분석을 실행합니다.`);
    onClose();
  };

  const handleSyncSnapshots = async () => {
    if (guestSnapshots.length === 0) return;
    setSyncingCloud(true);
    let synced = 0;
    try {
      for (const snap of guestSnapshots.slice(0, 5)) {
        await consultApi.analyze({
          score: snap.score,
          major: snap.major,
          category: snap.category,
          englishGrade: snap.englishGrade || 1,
          subjects: snap.subjectProfile || null,
          save: true,
        });
        synced += 1;
      }
      if (refreshUser) await refreshUser();
      toast.success(`브라우저 스냅샷 ${synced}건을 내 계정에 동기화했습니다.`);
    } catch {
      toast.error('동기화 중 오류가 발생했습니다.');
    } finally {
      setSyncingCloud(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!currentPw || !newPw) {
      toast.error('현재 비밀번호와 새 비밀번호를 입력해주세요.');
      return;
    }
    if (newPw.length < 4) {
      toast.error('새 비밀번호는 4자 이상이어야 합니다.');
      return;
    }
    if (newPw !== confirmPw) {
      toast.error('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.');
      return;
    }

    setPwSaving(true);
    try {
      const res = await changePassword(currentPw, newPw);
      if (res?.success) {
        toast.success('비밀번호가 안전하게 변경되었습니다.');
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      } else {
        toast.error(res?.error || '비밀번호 변경에 실패했습니다.');
      }
    } catch {
      toast.error('서버 연결에 실패했습니다.');
    } finally {
      setPwSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.info('로그아웃되었습니다.');
    onClose();
  };

  return (
    <motion.div
      className="modal-backdrop account-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="modal-panel account-modal"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.26, ease: APPLE_EASE }}
      >
        <div className="sheet-grab-bar" aria-hidden="true" />

        {/* Profile Identity Banner */}
        <div className="account-hero-card">
          <div className="account-hero-left">
            <div
              className="account-avatar-large"
              style={{ backgroundColor: activeAvatarTheme.bg }}
            >
              {(displayName || user.username || 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className="account-hero-info">
              <div className="account-hero-name-row">
                <h2 id="account-modal-title" className="account-hero-name">
                  {displayName || user.displayName}
                </h2>
                <span className="account-track-badge">{examTrack}계열</span>
              </div>
              <p className="account-hero-handle">
                @{user.username} · 목표 {targetUniversity} {targetMajor} ({targetScore}점)
              </p>
              {statusMessage && (
                <p className="account-hero-motto">“{statusMessage}”</p>
              )}
            </div>
          </div>

          <button
            type="button"
            className="modal-icon-close account-close-btn"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* 3-Tab Switcher */}
        <div className="account-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'profile'}
            className={`account-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={14} strokeWidth={2} />
            <span>내 입시 프로필</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'activity'}
            className={`account-tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            <Target size={14} strokeWidth={2} />
            <span>활동 · 동기화</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'security'}
            className={`account-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <Shield size={14} strokeWidth={2} />
            <span>보안 · 계정</span>
          </button>
        </div>

        {/* Tab 1: Admissions Profile */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="account-tab-body">
            <div className="field-group">
              <span className="field-label">프로필 배지 컬러</span>
              <div className="avatar-theme-row">
                {AVATAR_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`avatar-swatch ${avatar === t.id ? 'active' : ''}`}
                    style={{ backgroundColor: t.bg }}
                    onClick={() => setAvatar(t.id)}
                    title={t.label}
                    aria-label={t.label}
                  >
                    {avatar === t.id && <Check size={13} strokeWidth={2.5} color="#fff" />}
                  </button>
                ))}
                <span className="avatar-theme-name">{activeAvatarTheme.label}</span>
              </div>
            </div>

            <div className="account-form-grid">
              <label className="field-group">
                <span className="field-label">표시 이름</span>
                <input
                  type="text"
                  className="field-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={30}
                  placeholder="표시 이름"
                />
              </label>

              <label className="field-group">
                <span className="field-label">목표 다짐 한줄 메시지</span>
                <input
                  type="text"
                  className="field-input"
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
                  maxLength={60}
                  placeholder="예: 2026 정시 1지망 합격!"
                />
              </label>
            </div>

            <div className="account-target-box">
              <div className="target-box-head">
                <span className="target-box-title">
                  <Sparkles size={13} strokeWidth={2} />
                  나의 목표 입시 조건
                </span>
                <button
                  type="button"
                  className="target-apply-link"
                  onClick={handleRunTargetAnalysis}
                >
                  <Compass size={13} strokeWidth={2} />
                  이 목표 조건으로 즉시 분석
                </button>
              </div>

              <div className="account-form-grid">
                <label className="field-group">
                  <span className="field-label">1지망 목표 대학</span>
                  <select
                    className="field-input"
                    value={targetUniversity}
                    onChange={(e) => setTargetUniversity(e.target.value)}
                  >
                    {TARGET_UNIVERSITIES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-group">
                  <span className="field-label">목표 희망 학과</span>
                  <input
                    type="text"
                    className="field-input"
                    value={targetMajor}
                    onChange={(e) => setTargetMajor(e.target.value)}
                    maxLength={40}
                    placeholder="예: 컴퓨터공학부"
                  />
                </label>

                <div className="field-group">
                  <span className="field-label">주력 응시 계열</span>
                  <div className="track-mini-pills">
                    {['인문', '자연', '예체능'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`track-mini-pill ${examTrack === t ? 'active' : ''}`}
                        onClick={() => setExamTrack(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="field-group">
                  <span className="field-label">목표 표준점수 합 (200~450)</span>
                  <input
                    type="number"
                    min={200}
                    max={450}
                    className="field-input num"
                    value={targetScore}
                    onChange={(e) => setTargetScore(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="account-profile-actions">
              <button
                type="submit"
                className="btn btn-primary account-save-btn"
                disabled={saving}
              >
                <Check size={15} strokeWidth={2.2} />
                {saving ? '저장 중...' : '프로필 및 목표 조건 저장'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Activity & Cloud Sync */}
        {activeTab === 'activity' && (
          <div className="account-tab-body">
            <div className="account-stats-grid num">
              <div className="account-stat-card">
                <span className="account-stat-label">클라우드 분석 기록</span>
                <strong className="account-stat-val">{user.consultationCount ?? 0}회</strong>
              </div>
              <div className="account-stat-card">
                <span className="account-stat-label">저장한 관심 대학</span>
                <strong className="account-stat-val">{bookmarks.length}개교</strong>
              </div>
              <div className="account-stat-card">
                <span className="account-stat-label">브라우저 스냅샷</span>
                <strong className="account-stat-val">{guestSnapshots.length}건</strong>
              </div>
            </div>

            <div className="account-sync-card">
              <div>
                <strong>브라우저 로컬 분석 스냅샷 동기화</strong>
                <p>
                  비로그인 상태에서 저장한 스냅샷({guestSnapshots.length}건)을 내 클라우드 계정 분석 내역으로 백업합니다.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSyncSnapshots}
                disabled={syncingCloud || guestSnapshots.length === 0}
              >
                <CloudUpload size={14} strokeWidth={1.9} />
                {syncingCloud ? '동기화 중...' : '클라우드 백업 실행'}
              </button>
            </div>

            <div className="account-quick-links">
              <button
                type="button"
                className="btn btn-soft account-nav-btn"
                onClick={() => {
                  if (onNavigate) onNavigate('saved');
                  onClose();
                }}
              >
                <Bookmark size={15} strokeWidth={1.8} />
                관심 대학 ({bookmarks.length}) 바로가기
              </button>
              <button
                type="button"
                className="btn btn-soft account-nav-btn"
                onClick={() => {
                  if (onNavigate) onNavigate('history');
                  onClose();
                }}
              >
                <Clock size={15} strokeWidth={1.8} />
                분석 내역 ({user.consultationCount ?? 0}) 바로가기
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Security & Password */}
        {activeTab === 'security' && (
          <div className="account-tab-body">
            <form onSubmit={handlePasswordChange} className="account-pw-form">
              <h3 className="account-sec-title">
                <KeyRound size={14} strokeWidth={2} />
                비밀번호 변경
              </h3>
              <label className="field-group">
                <span className="field-label">현재 비밀번호</span>
                <input
                  type="password"
                  className="field-input"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="현재 비밀번호 입력"
                  autoComplete="current-password"
                />
              </label>
              <div className="account-form-grid">
                <label className="field-group">
                  <span className="field-label">새 비밀번호</span>
                  <input
                    type="password"
                    className="field-input"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="4자 이상 입력"
                    autoComplete="new-password"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">새 비밀번호 확인</span>
                  <input
                    type="password"
                    className="field-input"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="새 비밀번호 재입력"
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="btn btn-secondary btn-sm"
                disabled={pwSaving}
                style={{ alignSelf: 'flex-start' }}
              >
                {pwSaving ? '변경 중...' : '비밀번호 변경 완료'}
              </button>
            </form>

            <div className="account-footer">
              <div className="account-meta-inline num">
                <span>가입일: {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR') : '오늘'}</span>
                <span>·</span>
                <span>계정 ID: @{user.username}</span>
              </div>
              <button
                type="button"
                className="btn btn-danger-ghost account-logout-btn"
                onClick={handleLogout}
              >
                <LogOut size={15} strokeWidth={1.8} />
                현재 기기에서 로그아웃
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
