// services/analysis.js
// UniPick 정시 입시 분석 엔진 (2025학년도 합격선 데이터 기반)
// - 한/영 전공 입력 정규화 및 계열 자동 분류
// - 희망 학과(메디컬/첨단·계약/상경·특성화/광역·전략학과)별 세분화 커트라인 보정
// - 대학별 실제 영어 등급 감점 반영 및 영어 유불리 진단
// - 국어·수학·탐구 과목별 강점 분석 및 대학별 반영비율 유불리 산출
// - 가·나·다군 3장 최적 원서 조합(포트폴리오) 자동 설계
// - [혁신 기능 1] 최초합 vs 1·2차 추합 vs 최종 추합 차수별 생존 시뮬레이션 (waitlistWave)
// - [혁신 기능 2] 상위 대학 학과 피벗 & 환산점수 역전 스캐너 (strategyInsights)

const { universityData, DATA_SOURCES } = require('../data/universities');

// 영문·약어 전공 입력 → 한글 전공명 매핑
const ENG_TO_KOR_MAP = {
  medicine: '의예과',
  medical: '의예과',
  premed: '의예과',
  dentistry: '치의예과',
  dental: '치의예과',
  pharmacy: '약학과',
  vet: '수의예과',
  veterinary: '수의예과',
  orientalmedicine: '한의예과',
  nursing: '간호학과',
  cs: '컴퓨터공학',
  computer: '컴퓨터공학',
  computerscience: '컴퓨터공학',
  software: '소프트웨어',
  sw: '소프트웨어',
  ai: '인공지능',
  artificialintelligence: '인공지능',
  semiconductor: '반도체공학',
  ee: '전자전기공학',
  electrical: '전자전기공학',
  electronics: '전자전기공학',
  mechanical: '기계공학',
  mech: '기계공학',
  chemical: '화공생명공학',
  chem: '화공생명공학',
  architecture: '건축학',
  business: '경영학과',
  management: '경영학과',
  mba: '경영학과',
  economics: '경제학부',
  econ: '경제학부',
  finance: '금융학부',
  media: '미디어커뮤니케이션',
  communication: '미디어커뮤니케이션',
  psychology: '심리학과',
  law: '법학과',
  politics: '정치외교학',
  publicadmin: '행정학과',
  liberalarts: '자유전공학부',
  design: '시각디자인',
  art: '미술',
  fineart: '미술',
  music: '음악',
  sports: '체육',
  pe: '체육교육과',
};

const VALID_CATEGORIES = ['인문', '자연', '예체능'];

// 기준 영어 등급별 평균 표준점수 감점 추정치 (글로벌 메타 표시용)
const ENGLISH_PENALTY_MAP = {
  1: 0,
  2: -1.5,
  3: -4.0,
  4: -7.5,
  5: -11.0,
};

function normalizeToKorean(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  const key = trimmed.toLowerCase().replace(/[\s\-_.]/g, '');
  if (ENG_TO_KOR_MAP[key]) return ENG_TO_KOR_MAP[key];

  for (const [eng, kor] of Object.entries(ENG_TO_KOR_MAP)) {
    if (eng.length >= 4 && key.includes(eng)) return kor;
  }
  return trimmed;
}

function getCategory(major, categoryOverride = null) {
  if (categoryOverride && VALID_CATEGORIES.includes(categoryOverride)) {
    return categoryOverride;
  }
  const m = normalizeToKorean(major);

  if (
    /의예|의학|의대|치의|한의|수의|약학|간호|컴퓨터|소프트웨어|SW|인공지능|AI|데이터|반도체|전기|전자|기계|화공|화학|생명|생물|물리|수학|수리|건축|도시공학|로봇|모빌리티|자동차|항공|에너지|신소재|정보보호|정보통신|공학|자연|이과/.test(
      m
    )
  ) {
    return '자연';
  }

  if (/디자인|미술|조형|조소|회화|성악|기악|작곡|음악|체육|스포츠|태권도|연극|영화|영상|만화|애니|예체능|예술/.test(m)) {
    return '예체능';
  }

  return '인문';
}

function isMedicalTrack(major) {
  const m = normalizeToKorean(major);
  return /의예|의학|의대|의과|치의|한의|약학|수의/.test(m);
}

/**
 * 희망 전공과 가장 잘 매칭되는 해당 대학 학과를 탐색합니다.
 */
function findMatchingDepartment(uni, major, category) {
  const normalized = normalizeToKorean(major);
  const trackDepts = uni.departments[category] || [];
  const allDepts = [
    ...trackDepts,
    ...(uni.departments.인문 || []),
    ...(uni.departments.자연 || []),
    ...(uni.departments.예체능 || []),
  ];

  if (!normalized) {
    return {
      department: trackDepts[0] || allDepts[0] || '일반전형 모집단위',
      isExactMatch: false,
      hasMedicalDept: true,
    };
  }

  const coreKeyword = normalized
    .replace(/(학과|학부|전공|계열|대학|과)$/g, '')
    .trim();

  // 1) 동일 계열 내 정확/부분 일치
  const exactInTrack = trackDepts.find(
    (d) => d.includes(normalized) || (coreKeyword.length >= 2 && d.includes(coreKeyword))
  );
  if (exactInTrack) {
    return { department: exactInTrack, isExactMatch: true, hasMedicalDept: true };
  }

  // 2) 전체 계열 내 부분 일치
  const exactInAll = allDepts.find(
    (d) => d.includes(normalized) || (coreKeyword.length >= 2 && d.includes(coreKeyword))
  );
  if (exactInAll) {
    return { department: exactInAll, isExactMatch: true, hasMedicalDept: true };
  }

  // 3) 의미 그룹 유사 매칭
  const similarityRules = [
    { pattern: /의예|의학|의대|의과/, target: /의예|의학|의과/ },
    { pattern: /치의|치대/, target: /치의/ },
    { pattern: /한의|한방/, target: /한의/ },
    { pattern: /약학|약대/, target: /약학/ },
    { pattern: /수의/, target: /수의/ },
    { pattern: /컴퓨터|소프트웨어|SW|인공지능|AI|데이터|정보/, target: /컴퓨터|소프트웨어|SW|인공지능|AI|데이터|정보/ },
    { pattern: /반도체|전자|전기|통신/, target: /반도체|전자|전기|통신|ICT/ },
    { pattern: /기계|자동차|모빌리티|항공|로봇/, target: /기계|자동차|모빌리티|항공|로봇/ },
    { pattern: /화공|화학|생명|바이오|신소재|에너지/, target: /화공|화학|생명|바이오|신소재|에너지/ },
    { pattern: /경영|회계|세무|금융|파이낸스|비즈니스/, target: /경영|금융|파이낸스|회계|세무/ },
    { pattern: /경제|통상|무역/, target: /경제|통상|무역/ },
    { pattern: /미디어|언론|방송|광고|홍보|커뮤니케이션/, target: /미디어|언론|광고|커뮤니케이션/ },
    { pattern: /정치|외교|행정|법|경찰|공공/, target: /정치|외교|행정|법|경찰|공공|리더|정책/ },
    { pattern: /심리|사회|복지|아동|청소년/, target: /심리|사회|복지/ },
    { pattern: /자유전공|자율전공|무전공/, target: /자유전공|자율전공|열린전공|인터칼리지/ },
    { pattern: /디자인|시각|산업디자인|미술/, target: /디자인|미술|조형/ },
    { pattern: /체육|스포츠/, target: /체육|스포츠/ },
  ];

  for (const rule of similarityRules) {
    if (rule.pattern.test(normalized)) {
      const matched = trackDepts.find((d) => rule.target.test(d)) || allDepts.find((d) => rule.target.test(d));
      if (matched) {
        return { department: matched, isExactMatch: true, hasMedicalDept: true };
      }
      if (/의예|의학|치의|한의|약학|수의/.test(normalized)) {
        return {
          department: `${trackDepts[0] || allDepts[0] || '자연계열'} (해당 전공 미개설)`,
          isExactMatch: false,
          hasMedicalDept: false,
        };
      }
    }
  }

  return {
    department: trackDepts[0] || allDepts[0] || '일반전형 모집단위',
    isExactMatch: false,
    hasMedicalDept: true,
  };
}

/**
 * 매칭된 학과 및 계열에 따른 현실적인 세분화 커트라인 보정
 */
function getAdjustedCutoffRange(uni, category, matchedDept, hasMedicalDept = true) {
  const baseAvg = uni.cutoff;
  const baseMin = uni.cutoffRange.min;
  const baseMax = uni.cutoffRange.max;
  const dept = String(matchedDept || '');

  let targetAvg = baseAvg;
  let deptTierLabel = '일반 모집단위';

  if (hasMedicalDept && /의예|의학|의과대학/.test(dept)) {
    targetAvg = Math.max(baseAvg + 13, Math.min(baseMax, 412));
    deptTierLabel = '의학계열 최상위';
  } else if (hasMedicalDept && /치의|한의/.test(dept)) {
    targetAvg = Math.max(baseAvg + 10, Math.min(baseMax, 404));
    deptTierLabel = '치·한의학계열';
  } else if (hasMedicalDept && /약학|수의/.test(dept)) {
    targetAvg = Math.max(baseAvg + 7, Math.min(baseMax, 398));
    deptTierLabel = '약학·수의학계열';
  } else if (/시스템반도체|반도체시스템|반도체공학|반도체융합|차세대통신|스마트모빌리티|미래자동차/.test(dept)) {
    targetAvg = baseAvg + 4;
    deptTierLabel = '첨단·계약학과 강세';
  } else if (/컴퓨터|소프트웨어|인공지능|AI|데이터사이언스/.test(dept)) {
    targetAvg = baseAvg + 2;
    deptTierLabel = 'IT·SW 선호 학과';
  } else if (/글로벌경영|글로벌경제|글로벌금융|파이낸스경영|LD학부|LT학부|경찰행정|세무학과/.test(dept)) {
    targetAvg = baseAvg + 3;
    deptTierLabel = '인문 최상위 특성화';
  } else if (/경영|경제/.test(dept)) {
    targetAvg = baseAvg + 1;
    deptTierLabel = '상경계열 주력';
  } else if (
    /인문계|사회과학|공학계열|자유전공|자율전공|열린전공|인터칼리지|퇴계혁신|도시공학|환경공학|건축|고분자|생명화학|가족복지|청소년|특수교육|국어교육|영어영문|영미문화/.test(
      dept
    )
  ) {
    targetAvg = baseAvg - 2;
    deptTierLabel = '광역·틈새 전략 학과';
  } else if (category === '예체능') {
    targetAvg = baseAvg - 3;
    deptTierLabel = '예체능 전형';
  } else if (category === '자연' && !/인문|사회|자유전공/.test(dept)) {
    targetAvg = baseAvg + 1;
  }

  const delta = Math.round(targetAvg - baseAvg);
  const spreadLow = Math.max(5, baseAvg - baseMin);
  const spreadHigh = Math.max(5, Math.min(10, baseMax - baseAvg));

  const adjustedAvg = baseAvg + delta;
  const adjustedMin = adjustedAvg - spreadLow;
  const adjustedMax = Math.max(adjustedAvg + 5, Math.min(425, adjustedAvg + spreadHigh));

  return {
    cutoff: adjustedAvg,
    cutoffRange: {
      min: adjustedMin,
      avg: adjustedAvg,
      max: adjustedMax,
    },
    deptAdjustment: delta,
    deptTierLabel,
  };
}

/**
 * 과목별 표준점수(국어·수학·탐구1·탐구2) 입력 시 수험생 강점 유형 진단 및 대학별 반영비율 유불리 산출
 */
function analyzeSubjectProfile(subjects) {
  if (!subjects || typeof subjects !== 'object') return null;
  const kor = Number(subjects.kor);
  const math = Number(subjects.math);
  const sub1 = Number(subjects.sub1);
  const sub2 = Number(subjects.sub2);

  if (
    !Number.isFinite(kor) ||
    !Number.isFinite(math) ||
    !Number.isFinite(sub1) ||
    !Number.isFinite(sub2) ||
    kor <= 0 ||
    math <= 0 ||
    sub1 <= 0 ||
    sub2 <= 0
  ) {
    return null;
  }

  const inq = sub1 + sub2;
  const total = kor + math + inq;
  if (total < 150 || total > 500) return null;

  const korShare = kor / total;
  const mathShare = math / total;
  const inqShare = inq / total;

  let strengthType = '균형형';
  let summary = '국어·수학·탐구 전 영역이 고르게 분포되어 대학별 반영비율 편차에 따른 불이익이 적습니다.';

  if (math - kor >= 6 || mathShare >= 0.365) {
    strengthType = '수학 강점형';
    summary = '수학 표준점수 우위가 뚜렷하여 수학 반영 비중이 40% 이상인 대학(서강대·서울대·연세대·한양대·시립대 등)에서 환산점수가 유리합니다.';
  } else if (kor - math >= 6 || korShare >= 0.365) {
    strengthType = '국어 강점형';
    summary = '국어 표준점수 경쟁력이 높아 국어 비중이 37~42%로 높은 대학(성균관대·경희대·중앙대·숭실대·단국대 등) 지원 시 유리합니다.';
  } else if (inqShare >= 0.355) {
    strengthType = '탐구 강점형';
    summary = '탐구 2과목 표준점수 합이 우수하여 탐구 반영 비중이 35% 이상인 대학(경희대·한국외대·한양대 자연·홍익대 자연 등)에서 강점을 발휘합니다.';
  }

  return {
    kor,
    math,
    sub1,
    sub2,
    inq,
    total,
    korPct: Number((korShare * 100).toFixed(1)),
    mathPct: Number((mathShare * 100).toFixed(1)),
    inqPct: Number((inqShare * 100).toFixed(1)),
    strengthType,
    summary,
  };
}

function calcUniversityWeightAdvantage(uni, category, subjectProfile) {
  const trackKey = category === '자연' ? '자연' : '인문';
  const weights = uni.weights?.[trackKey] || uni.weights?.인문 || { kor: 33.3, math: 33.3, inq: 33.4 };

  if (!subjectProfile) {
    return {
      weights,
      weightDelta: 0,
      weightAdvantageLabel: '반영비율 기본',
    };
  }

  const korShareDiff = subjectProfile.korPct / 100 - 1 / 3;
  const mathShareDiff = subjectProfile.mathPct / 100 - 1 / 3;
  const inqShareDiff = subjectProfile.inqPct / 100 - 1 / 3;

  const rawDelta =
    (korShareDiff * (weights.kor - 33.3) +
      mathShareDiff * (weights.math - 33.3) +
      inqShareDiff * (weights.inq - 33.4)) *
    1.5;

  const weightDelta = Math.max(-3.5, Math.min(3.5, Number(rawDelta.toFixed(1))));
  const weightAdvantageLabel =
    weightDelta >= 0.5
      ? '반영비율 유리'
      : weightDelta <= -0.5
        ? '반영비율 불리'
        : '반영비율 중립';

  return {
    weights,
    weightDelta,
    weightAdvantageLabel,
  };
}

function calculateProbability(effectiveScore, cutoffRange) {
  const { min, avg, max } = cutoffRange;
  const diff = avg - effectiveScore;
  const spread = Math.max(4, (max - min) / 2);
  const k = Math.max(5.5, spread * 0.95);
  const raw = Math.round(100 / (1 + Math.exp((diff - 1.4) / k)));
  return Math.max(5, Math.min(98, raw));
}

function classifySupportTier(probability) {
  if (probability >= 75) {
    return {
      bucket: 'safety',
      tierLabel: '안정 지원',
      tierShort: '안정',
      summary: '전년도 합격자 평균 이상의 여유 점수가 확보된 구간입니다.',
    };
  }
  if (probability >= 45) {
    return {
      bucket: 'target',
      tierLabel: '적정 지원',
      tierShort: '적정',
      summary: '전년도 합격자 분포 중심권으로 적극 지원을 검토할 수 있는 구간입니다.',
    };
  }
  if (probability >= 15) {
    return {
      bucket: 'reach',
      tierLabel: '소신 지원',
      tierShort: '소신',
      summary: '반영비율 유불리와 추가합격(충원율)을 고려해 도전 가능한 구간입니다.',
    };
  }
  return {
    bucket: 'challenge',
    tierLabel: '도전 구간',
    tierShort: '도전',
    summary: '전년도 합격선 대비 점수 격차가 커 상향 조정이 필요한 구간입니다.',
  };
}

/**
 * [혁신 기능 1] 최초합 vs 1·2차 추합 vs 최종 전화찬스 차수별 생존 시뮬레이션
 * 대학별 충원율(waitlistRatio)과 합격선 분포(cutoffRange)를 기반으로
 * 내 환산 점수가 어느 추합 차수에서 합격권에 진입하는지 정밀 판정합니다.
 */
function calcWaitlistWaveAnalysis(uniEffectiveScore, cutoffRange, waitlistRatio = 75) {
  const { min, avg, max } = cutoffRange;
  // 충원율이 높을수록 최초합 컷과 최종 추합 컷 사이의 스펙트럼이 넓어짐
  const initialOffset = waitlistRatio >= 110 ? 2.5 : waitlistRatio >= 75 ? 2.0 : 1.2;
  const initialCutoff = Number((avg + initialOffset).toFixed(1));
  const wave12Cutoff = Number((avg - 1.5).toFixed(1));
  const finalCutoff = min;

  const rotations = Number((waitlistRatio / 100).toFixed(2));

  let stage = 'out';
  let stageLabel = '추합권 진입 전';
  let waveBadge = '상향 돌파 필요';
  let stageSummary = `전년도 최종 추가합격 마지노선(${finalCutoff}점) 대비 ${Number((finalCutoff - uniEffectiveScore).toFixed(1))}점이 부족합니다.`;

  if (uniEffectiveScore >= initialCutoff) {
    stage = 'initial';
    stageLabel = '최초합격 안정권';
    waveBadge = '최초합 유력';
    stageSummary = `추가합격 대기 없이 최초합격 발표에서 바로 합격할 가능성이 높은 점수대입니다 (최초합 기준선 +${Number((uniEffectiveScore - initialCutoff).toFixed(1))}점).`;
  } else if (uniEffectiveScore >= wave12Cutoff) {
    stage = 'wave12';
    stageLabel = '1~2차 주력 추합권';
    waveBadge = '예비 앞번호 · 1~2차 추합';
    stageSummary = `최초합격선(${initialCutoff}점)에는 소폭 못 미치나, 전년도 충원율(${waitlistRatio}% · 약 ${rotations}바퀴 회전) 기준 1~2차 추가합격에서 안정적으로 흡수되는 구간입니다.`;
  } else if (uniEffectiveScore >= finalCutoff) {
    stage = 'final_wave';
    stageLabel = '3차~최종 문닫기 추합권';
    waveBadge = '후반 추합 · 전화찬스 경합';
    stageSummary = `예비번호 중하위권으로 3차 이후 후반부 추가합격 및 최종 등록 마감일 충원(충원율 ${waitlistRatio}%)까지 지켜봐야 하는 소신 경합 구간입니다.`;
  }

  return {
    initialCutoff,
    wave12Cutoff,
    finalCutoff,
    topCutoff: max,
    waitlistRatio,
    rotations,
    stage,
    stageLabel,
    waveBadge,
    stageSummary,
  };
}

/**
 * [혁신 기능 2] 상위 대학 학과 피벗 & 환산 역전 스캐너 (Strategy Insights)
 * - 동일 점수로 더 높은 대학에 들어갈 수 있는 '학과 피벗 찬스'
 * - 내 영어 등급·과목별 강점이 가장 크게 작용하는 '환산점수 역전 대학'
 * - 최초합은 어려워 보여도 충원율 덕분에 추합으로 열리는 '고충원 추합 블루오션'
 */
function buildStrategyInsights(evaluated, scoreNum, category, safeEnglishGrade) {
  // 1) 학과 피벗(Department Pivot) 스캐너:
  // 현재 적정/소신/도전 구간 대학(probability 10% ~ 78%) 내에서 다른 학과로 피벗했을 때 합격률이 상승하는 기회 탐색
  const departmentPivots = [];

  for (const item of evaluated) {
    if (item.probability >= 80 || item.probability < 8) continue;
    const trackDepts = item.departments?.[category] || [];
    if (trackDepts.length <= 1) continue;

    let bestAlt = null;
    for (const candidateDept of trackDepts) {
      if (candidateDept === item.department) continue;
      // 메디컬 학과로 피벗하는 것은 제외 (일반 학과에서 낮은 컷 학과를 찾는 목적)
      if (/의예|의학|치의|한의|약학|수의/.test(candidateDept)) continue;

      const altAdj = getAdjustedCutoffRange(item, category, candidateDept, true);
      const altProb = calculateProbability(item.effectiveScore, altAdj.cutoffRange);
      const probGain = altProb - item.probability;
      const cutoffSaved = item.cutoff - altAdj.cutoff;

      if (probGain >= 5 && cutoffSaved >= 1) {
        if (!bestAlt || probGain > bestAlt.probGain) {
          const altTier = classifySupportTier(altProb);
          bestAlt = {
            universityId: item.id,
            university: item.university,
            shortName: item.shortName,
            group: item.group,
            fromDepartment: item.department,
            fromCutoff: item.cutoff,
            fromProbability: item.probability,
            fromBucket: item.bucket,
            toDepartment: candidateDept,
            toCutoff: altAdj.cutoff,
            toProbability: altProb,
            toBucket: altTier.bucket,
            toTierLabel: altTier.tierLabel,
            probGain,
            cutoffSaved,
            deptTierLabel: altAdj.deptTierLabel,
            reason: `${item.shortName} 내 '${item.department}'(${item.cutoff}점) 대신 '${candidateDept}'(${altAdj.cutoff}점)으로 학과를 피벗하면 커트라인이 ${cutoffSaved}점 낮아져 합격 적합도가 ${item.probability}% → ${altProb}% (+${probGain}%p)로 급상승합니다.`,
          };
        }
      }
    }

    if (bestAlt) {
      departmentPivots.push(bestAlt);
    }
  }

  // 합격률 상승폭 및 적정권 진입 우선 정렬
  departmentPivots.sort((a, b) => {
    const aEnterTarget = a.fromProbability < 50 && a.toProbability >= 50 ? 1 : 0;
    const bEnterTarget = b.fromProbability < 50 && b.toProbability >= 50 ? 1 : 0;
    if (aEnterTarget !== bEnterTarget) return bEnterTarget - aEnterTarget;
    return b.probGain - a.probGain;
  });

  // 2) 내 성적 구조 환산 역전 대학 (Score Inversions):
  // 평균 영어 감점 대비 이득 + 과목 반영비율 이득(weightDelta)이 가장 큰 지원 가능 대학
  const avgEngPenalty = ENGLISH_PENALTY_MAP[safeEnglishGrade] ?? 0;
  const scoreInversions = evaluated
    .filter((u) => u.probability >= 15 && u.probability <= 92)
    .map((u) => {
      const engRelativeGain = Number((u.englishPenalty - avgEngPenalty).toFixed(1));
      const totalRelativeGain = Number((engRelativeGain + (u.weightDelta || 0)).toFixed(1));
      const maxSubject =
        u.weights.math >= u.weights.kor && u.weights.math >= u.weights.inq
          ? `수학 ${u.weights.math}% 강세`
          : u.weights.kor >= u.weights.inq
            ? `국어 ${u.weights.kor}% 강세`
            : `탐구 ${u.weights.inq}% 강세`;

      return {
        universityId: u.id,
        university: u.university,
        shortName: u.shortName,
        department: u.department,
        group: u.group,
        cutoff: u.cutoff,
        probability: u.probability,
        bucket: u.bucket,
        tierLabel: u.tierLabel,
        engRelativeGain,
        weightDelta: u.weightDelta || 0,
        totalRelativeGain,
        maxSubject,
        englishRule: u.englishRule,
        reason:
          totalRelativeGain > 0
            ? `동일 총점 경쟁자 대비 환산점수에서 약 +${totalRelativeGain}점 유리합니다 (${maxSubject}${safeEnglishGrade >= 2 ? ` · 영어 ${safeEnglishGrade}등급 감점 ${u.englishPenalty}점` : ''}).`
            : `${maxSubject} 반영 구조와 전년도 충원율(${u.waitlistRatio}%)을 활용해 전략적 지원이 가능한 대학입니다.`,
      };
    })
    .sort((a, b) => b.totalRelativeGain - a.totalRelativeGain || b.probability - a.probability)
    .slice(0, 4);

  // 3) 고충원 추합 블루오션 (Waitlist Sweet Spots):
  // 최초합격선에는 못 미치지만 충원율(70% 이상) 덕분에 1~2차 또는 최종 추합권에 들어오는 대학
  const waitlistSweetSpots = evaluated
    .filter(
      (u) =>
        (u.waitlistWave.stage === 'wave12' || u.waitlistWave.stage === 'final_wave') &&
        u.waitlistRatio >= 65
    )
    .sort((a, b) => b.waitlistRatio - a.waitlistRatio)
    .slice(0, 4)
    .map((u) => ({
      universityId: u.id,
      university: u.university,
      shortName: u.shortName,
      department: u.department,
      group: u.group,
      cutoff: u.cutoff,
      initialCutoff: u.waitlistWave.initialCutoff,
      finalCutoff: u.waitlistWave.finalCutoff,
      waitlistRatio: u.waitlistRatio,
      rotations: u.waitlistWave.rotations,
      stage: u.waitlistWave.stage,
      stageLabel: u.waitlistWave.stageLabel,
      waveBadge: u.waitlistWave.waveBadge,
      probability: u.probability,
      bucket: u.bucket,
      reason: u.waitlistWave.stageSummary,
    }));

  return {
    departmentPivots: departmentPivots.slice(0, 4),
    scoreInversions,
    waitlistSweetSpots,
  };
}

/**
 * 가·나·다군 3장 최적 원서 조합(포트폴리오) 자동 생성
 */
function buildRecommendedPortfolios(evaluated) {
  const groups = ['가군', '나군', '다군'];

  const hasGroup = (uni, g) => {
    if (Array.isArray(uni.groups)) return uni.groups.includes(g);
    return String(uni.group || '').includes(g.replace('군', ''));
  };

  const pickBestForSlot = (group, desiredBuckets, usedIds, targetProb = 65) => {
    const candidates = evaluated.filter((u) => hasGroup(u, group) && !usedIds.has(u.id));
    if (candidates.length === 0) return null;

    for (const bucket of desiredBuckets) {
      const inBucket = candidates
        .filter((u) => u.bucket === bucket)
        .sort((a, b) => Math.abs(a.probability - targetProb) - Math.abs(b.probability - targetProb));
      if (inBucket.length > 0) return inBucket[0];
    }

    return [...candidates].sort(
      (a, b) => Math.abs(a.probability - targetProb) - Math.abs(b.probability - targetProb)
    )[0];
  };

  const buildPreset = (key, label, badge, description, slotRules) => {
    const usedIds = new Set();
    const slots = {};

    const assignOrder = ['다군', '나군', '가군'];
    for (const g of assignOrder) {
      const rule = slotRules[g];
      const chosen = pickBestForSlot(g, rule.buckets, usedIds, rule.targetProb);
      if (chosen) {
        usedIds.add(chosen.id);
        slots[g] = {
          group: g,
          id: chosen.id,
          university: chosen.university,
          shortName: chosen.shortName,
          department: chosen.department,
          cutoff: chosen.cutoff,
          cutoffRange: chosen.cutoffRange,
          probability: chosen.probability,
          scoreDelta: chosen.scoreDelta,
          bucket: chosen.bucket,
          tierLabel: chosen.tierLabel,
          waitlistRatio: chosen.waitlistRatio,
          competitionRate: chosen.competitionRate,
          weightAdvantageLabel: chosen.weightAdvantageLabel,
          weightDelta: chosen.weightDelta,
          englishAdvantage: chosen.englishAdvantage,
          englishPenalty: chosen.englishPenalty,
          waitlistWave: chosen.waitlistWave,
        };
      } else {
        slots[g] = null;
      }
    }

    const orderedSlots = {};
    for (const g of groups) {
      orderedSlots[g] = slots[g] || null;
    }

    const activeProbs = Object.values(orderedSlots)
      .filter(Boolean)
      .map((s) => Math.max(0.05, Math.min(0.98, s.probability / 100)));

    const failAllProb = activeProbs.reduce((acc, p) => acc * (1 - p), 1);
    const combinedProbability =
      activeProbs.length > 0 ? Math.max(8, Math.min(99, Math.round((1 - failAllProb) * 100))) : 0;

    return {
      key,
      label,
      badge,
      description,
      slots: orderedSlots,
      combinedProbability,
    };
  };

  return {
    balanced: buildPreset(
      'balanced',
      '균형 추천 포트폴리오',
      '안정 1 · 적정 1 · 소신 1',
      '가·나군에 적정 및 소신 목표 대학을 배치하고 다군(또는 나군)에 안정 지원 대학을 확보하는 표준 정시 전략입니다.',
      {
        가군: { buckets: ['target', 'reach', 'safety'], targetProb: 58 },
        나군: { buckets: ['reach', 'target', 'safety'], targetProb: 36 },
        다군: { buckets: ['safety', 'target', 'reach'], targetProb: 82 },
      }
    ),
    safe: buildPreset(
      'safe',
      '안정 우선 포트폴리오',
      '안정 2 · 적정 1',
      '정시 재수 위험을 최소화하기 위해 2개 모집군에서 안정권을 확보하고 1개 군에서 적정 대학을 노리는 전략입니다.',
      {
        가군: { buckets: ['safety', 'target', 'reach'], targetProb: 80 },
        나군: { buckets: ['target', 'safety', 'reach'], targetProb: 62 },
        다군: { buckets: ['safety', 'target', 'reach'], targetProb: 88 },
      }
    ),
    ambitious: buildPreset(
      'ambitious',
      '소신 도전 포트폴리오',
      '적정 1 · 소신 2',
      '상위권 선호 대학의 추가합격(충원율)과 반영비율 유불리를 적극 활용해 상향 돌파를 노리는 공격적 배치입니다.',
      {
        가군: { buckets: ['reach', 'target', 'challenge'], targetProb: 34 },
        나군: { buckets: ['reach', 'target', 'challenge'], targetProb: 28 },
        다군: { buckets: ['target', 'safety', 'reach'], targetProb: 68 },
      }
    ),
  };
}

/**
 * 핵심 정시 입시 분석 함수
 */
function analyzeAdmission({ score, major, categoryOverride = null, englishGrade = 1, subjects = null }) {
  const scoreNum = Math.round(Number(score));
  const normalizedMajor = normalizeToKorean(major);
  const category = getCategory(normalizedMajor, categoryOverride);
  const safeEnglishGrade = Math.min(5, Math.max(1, Number(englishGrade) || 1));
  const englishPenalty = ENGLISH_PENALTY_MAP[safeEnglishGrade] ?? 0;
  const effectiveScore = Number((scoreNum + englishPenalty).toFixed(1));
  const medicalRequested = isMedicalTrack(normalizedMajor);
  const subjectProfile = analyzeSubjectProfile(subjects);

  let level = '인서울 중위권';
  let percentileEstimate = '상위 12% 내외';
  if (effectiveScore >= 404) {
    level = '최상위권 (SKY·메디컬권)';
    percentileEstimate = '상위 0.8% 이내';
  } else if (effectiveScore >= 387) {
    level = '상위권 (서성한·주요 상위권)';
    percentileEstimate = '상위 3.0% 내외';
  } else if (effectiveScore >= 373) {
    level = '중상위권 (중경외시·건동홍 상단)';
    percentileEstimate = '상위 6.5% 내외';
  } else if (effectiveScore >= 357) {
    level = '인서울 주력권 (건동홍·국숭세단)';
    percentileEstimate = '상위 11.5% 내외';
  } else if (effectiveScore >= 340) {
    level = '인서울 및 수도권 적정권';
    percentileEstimate = '상위 18% 내외';
  } else {
    level = '수도권 소신·전략 지원권';
    percentileEstimate = '상위 25% 이하';
  }

  // 전체 21개 대학에 대해 희망 학과 매칭 + 대학별 영어 감점 + 과목 반영비율 유불리 + 추합 차수 시뮬레이션 평가
  const evaluated = universityData
    .filter((uni) => {
      if (category === '예체능' && (uni.departments.예체능 || []).length === 0) {
        return false;
      }
      return true;
    })
    .map((uni) => {
      const { department, isExactMatch, hasMedicalDept } = findMatchingDepartment(
        uni,
        normalizedMajor,
        category
      );

      const { cutoff, cutoffRange, deptAdjustment, deptTierLabel } = getAdjustedCutoffRange(
        uni,
        category,
        department,
        hasMedicalDept
      );

      const uniEnglishPenalty =
        uni.englishPenalties?.[safeEnglishGrade] ?? ENGLISH_PENALTY_MAP[safeEnglishGrade] ?? 0;
      const englishAdvantage = safeEnglishGrade >= 2 && Math.abs(uniEnglishPenalty) <= 1.2;

      const { weights, weightDelta, weightAdvantageLabel } = calcUniversityWeightAdvantage(
        uni,
        category,
        subjectProfile
      );

      const uniEffectiveScore = Number((scoreNum + uniEnglishPenalty + weightDelta).toFixed(1));
      const probability = calculateProbability(uniEffectiveScore, cutoffRange);
      const tier = classifySupportTier(probability);
      const scoreDelta = Number((uniEffectiveScore - cutoffRange.avg).toFixed(1));
      const waitlistWave = calcWaitlistWaveAnalysis(
        uniEffectiveScore,
        cutoffRange,
        uni.waitlistRatio || 75
      );

      return {
        id: uni.id,
        university: uni.university,
        shortName: uni.shortName,
        region: uni.region,
        group: uni.group,
        groups: uni.groups || String(uni.group || '').split('/'),
        competitionRate: uni.competitionRate || 5.0,
        waitlistRatio: uni.waitlistRatio || 75,
        weights,
        admissionType: uni.admissionType,
        englishRule: uni.englishRule,
        englishPenalties: uni.englishPenalties,
        englishPenalty: uniEnglishPenalty,
        englishAdvantage,
        weightDelta,
        weightAdvantageLabel,
        department,
        isExactMatch,
        hasMedicalDept,
        baseCutoff: uni.cutoff,
        cutoff,
        cutoffRange,
        deptAdjustment,
        deptTierLabel,
        probability,
        scoreDelta,
        effectiveScore: uniEffectiveScore,
        waitlistWave,
        bucket: tier.bucket,
        tierLabel: tier.tierLabel,
        tierShort: tier.tierShort,
        tierSummary: tier.summary,
        note: uni.note,
        source: uni.source,
        departments: uni.departments,
      };
    })
    .filter((item) => !(medicalRequested && !item.hasMedicalDept))
    .sort((a, b) => b.cutoff - a.cutoff);

  const safetyList = evaluated.filter((u) => u.bucket === 'safety');
  const targetList = evaluated.filter((u) => u.bucket === 'target');
  const reachList = evaluated.filter((u) => u.bucket === 'reach');
  const challengeList = evaluated.filter((u) => u.bucket === 'challenge');
  const supportableList = evaluated.filter((u) => u.bucket !== 'challenge');

  const pickClosest = (list, idealProb) => {
    if (list.length === 0) return null;
    return [...list].sort((a, b) => Math.abs(a.probability - idealProb) - Math.abs(b.probability - idealProb))[0];
  };

  const featured = {
    safety: pickClosest(safetyList, 82),
    target: pickClosest(targetList, 60),
    reach: pickClosest(reachList, 32),
  };

  const recommendedPortfolios = buildRecommendedPortfolios(evaluated);
  const strategyInsights = buildStrategyInsights(
    evaluated,
    scoreNum,
    category,
    safeEnglishGrade
  );

  const strategyPoints = [];
  if (targetList.length > 0 && safetyList.length > 0) {
    strategyPoints.push(
      `가·나·다군 3장 원서 중 1장은 안정권(${safetyList.slice(0, 2).map((u) => u.shortName).join('·')})으로 확보하고, 주력 군에서 적정권(${targetList.slice(0, 2).map((u) => u.shortName).join('·')})을 공략하는 포트폴리오가 유효합니다.`
    );
  } else if (reachList.length > 0 && targetList.length === 0 && safetyList.length === 0) {
    strategyPoints.push(
      '현재 점수대에서는 서울 주요 대학 대부분이 소신·도전 구간에 해당하므로, 다군 및 수도권 대학까지 범위를 넓혀 안정 카드를 반드시 확보하시기 바랍니다.'
    );
  } else if (safetyList.length >= 10) {
    strategyPoints.push(
      '다수 대학에서 안정 지원권이 확보되어 있으므로, 가·나군에서 상위권 대학 및 인기 학과로 적극적인 적정·소신 지원이 가능합니다.'
    );
  }

  if (safeEnglishGrade >= 2) {
    const lowPenaltyUnis = evaluated
      .filter((u) => u.englishAdvantage && u.bucket !== 'challenge')
      .slice(0, 3)
      .map((u) => u.shortName);
    const lowPenaltyText =
      lowPenaltyUnis.length > 0 ? ` (${lowPenaltyUnis.join('·')} 등 감점 최소)` : '';
    strategyPoints.push(
      `영어 ${safeEnglishGrade}등급 기준 대학별 실제 감점 폭 차이가 큽니다${lowPenaltyText}. 연세대·경희대 등 영어 감점 폭이 큰 대학보다 서강대·서울대·동국대·중앙대 등 등급 간 격차가 완만한 대학을 우선 검토하세요.`
    );
  } else {
    strategyPoints.push(
      '영어 1등급을 확보하여 연세대·한국외대·경희대 등 영어 등급 간 점수 차가 큰 대학 지원 시 상대적 우위를 점할 수 있습니다.'
    );
  }

  if (subjectProfile && subjectProfile.strengthType !== '균형형') {
    strategyPoints.push(`${subjectProfile.strengthType} 성적 구조: ${subjectProfile.summary}`);
  } else if (category === '자연') {
    strategyPoints.push(
      '자연계열은 수학 표준점수 반영 비중(37.5~45%)과 과학탐구 변환표준점수 및 가산점 여부가 당락에 큰 영향을 미칩니다.'
    );
  } else {
    strategyPoints.push(
      '인문계열은 국어·수학 반영 비율이 대학마다 상이(국어 강세 vs 수학 강세)하므로 본인 고득점 과목 비중이 높은 대학을 선택하면 환산점수가 상승합니다.'
    );
  }

  const meta = {
    score: scoreNum,
    effectiveScore,
    englishGrade: safeEnglishGrade,
    englishPenalty,
    major: normalizedMajor || major,
    category,
    level,
    percentileEstimate,
    subjectProfile,
    totalEvaluated: evaluated.length,
    supportableCount: supportableList.length,
    safetyCount: safetyList.length,
    targetCount: targetList.length,
    reachCount: reachList.length,
    challengeCount: challengeList.length,
    featured,
    recommendedPortfolios,
    strategyInsights,
    strategyPoints,
    dataSources: DATA_SOURCES,
    universities: evaluated,
  };

  const summaryLines = [
    `[UniPick 2025 정시 입시 분석 리포트]`,
    `- 기준 점수: 표준점수 합 ${scoreNum}점 (영어 ${safeEnglishGrade}등급 기준 평균 환산 ${effectiveScore}점)`,
    `- 희망 전공: ${meta.major} (${category}계열) · 위치: ${level} (${percentileEstimate})`,
    `- 지원 가능 대학: 총 ${supportableList.length}개교 (안정 ${safetyList.length} · 적정 ${targetList.length} · 소신 ${reachList.length})`,
  ];

  const medicalNotice = medicalRequested
    ? '의·치·한·약·수의학 계열은 대학 평균 합격선보다 훨씬 높은 최상위권 커트라인(400~422점)이 형성되므로 학과별 세분화 보정 합격선을 기준으로 산출되었습니다.'
    : null;

  return {
    meta,
    markdown: summaryLines.join('\n'),
    structured: {
      safety: safetyList,
      target: targetList,
      reach: reachList,
      challenge: challengeList,
    },
    allEvaluated: evaluated,
    guide: strategyPoints,
    medicalNotice,
  };
}

module.exports = {
  analyzeAdmission,
  normalizeToKorean,
  getCategory,
  isMedicalTrack,
  findMatchingDepartment,
  getAdjustedCutoffRange,
  analyzeSubjectProfile,
  calcWaitlistWaveAnalysis,
  buildStrategyInsights,
  calculateProbability,
  classifySupportTier,
  buildRecommendedPortfolios,
  VALID_CATEGORIES,
  ENGLISH_PENALTY_MAP,
};
