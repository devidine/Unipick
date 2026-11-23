import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/auth-context';
import { useToast } from '../contexts/toast-context';
import { APPLE_EASE } from '../utils/admission';
import './AuthModal.css';

export default function AuthModal({ initialMode = 'login', onClose }) {
  const { login, register } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      const data =
        mode === 'login'
          ? await login(cleanUsername, password)
          : await register(cleanUsername, password, displayName.trim());

      if (data?.success) {
        toast.success(mode === 'login' ? '로그인되었습니다.' : '회원가입이 완료되었습니다.');
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
      className="modal-backdrop"
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
        className="modal-panel"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.25, ease: APPLE_EASE }}
      >
        <div className="modal-top">
          <div>
            <h2 id="auth-modal-title" className="modal-heading">
              {mode === 'login' ? 'UniPick 로그인' : '계정 만들기'}
            </h2>
            <p className="modal-sub">
              {mode === 'login'
                ? '저장한 관심 대학과 입시 분석 내역을 이어서 확인하세요.'
                : '관심 대학과 모의고사별 분석 기록을 안전하게 보관하세요.'}
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
            <span className="field-label">아이디</span>
            <input
              type="text"
              className="field-input"
              placeholder={mode === 'register' ? '영문·숫자 3~20자' : '아이디 입력'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>

          <label className="field-group">
            <span className="field-label">비밀번호</span>
            <input
              type="password"
              className="field-input"
              placeholder={mode === 'register' ? '4자 이상 입력' : '비밀번호 입력'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          {mode === 'register' && (
            <label className="field-group">
              <span className="field-label">표시 이름 (선택)</span>
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
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary modal-submit-btn" disabled={submitting}>
            {submitting ? '처리 중...' : mode === 'login' ? '로그인' : '가입 완료'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
