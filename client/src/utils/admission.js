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
