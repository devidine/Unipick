import { motion } from 'framer-motion';
import { Bookmark, Building2, Clock, Compass, User } from 'lucide-react';
import { useAuth } from '../contexts/auth-context';
import { useBookmarks } from '../contexts/bookmarks-context';
import { APPLE_EASE } from '../utils/admission';
import './Navbar.css';

const NAV_ITEMS = [
  { id: 'main', label: '입시 분석', Icon: Compass },
  { id: 'universities', label: '대학 탐색', Icon: Building2 },
  { id: 'saved', label: '관심 대학', Icon: Bookmark },
  { id: 'history', label: '분석 내역', Icon: Clock },
];

export default function Navbar({ activePage, onNavigate, onOpenAuth, onOpenAccount }) {
  const { user } = useAuth();
  const { bookmarks } = useBookmarks();

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner page-container">
          <button
            type="button"
            className="brand-button"
            onClick={() => onNavigate('main')}
            aria-label="UniPick 메인으로 이동"
          >
            <span className="brand-mark" aria-hidden="true">U</span>
            <span className="brand-name">UniPick</span>
          </button>

          <nav className="desktop-nav" aria-label="주요 메뉴">
            {NAV_ITEMS.map(({ id, label }) => {
              const isActive = activePage === id;
              const badgeCount = id === 'saved' && bookmarks.length > 0 ? bookmarks.length : null;
              return (
                <button
                  key={id}
                  type="button"
                  className={`desktop-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => onNavigate(id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isActive && (
                    <motion.span
                      layoutId="desktop-nav-pill"
                      className="desktop-nav-pill"
                      transition={{ duration: 0.28, ease: APPLE_EASE }}
                    />
                  )}
                  <span className="desktop-nav-label">
                    {label}
                    {badgeCount !== null && (
                      <span className="nav-count-badge num">{badgeCount}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="header-actions">
            {user ? (
              <button
                type="button"
                className="account-trigger"
                onClick={onOpenAccount}
                aria-label="계정 설정 열기"
              >
                <span className="account-initial" aria-hidden="true">
                  {(user.displayName || user.username || 'U').slice(0, 1).toUpperCase()}
                </span>
                <span className="account-name">{user.displayName}</span>
              </button>
            ) : (
              <div className="guest-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onOpenAuth('login')}
                >
                  로그인
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm header-cta-desktop"
                  onClick={() => onOpenAuth('register')}
                >
                  시작하기
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav" aria-label="모바일 하단 메뉴">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activePage === id;
          const badgeCount = id === 'saved' && bookmarks.length > 0 ? bookmarks.length : null;
          return (
            <button
              key={id}
              type="button"
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="mobile-icon-wrap">
                <Icon size={20} strokeWidth={isActive ? 2.1 : 1.65} aria-hidden="true" />
                {badgeCount !== null && (
                  <span className="mobile-nav-dot num">{badgeCount}</span>
                )}
              </span>
              <span>{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="mobile-nav-item"
          onClick={() => (user ? onOpenAccount() : onOpenAuth('login'))}
        >
          <span className="mobile-icon-wrap">
            <User size={20} strokeWidth={1.65} aria-hidden="true" />
          </span>
          <span>{user ? '계정' : '로그인'}</span>
        </button>
      </nav>
    </>
  );
}
