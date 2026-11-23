import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, LogOut, Check } from 'lucide-react';
import { useAuth } from '../contexts/auth-context';
import { useToast } from '../contexts/toast-context';
import { APPLE_EASE } from '../utils/admission';
import './AccountModal.css';

export default function AccountModal({ onClose }) {
  const { user, updateProfile, logout } = useAuth();
  const toast = useToast();

  const [displayName, setDisplayName] = useState(() => user?.displayName || user?.username || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!user) return null;

  const isDirty = displayName.trim() !== (user.displayName || '');

  const handleSave = async (e) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      toast.error('표시 이름을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const res = await updateProfile(trimmed);
      if (res?.success) {
        toast.success('계정 정보가 저장되었습니다.');
      } else {
        toast.error(res?.error || '저장에 실패했습니다.');
      }
    } catch {
      toast.error('서버 연결에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.info('로그아웃되었습니다.');
    onClose();
  };

  return (
    <motion.div
      className="modal-backdrop"
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
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.25, ease: APPLE_EASE }}
      >
        <div className="modal-top">
          <div>
            <h2 id="account-modal-title" className="modal-heading">
              계정 설정
            </h2>
            <p className="modal-sub">@{user.username}</p>
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

        <div className="account-meta-grid">
          <div className="account-meta-box">
            <span className="account-meta-label">가입일</span>
            <span className="account-meta-value num">
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR') : '-'}
            </span>
          </div>
          <div className="account-meta-box">
            <span className="account-meta-label">데이터 기준</span>
            <span className="account-meta-value">2025 정시</span>
          </div>
        </div>

        <form onSubmit={handleSave} className="modal-form">
          <label className="field-group">
            <span className="field-label">표시 이름</span>
            <div className="inline-save-row">
              <input
                type="text"
                className="field-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={30}
                placeholder="표시 이름 입력"
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || !isDirty || !displayName.trim()}
              >
                <Check size={15} strokeWidth={2} />
                {saving ? '저장 중' : '저장'}
              </button>
            </div>
          </label>
        </form>

        <div className="account-footer">
          <button type="button" className="btn btn-danger-ghost account-logout-btn" onClick={handleLogout}>
            <LogOut size={15} strokeWidth={1.8} />
            로그아웃
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
