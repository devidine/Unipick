import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Scale, X } from 'lucide-react';
import { useBookmarks } from '../contexts/bookmarks-context';
import { APPLE_EASE } from '../utils/admission';
import './CompareDock.css';

export default function CompareDock({ universities = [] }) {
  const { compareIds, toggleCompare, clearCompare, setCompareOpen } = useBookmarks();

  const selected = compareIds
    .map((id) => universities.find((u) => u.id === id))
    .filter(Boolean);

  return (
    <AnimatePresence>
      {selected.length > 0 && (
        <motion.div
          className="compare-dock-wrap"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.28, ease: APPLE_EASE }}
        >
          <div className="compare-dock" role="region" aria-label="선택된 대학 비교 바">
            <div className="dock-left">
              <span className="dock-title">
                <Scale size={14} strokeWidth={2} />
                비교 목록 <strong className="num">{selected.length}/4</strong>
              </span>
              <div className="dock-chips">
                {selected.map((u) => (
                  <span key={u.id} className="dock-chip">
                    {u.shortName || u.university}
                    <button
                      type="button"
                      onClick={() => toggleCompare(u.id)}
                      aria-label={`${u.university} 제거`}
                    >
                      <X size={12} strokeWidth={2.2} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="dock-actions">
              <button
                type="button"
                className="dock-clear-btn"
                onClick={clearCompare}
              >
                초기화
              </button>
              <button
                type="button"
                className="btn btn-blue btn-sm dock-go-btn"
                onClick={() => setCompareOpen(true)}
                disabled={selected.length < 2}
                title={selected.length < 2 ? '2개 이상 선택하면 비교할 수 있습니다' : undefined}
              >
                {selected.length < 2 ? '1개 더 선택하세요' : `${selected.length}개 대학 비교`}
                {selected.length >= 2 && <ArrowRight size={14} strokeWidth={2} />}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
