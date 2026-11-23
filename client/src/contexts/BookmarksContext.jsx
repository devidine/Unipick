import { useState, useEffect, useCallback, useMemo } from 'react';
import { bookmarkApi } from '../utils/api';
import { useAuth } from './auth-context';
import { useToast } from './toast-context';
import { BookmarksContext } from './bookmarks-context';

const LOCAL_KEY = 'unipick_bookmarks_v1';

function readLocalBookmarks() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalBookmarks(list) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    // 스토리지 제한 무시
  }
}

export function BookmarksProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();

  const [bookmarks, setBookmarks] = useState(() => readLocalBookmarks());
  const [compareIds, setCompareIds] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);

  // 로그인 시 서버 북마크 로드 및 게스트 북마크 동기화
  useEffect(() => {
    if (!user) return;
    let active = true;

    const syncBookmarks = async () => {
      try {
        const res = await bookmarkApi.list();
        if (!active || !res?.success) return;

        const serverList = (res.bookmarks || []).map((b) => ({
          universityId: b.universityId,
          department: b.department || '',
          createdAt: b.createdAt,
        }));

        // 게스트 상태에서 담아둔 항목이 있으면 서버로 병합
        const localOnly = readLocalBookmarks().filter(
          (lb) => !serverList.some((sb) => sb.universityId === lb.universityId)
        );

        for (const item of localOnly) {
          await bookmarkApi.save(item.universityId, item.department || '');
        }

        const merged = [...localOnly, ...serverList];
        if (active) {
          setBookmarks(merged);
          writeLocalBookmarks(merged);
        }
      } catch {
        // 네트워크 실패 시 로컬 유지
      }
    };

    syncBookmarks();
    return () => {
      active = false;
    };
  }, [user]);

  const isBookmarked = useCallback(
    (universityId) => bookmarks.some((b) => b.universityId === universityId),
    [bookmarks]
  );

  const toggleBookmark = useCallback(
    async (universityId, department = '', universityName = '') => {
      const exists = bookmarks.some((b) => b.universityId === universityId);
      const next = exists
        ? bookmarks.filter((b) => b.universityId !== universityId)
        : [{ universityId, department, createdAt: new Date().toISOString() }, ...bookmarks];

      setBookmarks(next);
      writeLocalBookmarks(next);

      if (exists) {
        toast.info(universityName ? `${universityName}을(를) 관심 대학에서 제거했습니다.` : '관심 대학에서 제거했습니다.');
      } else {
        toast.success(universityName ? `${universityName}을(를) 관심 대학에 저장했습니다.` : '관심 대학에 저장했습니다.');
      }

      if (user) {
        try {
          if (exists) await bookmarkApi.remove(universityId);
          else await bookmarkApi.save(universityId, department);
        } catch {
          // 낙관적 업데이트 유지
        }
      }
    },
    [bookmarks, user, toast]
  );

  const isComparing = useCallback(
    (universityId) => compareIds.includes(universityId),
    [compareIds]
  );

  const toggleCompare = useCallback(
    (universityId, universityName = '') => {
      setCompareIds((prev) => {
        if (prev.includes(universityId)) {
          return prev.filter((id) => id !== universityId);
        }
        if (prev.length >= 4) {
          toast.info('최대 4개 대학까지 동시에 비교할 수 있습니다.');
          return prev;
        }
        if (universityName && prev.length === 0) {
          toast.info(`${universityName}을(를) 비교 목록에 담았습니다. 2개 이상 선택해 비교하세요.`);
        }
        return [...prev, universityId];
      });
    },
    [toast]
  );

  const clearCompare = useCallback(() => {
    setCompareIds([]);
    setCompareOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      bookmarks,
      isBookmarked,
      toggleBookmark,
      compareIds,
      isComparing,
      toggleCompare,
      clearCompare,
      compareOpen,
      setCompareOpen,
      detailTarget,
      openDetail: (item) => setDetailTarget(item),
      closeDetail: () => setDetailTarget(null),
    }),
    [
      bookmarks,
      isBookmarked,
      toggleBookmark,
      compareIds,
      isComparing,
      toggleCompare,
      clearCompare,
      compareOpen,
      detailTarget,
    ]
  );

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}
