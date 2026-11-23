import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, Eye, EyeOff, ShieldCheck, Sparkles, UserCheck, X } from 'lucide-react';
import { useAuth } from '../contexts/auth-context';
import { useToast } from '../contexts/toast-context';
import { consultApi } from '../utils/api';
import { APPLE_EASE, loadGuestHistory } from '../utils/admission';
import './AuthModal.css';

const SAVED_USERNAME_KEY = 'unipick_saved_username_v1';

export default function AuthModal({ initialMode = 'login', onClose }) {
  const { login, demoLogin, register, refreshUser } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState(() => localStorage.getItem(SAVED_USERNAME_KEY) || '');
  const [rememberId, setRememberId] = useState(() => Boolean(localStorage.getItem(SAVED_USERNAME_KEY)));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [examTrack, setExamTrack] = useState('자연');
  const [targetScore, setTargetScore] = useState('385');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const guestSnapshots = useMemo(() => loadGuestHistory(), []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
  };

  const passwordStrength = useMemo(() => {
    if (!password) return { level: 0, label: '미입력', tone: 'none' };
    if (password.length < 4) return { level: 1, label: '4자 이상 필요', tone: 'weak' };
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
    const score = (password.length >= 8 ? 1 : 0) + (hasLetter && hasDigit ? 1 : 0) + (hasSpecial ? 1 : 0);
    if (score >= 2) return { level: 3, label: '안전함', tone: 'strong' };
    return { level: 2, label: '사용 가능', tone: 'medium' };
  }, [password]);

  // 게스트 상태에서 저장해 둔 로컬 스냅샷을 로그인 계정으로 자동 동기화
  const syncGuestSnapshotsToCloud = async () => {
    if (guestSnapshots.length === 0) return 0;
    let synced = 0;
    for (const snap of guestSnapshots.slice(0, 3)) {
      try {
        await consultApi.analyze({
          score: snap.score,
          major: snap.major,
          category: snap.category,
          englishGrade: snap.englishGrade || 1,
          subjects: snap.subjectProfile || null,
          save: true,
        });
        synced += 1;
      } catch {
        // ignore individual sync failure
      }
    }
    if (synced > 0 && refreshUser) {
      await refreshUser();
    }
    return synced;
  };

  const handleDemoStart = async () => {
    setError('');
    setDemoLoading(true);
    try {
      const data = await demoLogin();
      if (data?.success) {
        const synced = await syncGuestSnapshotsToCloud();
        toast.success(
          synced > 0
            ? `수험생 체험 계정으로 로그인되었습니다. (로컬 스냅샷 ${synced}건 동기화 완료)`
            : '수험생 체험 계정(김유니)으로 즉시 로그인되었습니다.'
        );
        onClose();
      } else {
        setError(data?.error || '체험 계정 로그인에 실패했습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanUsername = username.trim();

    if (mode === 'register') {
      if (!/^[a-zA-Z0-9._-]{3,20}$/.test(cleanUsername)) {
        setError('아이디는 3~20자의 영문, 숫자, _, ., - 만 사용할 수 있습니다.');
        return;
      }
      if (password.length < 4) {
        setError('비밀번호는 4자 이상 입력해주세요.');
        return;
      }
    } else if (!cleanUsername || !password) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      if (rememberId && cleanUsername) {
        localStorage.setItem(SAVED_USERNAME_KEY, cleanUsername);
      } else {
        localStorage.removeItem(SAVED_USERNAME_KEY);
      }

      const data =
        mode === 'login'
          ? await login(cleanUsername, password)
          : await register({
              username: cleanUsername,
              password,
              displayName: displayName.trim() || cleanUsername,
              examTrack,
              targetScore: Math.min(450, Math.max(200, Number(targetScore) || 385)),
              targetMajor: examTrack === '인문' ? '경영학과' : examTrack === '예체능' ? '시각디자인학과' : '컴퓨터공학부',
            });

      if (data?.success) {
        const synced = await syncGuestSnapshotsToCloud();
        toast.success(
          mode === 'login'
            ? synced > 0
              ? `로그인 완료 · 브라우저 스냅샷 ${synced}건이 계정에 동기화되었습니다.`
              : `${data.user?.displayName || cleanUsername}님, 환영합니다!`
            : '회원가입 및 맞춤 입시 프로필 생성이 완료되었습니다.'
        );
        onClose();
      } else {
        setError(data?.error || '요청을 처리하지 못했습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="modal-backdrop auth-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="modal-panel auth-panel"
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.26, ease: APPLE_EASE }}
      >
        <div className="sheet-grab-bar" aria-hidden="true" />

        <div className="modal-top">
          <div>
            <span className="auth-badge-pill">
              <ShieldCheck size={13} strokeWidth={2} />
              UniPick Cloud Sync
            </span>
            <h2 id="auth-modal-title" className="modal-heading">
              {mode === 'login' ? 'UniPick 로그인' : '새 수험생 계정 만들기'}
            </h2>
            <p className="modal-sub">
              {mode === 'login'
                ? '저장한 관심 대학과 모의고사 분석 내역, 목표 프로필을 불러옵니다.'
                : '목표 성적과 관심 대학, 3장 원서 시뮬레이션 기록을 안전하게 보관하세요.'}
            </p>
          </div>
          <button
            type="button"
            className="modal-icon-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* One-Click Express Demo Account Banner */}
        <div className="demo-express-box">
          <div className="demo-express-info">
            <strong>아이디 입력 없이 바로 둘러보시겠어요?</strong>
            <span>수험생 체험 계정(김유니 · 388점 목표)으로 1초 만에 모든 기능을 체험합니다.</span>
          </div>
          <button
            type="button"
            className="btn btn-soft btn-sm demo-express-btn"
            onClick={handleDemoStart}
            disabled={demoLoading || submitting}
          >
            <Sparkles size={14} strokeWidth={2} />
            {demoLoading ? '접속 중...' : '체험 계정 1초 로그인'}
          </button>
        </div>

        {guestSnapshots.length > 0 && (
          <div className="auth-sync-notice">
            <UserCheck size={14} strokeWidth={2} />
            <span>
              현재 브라우저에 저장된 분석 스냅샷 <strong>{guestSnapshots.length}건</strong>이 로그인 즉시 내 계정으로 자동 병합됩니다.
            </span>
          </div>
        )}

        <div className="segmented-control" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`segmented-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            로그인
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`segmented-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form" noValidate>
          <label className="field-group">
            <div className="field-label-row">
              <span className="field-label">아이디</span>
              {mode === 'register' && username && (
                <span
                  className={`field-hint-status ${/^[a-zA-Z0-9._-]{3,20}$/.test(username.trim()) ? 'ok' : 'warn'}`}
                >
                  {/^[a-zA-Z0-9._-]{3,20}$/.test(username.trim()) ? '사용 가능한 형식' : '영문·숫자 3~20자'}
                </span>
              )}
            </div>
            <input
              type="text"
              className="field-input"
              placeholder={mode === 'register' ? '영문·숫자 3~20자 (예: unipick26)' : '아이디 입력'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="field-group">
            <div className="field-label-row">
              <span className="field-label">비밀번호</span>
              {mode === 'register' && password && (
                <span className={`pw-strength-label tone-${passwordStrength.tone}`}>
                  보안: {passwordStrength.label}
                </span>
              )}
            </div>
            <div className="password-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                className="field-input has-toggle"
                placeholder={mode === 'register' ? '4자 이상 입력' : '비밀번호 입력'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
              <button
                type="button"
                className="pw-toggle-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
              >
                {showPassword ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
              </button>
            </div>
            {mode === 'register' && password && (
              <div className="pw-strength-bars" aria-hidden="true">
                {[1, 2, 3].map((step) => (
                  <span
                    key={step}
                    className={`pw-bar ${passwordStrength.level >= step ? `active-${passwordStrength.tone}` : ''}`}
                  />
                ))}
              </div>
            )}
          </label>

          {mode === 'login' ? (
            <label className="remember-row">
              <input
                type="checkbox"
                checked={rememberId}
                onChange={(e) => setRememberId(e.target.checked)}
              />
              <span>이 브라우저에 아이디 기억하기</span>
            </label>
          ) : (
            <div className="register-extra-fields">
              <label className="field-group">
                <span className="field-label">표시 이름 (닉네임)</span>
                <input
                  type="text"
                  className="field-input"
                  placeholder="예: 김수험"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  maxLength={30}
                />
              </label>

              <div className="register-split-row">
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
                  <span className="field-label">목표 표준점수</span>
                  <input
                    type="number"
                    min={200}
                    max={450}
                    value={targetScore}
                    onChange={(e) => setTargetScore(e.target.value)}
                    className="field-input num"
                  />
                </label>
              </div>
            </div>
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary modal-submit-btn" disabled={submitting || demoLoading}>
            <Check size={16} strokeWidth={2.2} />
            {submitting ? '처리 중...' : mode === 'login' ? '로그인하기' : '계정 생성 및 시작하기'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
