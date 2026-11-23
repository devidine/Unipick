const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 격리된 임시 DB 사용
const tmpDbPath = path.join(os.tmpdir(), `unipick-test-${Date.now()}.db`);
process.env.UNIPICK_DB_PATH = tmpDbPath;
process.env.JWT_SECRET = 'test_secret_key';

const { app } = require('../server');
const {
  getCategory,
  normalizeToKorean,
  calculateProbability,
  analyzeAdmission,
} = require('../services/analysis');

let serverInstance;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    serverInstance = app.listen(0, '127.0.0.1', () => {
      const addr = serverInstance.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => serverInstance.close(resolve));
  const { db } = require('../db');
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const file = tmpDbPath + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test('Analysis engine: category detection fixes English & uppercase abbreviations', () => {
  assert.equal(getCategory('Computer Science'), '자연');
  assert.equal(getCategory('AI융합학부'), '자연');
  assert.equal(getCategory('SW학과'), '자연');
  assert.equal(getCategory('IT공학과'), '자연');
  assert.equal(getCategory('Business Administration'), '인문');
  assert.equal(getCategory('Visual Design'), '예체능');
  assert.equal(getCategory('경영학과', '자연'), '자연');
  // 짧은 약어 치환이 일반 단어 내부를 오염시키지 않는지 검증
  assert.equal(normalizeToKorean('mail'), 'mail');
});

test('Analysis engine: probability is smooth, monotonic, and covers extreme scores', () => {
  const range = { min: 380, avg: 385, max: 392 };
  let prev = 0;
  for (let s = 340; s <= 430; s += 1) {
    const p = calculateProbability(s, range);
    assert.ok(p >= 5 && p <= 98, `prob out of bounds at ${s}: ${p}`);
    assert.ok(p >= prev, `non-monotonic at ${s}: ${p} < ${prev}`);
    assert.ok(p - prev <= 8, `jagged jump at ${s}: ${prev} -> ${p}`);
    prev = p;
  }

  // 최상위 점수(450점)도 빈 결과가 아닌 안정권 대학을 반환해야 함 (기존 버그 수정 회귀 테스트)
  const topRes = analyzeAdmission({ score: 450, major: '컴퓨터공학과' });
  assert.ok(topRes.structured.safety.length > 0, '450점 안정권 대학 누락');
  assert.equal(topRes.structured.safety[0].university, '서울대학교');

  // 낮은 점수(280점)도 allEvaluated로 투명한 거리 정보를 제공해야 함
  const lowRes = analyzeAdmission({ score: 280, major: '경영학과' });
  assert.equal(lowRes.allEvaluated.length, 21);

  // 의약학 계열 안내 문구 확인
  const medRes = analyzeAdmission({ score: 405, major: '의예과' });
  assert.ok(medRes.medicalNotice, '의예과 주의 문구 누락');

  // 영어 등급 감점 반영 확인
  const eng1 = analyzeAdmission({ score: 385, major: '컴퓨터공학과', englishGrade: 1 });
  const eng3 = analyzeAdmission({ score: 385, major: '컴퓨터공학과', englishGrade: 3 });
  assert.ok(eng3.meta.effectiveScore < eng1.meta.effectiveScore);
});

test('Analysis engine: department cutoff differentiation, university English penalties, subject weights & 3-slot portfolios', () => {
  // 1) 동일 대학 내 의예과 vs 일반학과 세분화 합격선 보정 검증
  const medAnalysis = analyzeAdmission({ score: 390, major: '의예과' });
  const bizAnalysis = analyzeAdmission({ score: 390, major: '경영학과' });
  const khuMed = medAnalysis.meta.universities.find((u) => u.id === 'khu');
  const khuBiz = bizAnalysis.meta.universities.find((u) => u.id === 'khu');
  assert.ok(khuMed && khuBiz);
  assert.ok(
    khuMed.cutoff >= khuBiz.cutoff + 20,
    `경희대 의예과(${khuMed.cutoff})는 경영학과(${khuBiz.cutoff})보다 최소 20점 이상 높아야 함`
  );

  // 2) 대학별 실제 영어 등급 감점 차등 적용 검증 (서강대 vs 연세대 영어 2등급)
  const eng2Res = analyzeAdmission({ score: 392, major: '경영학과', englishGrade: 2 });
  const sogang = eng2Res.meta.universities.find((u) => u.id === 'sogang');
  const yonsei = eng2Res.meta.universities.find((u) => u.id === 'yonsei');
  assert.equal(sogang.englishPenalty, -0.5);
  assert.equal(sogang.englishAdvantage, true);
  assert.equal(yonsei.englishPenalty, -3.5);
  assert.equal(yonsei.englishAdvantage, false);

  // 3) 과목별 강점 진단 및 대학별 반영비율 유불리 검증 (수학 고득점자)
  const mathStrongRes = analyzeAdmission({
    score: 386,
    major: '경영학과',
    subjects: { kor: 120, math: 146, sub1: 60, sub2: 60 },
  });
  assert.equal(mathStrongRes.meta.subjectProfile.strengthType, '수학 강점형');
  const sogangMath = mathStrongRes.meta.universities.find((u) => u.id === 'sogang');
  assert.ok(sogangMath.weightDelta > 0, `수학 비중 43.3%인 서강대에서 양(+)의 유불리 점수가 산출되어야 함: ${sogangMath.weightDelta}`);

  // 4) 가·나·다군 3장 최적 원서 조합(recommendedPortfolios) 중복 방지 및 합격 기대율 검증
  const bal = mathStrongRes.meta.recommendedPortfolios.balanced;
  assert.ok(bal);
  assert.ok(bal.slots.가군 && bal.slots.나군 && bal.slots.다군);
  const slotIds = new Set([bal.slots.가군.id, bal.slots.나군.id, bal.slots.다군.id]);
  assert.equal(slotIds.size, 3, '가·나·다군 추천 포트폴리오는 서로 다른 3개 대학이어야 함');
  assert.ok(bal.combinedProbability >= 50 && bal.combinedProbability <= 99);

  // 5) 정시 전략 연구소(strategyInsights: 학과 피벗 스캐너 & 추합 차수 시뮬레이터) 검증
  const pivotTest = analyzeAdmission({ score: 386, major: '반도체공학과', englishGrade: 2 });
  assert.ok(pivotTest.meta.strategyInsights, 'strategyInsights 누락');
  assert.ok(
    pivotTest.meta.strategyInsights.departmentPivots.length > 0,
    '반도체공학과 대비 동일 대학 내 피벗 전략 학과가 탐색되어야 함'
  );
  const firstPivot = pivotTest.meta.strategyInsights.departmentPivots[0];
  assert.ok(firstPivot.toProbability > firstPivot.fromProbability);
  assert.ok(firstPivot.cutoffSaved >= 1);

  const cauItem = pivotTest.meta.universities.find((u) => u.id === 'cau');
  assert.ok(cauItem.waitlistWave);
  assert.ok(cauItem.waitlistWave.initialCutoff > cauItem.waitlistWave.finalCutoff);
  assert.equal(cauItem.waitlistWave.waitlistRatio, 165);
});

test('API: health & universities endpoints', async () => {
  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthRes.status, 200);
  const health = await healthRes.json();
  assert.equal(health.success, true);
  assert.equal(health.universities, 21);

  const uniRes = await fetch(`${baseUrl}/api/universities?q=서울대`);
  assert.equal(uniRes.status, 200);
  const uniData = await uniRes.json();
  assert.equal(uniData.universities.length, 1);
  assert.equal(uniData.universities[0].university, '서울대학교');
});

test('API: guest consult works without login & validates inputs strictly', async () => {
  // 비로그인 즉시 분석 가능
  const res = await fetch(`${baseUrl}/api/consult`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score: 382, major: '컴퓨터공학과', englishGrade: 2 }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.saved, false);
  assert.equal(data.meta.category, '자연');
  assert.equal(data.meta.englishGrade, 2);
  assert.ok(data.allEvaluated.length > 0);
  assert.ok(data.guide.length > 0);

  // 잘못된 입력값 검증
  const bad1 = await fetch(`${baseUrl}/api/consult`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score: '370abc', major: '경영학과' }),
  });
  assert.equal(bad1.status, 400);

  const bad2 = await fetch(`${baseUrl}/api/consult`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score: 150, major: '경영학과' }),
  });
  assert.equal(bad2.status, 400);
});

test('API: full auth, profile PUT, consultation save/list/detail/delete flow', async () => {
  // 회원가입
  const regRes = await fetch(`${baseUrl}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'student_01', password: 'password123', displayName: '김수험' }),
  });
  assert.equal(regRes.status, 201);
  const regData = await regRes.json();
  assert.equal(regData.success, true);
  assert.equal(regData.user.displayName, '김수험');
  const token = regData.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // /api/me 일관된 displayName 반환 검증 (기존 버그 회귀 테스트)
  const meRes = await fetch(`${baseUrl}/api/me`, { headers: authHeaders });
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  assert.equal(meData.user.displayName, '김수험');

  // PUT /api/profile 확장 프로필(아바타·상태메시지·목표대학·목표학과·목표점수·주력계열) 검증
  const profRes = await fetch(`${baseUrl}/api/profile`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      displayName: '김합격',
      avatar: 'emerald',
      statusMessage: '2026 정시 연세대 합격 목표!',
      targetScore: 398,
      targetMajor: '인공지능학과',
      targetUniversity: '연세대학교',
      examTrack: '자연',
    }),
  });
  assert.equal(profRes.status, 200);
  const profData = await profRes.json();
  assert.equal(profData.user.displayName, '김합격');
  assert.equal(profData.user.avatar, 'emerald');
  assert.equal(profData.user.statusMessage, '2026 정시 연세대 합격 목표!');
  assert.equal(profData.user.targetScore, 398);
  assert.equal(profData.user.targetMajor, '인공지능학과');
  assert.equal(profData.user.targetUniversity, '연세대학교');
  assert.equal(profData.user.examTrack, '자연');

  // PUT /api/password 비밀번호 변경 검증
  const pwFail = await fetch(`${baseUrl}/api/password`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ currentPassword: 'wrong_password', newPassword: 'newpassword123' }),
  });
  assert.equal(pwFail.status, 401);

  const pwOk = await fetch(`${baseUrl}/api/password`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ currentPassword: 'password123', newPassword: 'newpassword123' }),
  });
  assert.equal(pwOk.status, 200);

  // POST /api/demo-login 원클릭 체험 계정 로그인 검증
  const demoRes = await fetch(`${baseUrl}/api/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(demoRes.status, 200);
  const demoData = await demoRes.json();
  assert.equal(demoData.success, true);
  assert.equal(demoData.user.username, 'demo_student');
  assert.ok(demoData.token);

  // 로그인 상태 분석 저장
  const consultRes = await fetch(`${baseUrl}/api/consult`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ score: 378, major: '경영학과', englishGrade: 1 }),
  });
  assert.equal(consultRes.status, 200);
  const consultData = await consultRes.json();
  assert.equal(consultData.saved, true);
  assert.ok(consultData.consultationId > 0);

  // 시뮬레이션 모드(save: false)는 DB에 중복 저장하지 않음
  const simRes = await fetch(`${baseUrl}/api/consult`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ score: 383, major: '경영학과', save: false }),
  });
  assert.equal(simRes.status, 200);
  const simData = await simRes.json();
  assert.equal(simData.saved, false);

  // 내역 목록 확인 (1건만 저장되어야 함)
  const listRes = await fetch(`${baseUrl}/api/consultations`, { headers: authHeaders });
  const listData = await listRes.json();
  assert.equal(listData.consultations.length, 1);

  // 내역 상세 조회 (구조화 분석 데이터 포함)
  const detailRes = await fetch(`${baseUrl}/api/consultations/${consultData.consultationId}`, {
    headers: authHeaders,
  });
  const detailData = await detailRes.json();
  assert.equal(detailData.success, true);
  assert.ok(detailData.consultation.analysis.structured);

  // 삭제 검증
  const delRes = await fetch(`${baseUrl}/api/consultations/${consultData.consultationId}`, {
    method: 'DELETE',
    headers: authHeaders,
  });
  assert.equal(delRes.status, 200);

  const listAfter = await (await fetch(`${baseUrl}/api/consultations`, { headers: authHeaders })).json();
  assert.equal(listAfter.consultations.length, 0);

  // 관심 대학 북마크 저장 / 조회 / 삭제 검증
  const bmCreate = await fetch(`${baseUrl}/api/bookmarks`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ universityId: 'snu', department: '컴퓨터공학부' }),
  });
  assert.equal(bmCreate.status, 201);

  const bmInvalid = await fetch(`${baseUrl}/api/bookmarks`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ universityId: 'nonexistent_uni' }),
  });
  assert.equal(bmInvalid.status, 404);

  const bmList = await (await fetch(`${baseUrl}/api/bookmarks`, { headers: authHeaders })).json();
  assert.equal(bmList.success, true);
  assert.equal(bmList.bookmarks.length, 1);
  assert.equal(bmList.bookmarks[0].universityId, 'snu');
  assert.equal(bmList.bookmarks[0].department, '컴퓨터공학부');

  const bmDel = await fetch(`${baseUrl}/api/bookmarks/snu`, {
    method: 'DELETE',
    headers: authHeaders,
  });
  assert.equal(bmDel.status, 200);

  const bmAfter = await (await fetch(`${baseUrl}/api/bookmarks`, { headers: authHeaders })).json();
  assert.equal(bmAfter.bookmarks.length, 0);
});
