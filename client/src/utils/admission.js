export const APPLE_EASE = [0.22, 1, 0.36, 1];

export const TIER_META = {
  safety: {
    key: 'safety',
    label: '안정 지원',
    shortLabel: '안정',
    rangeText: '추정 적합도 75% 이상',
    desc: '전년도 합격자 평균 대비 여유 점수가 형성된 안정 구간입니다.',
  },
  target: {
    key: 'target',
    label: '적정 지원',
    shortLabel: '적정',
    rangeText: '추정 적합도 45% – 74%',
    desc: '전년도 합격자 분포 중심에 위치한 핵심 목표 구간입니다.',
  },
  reach: {
    key: 'reach',
    label: '소신 지원',
    shortLabel: '소신',
    rangeText: '추정 적합도 15% – 44%',
    desc: '반영비율 유불리와 추가합격 추이에 따라 도전 가능한 구간입니다.',
  },
  challenge: {
    key: 'challenge',
    label: '도전 구간',
    shortLabel: '도전',
    rangeText: '추정 적합도 15% 미만',
    desc: '전년도 평균 커트라인 대비 점수 격차가 큰 구간입니다.',
  },
};

export function calcLocalEvaluation(scoreNum, cutoffRange) {
  const diff = cutoffRange.avg - scoreNum;
  const spread = Math.max(4, (cutoffRange.max - cutoffRange.min) / 2);
  const k = Math.max(5.5, spread * 0.95);
  const probability = Math.max(5, Math.min(98, Math.round(100 / (1 + Math.exp((diff - 1.4) / k)))));
  const bucket =
    probability >= 75
      ? 'safety'
      : probability >= 45
        ? 'target'
        : probability >= 15
          ? 'reach'
          : 'challenge';
  const scoreDelta = Number((scoreNum - cutoffRange.avg).toFixed(1));
  return { probability, bucket, scoreDelta };
}

/**
 * 가·나·다군 3장 슬롯의 1개교 이상 합격 기대율 및 포트폴리오 위험도 진단
 */
export function evaluatePortfolioCombination(slots = {}) {
  const activeSlots = ['가군', '나군', '다군']
    .map((g) => (slots[g] ? { ...slots[g], group: g } : null))
    .filter(Boolean);

  if (activeSlots.length === 0) {
    return {
      combinedProbability: 0,
      failAllRisk: 100,
      hasDuplicateUni: false,
      diagnosisTitle: '모집군 슬롯을 선택해주세요',
      diagnosisTone: 'neutral',
      diagnosisText: '가·나·다군에 지원할 대학을 배치하면 3장 조합의 종합 합격 기대율을 계산합니다.',
    };
  }

  const uniIds = activeSlots.map((s) => s.id);
  const uniqueIds = new Set(uniIds);
  const hasDuplicateUni = uniqueIds.size !== uniIds.length;

  const failAllProb = activeSlots.reduce((acc, s) => {
    const p = Math.max(0.05, Math.min(0.98, (Number(s.probability) || 0) / 100));
    return acc * (1 - p);
  }, 1);

  const combinedProbability = Math.max(5, Math.min(99, Math.round((1 - failAllProb) * 100)));
  const failAllRisk = Math.max(1, 100 - combinedProbability);

  const safetyCount = activeSlots.filter((s) => s.bucket === 'safety').length;
  const targetCount = activeSlots.filter((s) => s.bucket === 'target').length;
  const reachCount = activeSlots.filter((s) => s.bucket === 'reach').length;
  const challengeCount = activeSlots.filter((s) => s.bucket === 'challenge').length;

  if (hasDuplicateUni) {
    return {
      combinedProbability,
      failAllRisk,
      hasDuplicateUni,
      diagnosisTitle: '동일 대학 중복 배치 주의',
      diagnosisTone: 'warn',
      diagnosisText:
        '동일 대학을 서로 다른 모집군에 중복 배치했습니다. 타 대학으로 분산 배치하면 실질 합격 기대율을 더 높일 수 있습니다.',
    };
  }

  if (safetyCount >= 1 && targetCount >= 1) {
    return {
      combinedProbability,
      failAllRisk,
      hasDuplicateUni: false,
      diagnosisTitle: '안정성과 목표를 겸비한 균형 배치',
      diagnosisTone: 'good',
      diagnosisText: `안정 ${safetyCount}장 · 적정 ${targetCount}장${reachCount > 0 ? ` · 소신 ${reachCount}장` : ''} 조합으로 1개교 이상 합격 기대율이 ${combinedProbability}%에 달하는 이상적인 포트폴리오입니다.`,
    };
  }

  if (safetyCount >= 2) {
    return {
      combinedProbability,
      failAllRisk,
      hasDuplicateUni: false,
      diagnosisTitle: '안정권 중심의 보수적 배치',
      diagnosisTone: 'good',
      diagnosisText: `안정 지원 ${safetyCount}장이 포함되어 불합격 위험도가 ${failAllRisk}%로 매우 낮습니다. 1개 군은 적정·소신 대학으로 상향 지원을 검토해 보세요.`,
    };
  }

  if (safetyCount === 0 && (reachCount + challengeCount >= 2 || combinedProbability < 75)) {
    return {
      combinedProbability,
      failAllRisk,
      hasDuplicateUni: false,
      diagnosisTitle: '상향 위주 배치 (안정 카드 보강 권장)',
      diagnosisTone: 'warn',
      diagnosisText: `현재 안정권 카드가 없어 3장 모두 불합격할 위험도가 ${failAllRisk}%입니다. 다군 또는 나군 중 1장은 안정 지원 대학으로 보완하는 것을 권장합니다.`,
    };
  }

  return {
    combinedProbability,
    failAllRisk,
    hasDuplicateUni: false,
    diagnosisTitle: '적정 중심 정시 포트폴리오',
    diagnosisTone: 'neutral',
    diagnosisText: `3개 모집군 종합 1개교 이상 합격 기대율은 ${combinedProbability}%입니다. 각 대학의 전년도 충원율과 영역별 반영비율을 함께 확인하세요.`,
  };
}

/**
 * 리포트 요약 텍스트 생성 (클립보드 복사용)
 */
export function formatReportSummaryText(meta) {
  if (!meta) return '';
  const lines = [
    `[UniPick 2025 정시 입시 분석 리포트]`,
    `• 입력 성적: 국·수·탐(2) 표준점수 합 ${meta.score}점 (영어 ${meta.englishGrade}등급)`,
    `• 희망 전공: ${meta.major} (${meta.category}계열) | 전국 위치: ${meta.level} (${meta.percentileEstimate})`,
    `• 지원 가능 대학: 총 ${meta.supportableCount}개교 (안정 ${meta.safetyCount} · 적정 ${meta.targetCount} · 소신 ${meta.reachCount})`,
  ];

  if (meta.subjectProfile) {
    lines.push(
      `• 과목별 강점: ${meta.subjectProfile.strengthType} (국 ${meta.subjectProfile.kor} / 수 ${meta.subjectProfile.math} / 탐합 ${meta.subjectProfile.inq})`
    );
  }

  const featured = meta.featured || {};
  const featuredItems = [
    featured.safety ? `안정: ${featured.safety.university} ${featured.safety.department} (${featured.safety.probability}%)` : null,
    featured.target ? `적정: ${featured.target.university} ${featured.target.department} (${featured.target.probability}%)` : null,
    featured.reach ? `소신: ${featured.reach.university} ${featured.reach.department} (${featured.reach.probability}%)` : null,
  ].filter(Boolean);

  if (featuredItems.length > 0) {
    lines.push(`• 핵심 추천: ${featuredItems.join(' | ')}`);
  }

  const bal = meta.recommendedPortfolios?.balanced;
  if (bal && bal.slots) {
    const slotText = ['가군', '나군', '다군']
      .map((g) => {
        const s = bal.slots[g];
        return s ? `${g} ${s.shortName}(${s.department}·${s.probability}%)` : `${g} 미배치`;
      })
      .join(' / ');
    lines.push(`• 가·나·다군 추천 배치: ${slotText} (1개교 이상 합격 기대율 ${bal.combinedProbability}%)`);
  }

  return lines.join('\n');
}

export const GUEST_HISTORY_KEY = 'unipick_guest_history_v1';

export function loadGuestHistory() {
  try {
    const raw = localStorage.getItem(GUEST_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGuestHistoryItem(meta) {
  if (!meta) return [];
  const current = loadGuestHistory();
  const newItem = {
    id: `guest-${Date.now()}`,
    isGuest: true,
    score: meta.score,
    major: meta.major,
    category: meta.category,
    level: meta.level,
    englishGrade: meta.englishGrade || 1,
    safetyCount: meta.safetyCount ?? 0,
    targetCount: meta.targetCount ?? 0,
    reachCount: meta.reachCount ?? 0,
    subjectProfile: meta.subjectProfile || null,
    created_at: new Date().toISOString(),
  };

  // 동일 조건이 직전 기록과 완전히 같으면 중복 추가 대신 최신 시간으로 갱신
  const filtered = current.filter(
    (item, idx) =>
      !(
        idx === 0 &&
        item.score === newItem.score &&
        item.major === newItem.major &&
        item.category === newItem.category &&
        item.englishGrade === newItem.englishGrade
      )
  );

  const next = [newItem, ...filtered].slice(0, 25);
  try {
    localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function deleteGuestHistoryItem(id) {
  const current = loadGuestHistory();
  const next = current.filter((item) => String(item.id) !== String(id));
  try {
    localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
