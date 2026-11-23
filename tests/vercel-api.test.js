const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../api/index');

let srv;
let url;

test.before(async () => {
  await new Promise((resolve) => {
    srv = app.listen(0, '127.0.0.1', () => {
      url = `http://127.0.0.1:${srv.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => srv.close(resolve));
});

test('Vercel serverless api/index.js serves health, universities, and consult', async () => {
  const health = await (await fetch(`${url}/api/health`)).json();
  assert.equal(health.success, true);
  assert.equal(health.universities, 21);

  const unis = await (await fetch(`${url}/api/universities`)).json();
  assert.equal(unis.success, true);
  assert.equal(unis.universities.length, 21);

  const consult = await (
    await fetch(`${url}/api/consult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: 382, major: '컴퓨터공학과', englishGrade: 1 }),
    })
  ).json();
  assert.equal(consult.success, true);
  assert.equal(consult.meta.category, '자연');
  assert.equal(consult.allEvaluated.length, 21);
});
