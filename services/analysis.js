// services/analysis.js — UniPick 정시 입시 분석 엔진
const { universityData, DATA_SOURCES } = require('../data/universities');

const ENGLISH_TO_KOREAN = {
  computer: '컴퓨터',
  software: '소프트웨어',
  engineering: '공학',
  science: '과학',
  business: '경영',
  economics: '경제',
  management: '경영',
  finance: '금융',
  accounting: '세무',
  design: '디자인',
  architecture: '건축',
  electrical: '전기',
  electronic: '전자',
  mechanical: '기계',
  chemical: '화학',
  biology: '생물',
  physics: '물리',
  mathematics: '수학',
  math: '수학',
  psychology: '심리',
  media: '미디어',
  communication: '커뮤니케이션',
  journalism: '언론',
  law: '법학',
  education: '교육',
  music: '음악',
  art: '미술',
  film: '영화',
  data: '데이터',
  robot: '로봇',
  pharmacy: '약학',
  medicine: '의예',
  medical: '의예',
  nursing: '간호',
  statistics: '통계',
  sociology: '사회',
  politics: '정치',
  international: '국제',
  english: '영어',
  korean: '국어',
  history: '역사',
  philosophy: '철학',
  material: '신소재',
  environment: '환경',
  civil: '토목',
  game: '게임',
  animation: '애니메이션',
  fashion: '패션',
  automotive: '자동차',
  aerospace: '항공',
  biotech: '바이오',
  bio: '바이오',
  veterinary: '수의',
  dental: '치의',
  oriental: '한의',
  information: '정보',
  semiconductor: '반도체',
};

const SHORT_ABBR_TO_KOREAN = {
  cs: '컴퓨터과학',
  sw: '소프트웨어',
  ai: '인공지능',
  it: '정보통신',
  ict: '정보통신',
  ux: '디자인',
  ui: '디자인',
};

const ARTS_KEYWORDS = [
  '디자인', '미술', '음악', '연극', '영화', '애니메이션', '만화', '게임',
  '조형', '회화', '패션', '의상', '시각', '산업디자인', '영상', '무용', '아트',
];

const STEM_KEYWORDS = [
  '컴퓨터', '소프트웨어', 'sw', 'ai', '인공지능', '전자', '전기', '기계',
  '화학', '화공', '생물', '생명', '물리', '수학', '수리', '공학', '정보통신',
  '데이터', '건축', '토목', '환경', '신소재', '재료', '반도체', '로봇',
  '자동차', '항공', '약학', '의예', '의학', '치의', '한의', '수의', '바이오',
  'it', 'ict', '통계', '과학', '시스템', '지능',
];

const MEDICAL_KEYWORDS = ['의예', '의학', '의과', '치의', '한의', '약학', '수의'];

const VALID_CATEGORIES = ['인문', '자연', '예체능'];

const ENGLISH_PENALTY_MAP = {
  1: { penalty: 0, label: '1등급 (감점 없음)' },
  2: { penalty: -1.5, label: '2등급 (평균 -1.5점 반영)' },
  3: { penalty: -4.0, label: '3등급 (평균 -4.0점 반영)' },
  4: { penalty: -8.0, label: '4등급 (평균 -8.0점 반영)' },
  5: { penalty: -13.0, label: '5등급 이하 (평균 -13.0점 반영)' },
};

function normalizeToKorean(input) {
  let result = String(input || '').trim();
  for (const [abbr, kor] of Object.entries(SHORT_ABBR_TO_KOREAN)) {
    const regex = new RegExp(`(?<![a-zA-Z])${abbr}(?![a-zA-Z])`, 'gi');
    result = result.replace(regex, kor);
  }
  for (const [eng, kor] of Object.entries(ENGLISH_TO_KOREAN)) {
    const regex = new RegExp(eng, 'gi');
    result = result.replace(regex, kor);
  }
  return result;
}

function getCategory(major, categoryOverride = null) {
  if (categoryOverride && VALID_CATEGORIES.includes(categoryOverride)) {
    return categoryOverride;
  }
  const normalized = normalizeToKorean(major).toLowerCase();
  if (ARTS_KEYWORDS.some((k) => normalized.includes(k))) return '예체능';
  if (STEM_KEYWORDS.some((k) => normalized.includes(k))) return '자연';
  return '인문';
}

function isMedicalTrack(major) {
  const normalized = normalizeToKorean(major).toLowerCase();
  return MEDICAL_KEYWORDS.some((k) => normalized.includes(k));
}

function findMatchingDepartment(deptList, major) {
  if (!deptList || deptList.length === 0) return null;
  const normalizedMajor = normalizeToKorean(major);
  const majorClean = normalizedMajor.replace(/학과|학부|전공|대학/g, '').trim();

  if (majorClean.length > 0) {
    const exact = deptList.find((d) => {
      const dClean = d.replace(/학과|학부|전공|대학/g, '').trim();
      return (
        d.includes(normalizedMajor) ||
        d.includes(majorClean) ||
        (dClean.length >= 2 && normalizedMajor.includes(dClean))
      );
    });
    if (exact) return { department: exact, exactMatch: true };
  }

  const keywords = majorClean.match(/[\uAC00-\uD7AF]+|[a-zA-Z]+/g) || [majorClean];
  let best = null;
  let bestScore = 0;

  for (const dept of deptList) {
    const deptClean = dept.replace(/학과|학부|전공|대학|·|&/g, '');
    let score = 0;
    for (const kw of keywords) {
      if (kw.length >= 2 && deptClean.includes(kw)) {
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = dept;
    }
  }

  if (best) return { department: best, exactMatch: true };
  return { department: deptList[0], exactMatch: false };
}

function getEnglishAdjustment(englishGrade) {
  const g = Number(englishGrade);
  if (!Number.isInteger(g) || g <= 1) return { grade: 1, ...ENGLISH_PENALTY_MAP[1] };
  if (g >= 5) return { grade: 5, ...ENGLISH_PENALTY_MAP[5] };
  return { grade: g, ...ENGLISH_PENALTY_MAP[g] };
}

function calculateProbability(effectiveScore, cutoffRange) {
  const diff = cutoffRange.avg - effectiveScore; // 양수: 커트라인보다 부족, 음수: 여유
  const spread = Math.max(4, (cutoffRange.max - cutoffRange.min) / 2);
  const k = Math.max(5.5, spread * 0.95);
  // 평균 커트라인과 동점일 때 추가합격(충원) 포함 약 56~58% 수준이 되도록 연속 로지스틱 곡선 적용
  const raw = 100 / (1 + Math.exp((diff - 1.4) / k));
  return Math.max(5, Math.min(98, Math.round(raw)));
}

function classifyByProbability(probability) {
  if (probability >= 75) return 'safety';
  if (probability >= 45) return 'target';
  if (probability >= 15) return 'reach';
  return 'challenge';
}

function getScoreAssessment(scoreNum) {
  if (scoreNum >= 400) {
    return {
      level: '최상위권',
      percentileRange: '상위 0.5% ~ 1.5% 이내',
      desc: '서울 최상위권 대학(SKY) 주요 학과 지원이 가능한 점수대입니다. 대학별 변환표준점수와 영어 감점 방식의 미세한 차이를 정밀하게 비교해야 합니다.',
    };
  }
  if (scoreNum >= 385) {
    return {
      level: '상위권',
      percentileRange: '상위 1.5% ~ 4% 이내',
      desc: '서강·성균관·한양대 중심의 적정 지원과 함께 SKY 일부 학과 상향 지원을 병행할 수 있는 점수대입니다.',
    };
  }
  if (scoreNum >= 370) {
    return {
      level: '중상위권',
      percentileRange: '상위 4% ~ 8% 이내',
      desc: '중앙·경희·시립·외대 주요 학과에 안정~적정 지원이 가능하며, 가·나·다군 조합에 따라 상위권 대학 소신 지원도 노려볼 수 있습니다.',
    };
  }
  if (scoreNum >= 350) {
    return {
      level: '중위권',
      percentileRange: '상위 8% ~ 15% 이내',
      desc: '건국·동국·홍익·숙명여대 등 서울 주요 중위권 대학에 경쟁력이 있으며, 영역별 반영비율 유불리에 따라 체감 합격선이 크게 달라집니다.',
    };
  }
  if (scoreNum >= 330) {
    return {
      level: '중하위권',
      percentileRange: '상위 15% ~ 25% 이내',
      desc: '서울권 주요 대학의 특성화·중하위권 학과를 중심으로 상향·적정·안정 3장의 포트폴리오를 균형 있게 설계해야 하는 구간입니다.',
    };
  }
  return {
    level: '서울권 하단 · 확장 권장',
    percentileRange: '상위 25% 이하 추정',
    desc: '서울권 일부 학과에 상향 도전할 수 있으며, 경기·인천 등 수도권 주요 대학과 지방 거점 국립대로 지원 범위를 함께 넓히는 전략을 권장합니다.',
  };
}

function generateRecommendations(scoreNum, major, options = {}) {
  const { categoryOverride = null, englishGrade = 1 } = options;
  const category = getCategory(major, categoryOverride);
  const english = getEnglishAdjustment(englishGrade);
  const effectiveScore = Number((scoreNum + english.penalty).toFixed(1));

  const reach = [];
  const target = [];
  const safety = [];
  const challenge = [];
  const allEvaluated = [];

  for (const uni of universityData) {
    const deptList = uni.departments[category];
    const match = findMatchingDepartment(deptList, major);
    if (!match) continue;

    const probability = calculateProbability(effectiveScore, uni.cutoffRange);
    const bucket = classifyByProbability(probability);
    const scoreDelta = Number((effectiveScore - uni.cutoff).toFixed(1)); // 양수: 여유, 음수: 부족
    const deltaSign = scoreDelta > 0 ? '+' : '';
    const basisSummary = `${uni.year}학년도 정시 평균 ${uni.cutoff}점(범위 ${uni.cutoffRange.min}–${uni.cutoffRange.max}점) 대비 ${deltaSign}${scoreDelta}점`;

    const entry = {
      id: uni.id,
      university: uni.university,
      shortName: uni.shortName,
      department: match.department,
      exactMatch: match.exactMatch,
      departments: uni.departments,
      cutoff: uni.cutoff,
      cutoffRange: uni.cutoffRange,
      diff: Number((uni.cutoff - effectiveScore).toFixed(1)),
      scoreDelta,
      probability,
      bucket,
      basisSummary,
      tier: uni.tier,
      group: uni.group,
      englishRule: uni.englishRule,
      note: uni.note,
      source: uni.source,
      year: uni.year,
      admissionType: uni.admissionType,
    };

    allEvaluated.push(entry);

    if (bucket === 'reach') reach.push(entry);
    else if (bucket === 'target') target.push(entry);
    else if (bucket === 'safety') safety.push(entry);
    else challenge.push(entry);
  }

  reach.sort((a, b) => b.probability - a.probability || a.tier - b.tier);
  target.sort((a, b) => a.tier - b.tier || Math.abs(60 - a.probability) - Math.abs(60 - b.probability));
  safety.sort((a, b) => a.tier - b.tier || b.probability - a.probability);
  challenge.sort((a, b) => b.probability - a.probability || b.tier - a.tier);
  allEvaluated.sort((a, b) => b.cutoff - a.cutoff || a.tier - b.tier);

  return {
    category,
    english,
    effectiveScore,
    reach: reach.slice(0, 4),
    target: target.slice(0, 4),
    safety: safety.slice(0, 4),
    challenge: challenge.slice(0, 3),
    counts: {
      reach: reach.length,
      target: target.length,
      safety: safety.length,
      challenge: challenge.length,
      total: allEvaluated.length,
    },
    allEvaluated,
  };
}

function generateStrategyTips(category, scoreNum, englishGrade = 1) {
  const tips = [];

  if (category === '자연') {
    tips.push({
      tag: '계열 전략',
      title: '수학 반영 비중과 탐구 변환표준점수 확인',
      body: '자연계열은 대학별로 수학 반영 비율(30~40%)과 과학탐구 가산점 여부가 크게 다릅니다. 수학 표준점수가 강점이라면 수학 비중이 높은 대학을 우선 검토하세요.',
    });
    tips.push({
      tag: '교차지원',
      title: '선택과목 제한 및 가산점 폐지 여부 점검',
      body: '최근 다수 대학이 미적분·기하 및 과탐 필수 지정을 완화했으나, 여전히 가산점을 부여하는 대학이 많으므로 본인 선택과목에 따른 유불리를 환산 점수로 비교해야 합니다.',
    });
  } else if (category === '인문') {
    tips.push({
      tag: '계열 전략',
      title: '국어·수학 반영비율에 따른 대학별 유불리 비교',
      body: '인문계열은 국어 비중이 높은 대학과 수학 비중이 높은 대학으로 나뉩니다. 표준점수 합이 동일해도 강점 과목에 따라 대학별 환산 점수 순위가 달라집니다.',
    });
    tips.push({
      tag: '교차지원',
      title: '자연계열 수험생 교차지원 변수 고려',
      body: '상위권 대학 인문계열(경영·경제 등)은 자연계열 수험생의 교차지원 비율이 높습니다. 전년도 최종 등록자 70% 컷과 충원율을 함께 확인하세요.',
    });
  } else {
    tips.push({
      tag: '전형 구조',
      title: '수능 반영 비율과 실기·서류 비중 구분',
      body: '예체능 계열은 비실기 전형(수능+서류)과 실기 위주 전형의 합격선 차이가 큽니다. 수능 성적이 강점이라면 수능 비중이 높은 모집단위를 우선 검토하세요.',
    });
  }

  if (englishGrade >= 2) {
    tips.push({
      tag: '영어 반영',
      title: `영어 ${englishGrade}등급 감점 폭이 작은 대학 우선 탐색`,
      body: '서울대·서강대·동국대·중앙대 등은 1~2등급 간 격차가 상대적으로 작은 편인 반면, 연세대·경희대 등은 등급 차가 큽니다. 영어 반영 방식을 반드시 확인하세요.',
    });
  }

  if (scoreNum >= 385) {
    tips.push({
      tag: '군별 배치',
      title: '초박빙 구간, 0.5점 단위 환산점수 시뮬레이션 필수',
      body: '상위권 구간은 동점자가 밀집해 있어 탐구 백분위 기반 변환표준점수가 당락을 좌우합니다. 가·나군 중 한 곳은 적정 이상으로 확보해 리스크를 통제하세요.',
    });
  } else if (scoreNum >= 350) {
    tips.push({
      tag: '군별 배치',
      title: '다군 추가합격 회전율 활용 전략',
      body: '중앙대·건국대·홍익대 등 다군 주요 모집단위는 중복합격 이탈로 충원율이 높습니다. 가·나군에서 안정/적정을 확보하고 다군을 전략 카드로 활용하세요.',
    });
  } else {
    tips.push({
      tag: '포트폴리오',
      title: '상향 1 · 적정 1 · 안정 1 균형 조합 권장',
      body: '정시 3장의 원서를 모두 상향으로 배치하면 위험도가 급증합니다. 안정권 1개 이상을 확보한 뒤 수도권·거점 국립대까지 함께 비교하세요.',
    });
  }

  return tips;
}

function generateAdmissionsGuide(category, scoreNum) {
  return [
    {
      id: 'weights',
      title: '대학별 수능 반영비율은 어떻게 다른가요?',
      summary: `${category}계열 기준 강점 과목에 따라 환산점수 격차가 크게 발생합니다.`,
      content:
        category === '자연'
          ? '자연계열은 대체로 수학(30~40%)과 탐구(25~35%) 비중이 높습니다. 서울대·서강대·성균관대는 수학 영향력이 큰 편이며, 고려대·한양대는 비교적 균형 잡힌 반영 구조를 보입니다.'
          : category === '인문'
            ? '인문계열은 국어(30~35%) 비중이 큰 대학과 수학(30% 내외) 비중이 큰 대학으로 구분됩니다. 수학 표준점수가 높다면 서강대·성균관대 등 수학 가중치가 높은 대학이 유리합니다.'
            : '예체능 계열은 국어·영어 중심 2~3개 영역만 반영하는 대학이 많습니다. 실기 반영 비율(30~70%)에 따라 수능 영향력이 크게 달라지므로 모집요강을 반드시 확인하세요.',
    },
    {
      id: 'english',
      title: '영어 절대평가 등급은 합격선에 얼마나 영향을 미치나요?',
      summary: '감점제 vs 반영비율 포함 여부에 따라 2등급 기준 0.5점~5점 이상 차이납니다.',
      content:
        '서울대(2등급 -0.5점), 서강대(1등급 100/2등급 99), 동국대(2등급 -1점)는 2등급 불이익이 작습니다. 반면 연세대·경희대·한국외대 등은 등급 간 점수 차가 크므로, 영어 2등급 이하라면 감점 폭이 작은 대학을 우선 검토하는 것이 유리합니다.',
    },
    {
      id: 'groups',
      title: '가·나·다군 3장 원서 조합은 어떻게 구성해야 하나요?',
      summary: '합격 확률 75% 이상 안정 1곳 확보 후 적정·상향을 조합하는 것이 기본 원칙입니다.',
      content:
        '정시는 가·나·다군 각 1회씩 총 3회 지원할 수 있습니다. 가장 일반적인 안정적 포트폴리오는 [안정 1 + 적정 1 + 상향 1] 조합입니다. 특히 다군은 모집 대학 수가 적어 경쟁률과 추가합격 충원율이 모두 높게 형성되는 특성이 있습니다.',
    },
    {
      id: 'tuition',
      title: '국공립대 등록금 및 성적 우수 장학금 기준이 궁금해요',
      summary: '서울시립대·서울과기대는 국공립 등록금 혜택을 제공합니다.',
      content: `서울 소재 국공립대(서울시립대, 서울과학기술대)는 사립대 대비 등록금 부담이 크게 낮습니다. 또한 현재 입력하신 ${scoreNum}점대 기준으로 안정권에 해당하는 대학 중 일부는 입학 성적 우수 장학금(최초합격 상위 %) 대상이 될 수 있습니다.`,
    },
    {
      id: 'susi-jeongsi',
      title: '이 분석 결과는 수시 전형에도 적용할 수 있나요?',
      summary: '본 분석은 정시(수능 표준점수) 기준이며, 수시 지원 시 수능 최저 확인용으로 참고하세요.',
      content:
        '수시는 학생부교과·학생부종합·논술 전형으로 나뉘며 내신과 서류가 핵심입니다. 다만 정시로 진학 가능한 대학 라인을 먼저 파악해 두면 수시 6장 원서의 상향·적정 기준선(수시 납치 방지)을 설정하는 데 매우 유용합니다.',
    },
  ];
}

function buildSummaryMarkdown({ scoreNum, major, category, assessment, recs, tips }) {
  let md = `## UniPick 성적 분석 결과\n\n`;
  md += `**입력 성적:** 표준점수 합 **${scoreNum}점** | **희망 학과:** ${major} (${category}계열)\n\n`;
  md += `**${assessment.level}** — ${assessment.desc}\n\n---\n\n`;

  const addSection = (title, entries) => {
    md += `#### ${title}\n`;
    if (entries.length > 0) {
      entries.forEach((r) => {
        md += `- **${r.university}** ${r.department} — 합격 확률 약 ${r.probability}% (기준 커트라인 ${r.cutoff}점)\n`;
      });
    } else {
      md += `- 해당 구간에 추천 대학이 없습니다.\n`;
    }
    md += `\n`;
  };

  addSection('상향 지원 (Reach)', recs.reach);
  addSection('적정 지원 (Target)', recs.target);
  addSection('안정 지원 (Safety)', recs.safety);

  md += `---\n\n### 전략 요약\n\n`;
  tips.forEach((t) => {
    md += `- **${t.title}**: ${t.body}\n`;
  });
  return md;
}

function analyzeAdmission({ score, major, categoryOverride = null, englishGrade = 1 }) {
  const scoreNum = Number(score);
  const cleanMajor = String(major || '').trim();
  const assessment = getScoreAssessment(scoreNum);
  const recs = generateRecommendations(scoreNum, cleanMajor, { categoryOverride, englishGrade });
  const tips = generateStrategyTips(recs.category, scoreNum, recs.english.grade);
  const guide = generateAdmissionsGuide(recs.category, scoreNum);
  const medicalNotice = isMedicalTrack(cleanMajor)
    ? '의예·치의예·한의예·약학·수의예 계열은 대학 전체 평균 커트라인과 별도의 최상위 커트라인(표준점수 합 405~425점 이상)이 적용됩니다. 본 결과는 해당 대학 일반 자연계열 기준 참고치이므로 의약학 전문 배치표를 함께 확인하세요.'
    : null;

  const meta = {
    score: scoreNum,
    effectiveScore: recs.effectiveScore,
    englishGrade: recs.english.grade,
    englishPenalty: recs.english.penalty,
    major: cleanMajor,
    category: recs.category,
    level: assessment.level,
    percentileRange: assessment.percentileRange,
    reachCount: recs.counts.reach,
    targetCount: recs.counts.target,
    safetyCount: recs.counts.safety,
    totalCount: recs.counts.total,
  };

  const markdown = buildSummaryMarkdown({
    scoreNum,
    major: cleanMajor,
    category: recs.category,
    assessment,
    recs,
    tips,
  });

  return {
    meta,
    assessment,
    medicalNotice,
    structured: {
      reach: recs.reach,
      target: recs.target,
      safety: recs.safety,
      challenge: recs.challenge,
    },
    allEvaluated: recs.allEvaluated,
    tips,
    guide,
    markdown,
    dataSources: DATA_SOURCES,
  };
}

module.exports = {
  normalizeToKorean,
  getCategory,
  isMedicalTrack,
  findMatchingDepartment,
  calculateProbability,
  classifyByProbability,
  getScoreAssessment,
  generateRecommendations,
  generateStrategyTips,
  generateAdmissionsGuide,
  analyzeAdmission,
  VALID_CATEGORIES,
};
