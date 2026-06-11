'use strict';

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { createApp } = require('../src/app');
const { waitForDb, close } = require('../src/db');
const store = require('../src/data/store');

const app = createApp();

async function tokenOf(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.data.token;
}

before(async () => {
  await waitForDb();
});

beforeEach(async () => {
  await store.seed();
});

after(async () => {
  await close();
});

/* =========================================================
   预案管理测试
   ========================================================= */

test('获取工程的平战转换预案（种子数据已存在）', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .get('/api/projects/1/plan')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.plan);
  assert.strictEqual(res.body.data.plan.name, '中心广场工程平战转换预案');
  assert.strictEqual(res.body.data.latestVersion.version, 1);
  assert.strictEqual(res.body.data.tasks.length, 7);
});

test('未登录访问预案返回 401', async () => {
  const res = await request(app).get('/api/projects/1/plan');
  assert.strictEqual(res.status, 401);
});

test('为尚无预案的工程创建预案', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .post('/api/projects/2/plan')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '滨江路工程平战转换预案', description: '测试预案' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.projectId, 2);
  assert.strictEqual(res.body.data.name, '滨江路工程平战转换预案');
});

test('工程已有预案时创建返回 409', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .post('/api/projects/1/plan')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '重复预案' });
  assert.strictEqual(res.status, 409);
});

test('巡检员创建预案被拒 403', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app)
    .post('/api/projects/2/plan')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '测试' });
  assert.strictEqual(res.status, 403);
});

test('更新预案信息', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .put('/api/plans/1')
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'ACTIVE', description: '更新后的描述' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.status, 'ACTIVE');
  assert.strictEqual(res.body.data.description, '更新后的描述');
});

test('查询预案版本历史', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .get('/api/plans/1/versions')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 1);
  assert.strictEqual(res.body.data[0].version, 1);
});

test('发布新版本', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .post('/api/plans/1/versions')
    .set('Authorization', `Bearer ${token}`)
    .send({ changeSummary: '优化作业时限' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.version, 2);
  assert.strictEqual(res.body.data.changeSummary, '优化作业时限');
});

test('获取版本完整结构（含作业、依赖、设备）', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .get('/api/plan-versions/1')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.plan);
  assert.ok(res.body.data.version);
  assert.strictEqual(res.body.data.tasks.length, 7);
  assert.ok(res.body.data.tasks[0].prerequisiteTaskIds);
  assert.ok(res.body.data.tasks[0].equipments);
});

/* =========================================================
   作业项管理测试
   ========================================================= */

test('获取版本的作业项列表', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .get('/api/plan-versions/1/tasks')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 7);
  assert.strictEqual(res.body.data[0].name, '下达转换命令');
});

test('获取单个作业项详情', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .get('/api/tasks/1')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.name, '下达转换命令');
  assert.ok(Array.isArray(res.body.data.prerequisiteTaskIds));
});

test('新增作业项（含依赖和设备）', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .post('/api/plan-versions/1/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '新增测试作业',
      description: '测试用',
      sortOrder: 8,
      timeLimitMinutes: 5,
      responsibleTeam: '测试组',
      prerequisiteTaskIds: [7],
      equipments: [{ equipmentId: 1, actionNote: '测试操作' }],
    });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.name, '新增测试作业');
  assert.deepStrictEqual(res.body.data.prerequisiteTaskIds, [7]);
  assert.strictEqual(res.body.data.equipments.length, 1);
});

test('更新作业项', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .put('/api/tasks/1')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '下达转换命令（更新）',
      timeLimitMinutes: 2,
      prerequisiteTaskIds: [],
    });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.name, '下达转换命令（更新）');
  assert.strictEqual(res.body.data.timeLimitMinutes, 2);
  assert.deepStrictEqual(res.body.data.prerequisiteTaskIds, []);
});

test('删除作业项', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .delete('/api/tasks/7')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 204);
});

/* =========================================================
   演练管理测试
   ========================================================= */

test('发起模拟演练', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .post('/api/projects/1/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION', remarks: '月度例行演练' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.type, 'SIMULATION');
  assert.strictEqual(res.body.data.status, 'PENDING');
  assert.strictEqual(res.body.data.nationalTimeLimitMinutes, 30);
});

test('同时发起第二个演练被拒 409', async () => {
  const token = await tokenOf('admin', 'admin123');
  await request(app)
    .post('/api/projects/1/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION' });
  const res = await request(app)
    .post('/api/projects/1/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION' });
  assert.strictEqual(res.status, 409);
});

test('尚无预案的工程发起演练返回 400', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app)
    .post('/api/projects/2/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION' });
  assert.strictEqual(res.status, 400);
});

test('开始演练', async () => {
  const token = await tokenOf('admin', 'admin123');
  const createRes = await request(app)
    .post('/api/projects/1/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION' });
  const drillId = createRes.body.data.id;

  const res = await request(app)
    .post(`/api/drills/${drillId}/start`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.status, 'IN_PROGRESS');
  assert.ok(res.body.data.startedAt);
});

test('取消演练', async () => {
  const token = await tokenOf('admin', 'admin123');
  const createRes = await request(app)
    .post('/api/projects/1/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION' });
  const drillId = createRes.body.data.id;

  const res = await request(app)
    .post(`/api/drills/${drillId}/cancel`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.status, 'CANCELLED');
});

test('获取演练作业列表（含前置检查）', async () => {
  const token = await tokenOf('admin', 'admin123');
  const createRes = await request(app)
    .post('/api/projects/1/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION' });
  const drillId = createRes.body.data.id;
  await request(app)
    .post(`/api/drills/${drillId}/start`)
    .set('Authorization', `Bearer ${token}`);

  const res = await request(app)
    .get(`/api/drills/${drillId}/tasks`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 7);
  assert.ok(res.body.data[0].canStart !== undefined);
  assert.ok(res.body.data[0].prerequisiteNames);
});

test('上报作业开始 - 依赖未完成被拦截', async () => {
  const token = await tokenOf('admin', 'admin123');
  const createRes = await request(app)
    .post('/api/projects/1/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION' });
  const drillId = createRes.body.data.id;
  await request(app)
    .post(`/api/drills/${drillId}/start`)
    .set('Authorization', `Bearer ${token}`);

  const res = await request(app)
    .post(`/api/drills/${drillId}/tasks/2/start`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error.message.includes('前置作业未完成'));
});

test('上报作业开始 - 依赖已完成可以开始', async () => {
  const token = await tokenOf('admin', 'admin123');
  const createRes = await request(app)
    .post('/api/projects/1/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION' });
  const drillId = createRes.body.data.id;
  await request(app)
    .post(`/api/drills/${drillId}/start`)
    .set('Authorization', `Bearer ${token}`);

  const start1 = await request(app)
    .post(`/api/drills/${drillId}/tasks/1/start`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(start1.status, 200);
  assert.strictEqual(start1.body.data.status, 'IN_PROGRESS');
});

test('完成演练完整流程并生成报告', async () => {
  const token = await tokenOf('admin', 'admin123');

  const createRes = await request(app)
    .post('/api/projects/1/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION' });
  const drillId = createRes.body.data.id;

  await request(app)
    .post(`/api/drills/${drillId}/start`)
    .set('Authorization', `Bearer ${token}`);

  const taskOrder = [1, 2, 3, 4, 5, 6, 7];
  for (const taskId of taskOrder) {
    await request(app)
      .post(`/api/drills/${drillId}/tasks/${taskId}/start`)
      .set('Authorization', `Bearer ${token}`);
    await new Promise((r) => setTimeout(r, 10));
    await request(app)
      .post(`/api/drills/${drillId}/tasks/${taskId}/finish`)
      .set('Authorization', `Bearer ${token}`);
  }

  const drillRes = await request(app)
    .get(`/api/drills/${drillId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(drillRes.body.data.status, 'COMPLETED');
  assert.ok(drillRes.body.data.totalDurationMinutes !== null);

  const reportRes = await request(app)
    .get(`/api/drills/${drillId}/report`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(reportRes.status, 200);
  assert.ok(reportRes.body.data.summary);
  assert.strictEqual(reportRes.body.data.summary.totalTasks, 7);
  assert.strictEqual(reportRes.body.data.summary.completedTasks, 7);
  assert.ok(reportRes.body.data.criticalPath);
  assert.ok(reportRes.body.data.criticalPath.criticalPath);
});

test('实时进度查询', async () => {
  const token = await tokenOf('admin', 'admin123');
  const createRes = await request(app)
    .post('/api/projects/1/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION' });
  const drillId = createRes.body.data.id;
  await request(app)
    .post(`/api/drills/${drillId}/start`)
    .set('Authorization', `Bearer ${token}`);

  const res = await request(app)
    .get(`/api/drills/${drillId}/progress`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.total, 7);
  assert.strictEqual(res.body.data.completed, 0);
  assert.strictEqual(res.body.data.progressPercent, 0);
});

test('关键路径分析', async () => {
  const token = await tokenOf('admin', 'admin123');
  const createRes = await request(app)
    .post('/api/projects/1/drills')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'SIMULATION' });
  const drillId = createRes.body.data.id;

  const res = await request(app)
    .get(`/api/drills/${drillId}/critical-path`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data.criticalPath));
  assert.ok(res.body.data.totalDuration > 0);
});

test('多轮演练对比', async () => {
  const token = await tokenOf('admin', 'admin123');

  for (let i = 0; i < 2; i++) {
    const createRes = await request(app)
      .post('/api/projects/1/drills')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'SIMULATION' });
    const drillId = createRes.body.data.id;
    await request(app)
      .post(`/api/drills/${drillId}/start`)
      .set('Authorization', `Bearer ${token}`);
    for (const taskId of [1, 2, 3, 4, 5, 6, 7]) {
      await request(app)
        .post(`/api/drills/${drillId}/tasks/${taskId}/start`)
        .set('Authorization', `Bearer ${token}`);
      await new Promise((r) => setTimeout(r, 5));
      await request(app)
        .post(`/api/drills/${drillId}/tasks/${taskId}/finish`)
        .set('Authorization', `Bearer ${token}`);
    }
  }

  const res = await request(app)
    .get('/api/projects/1/drills/comparison')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.completedDrills, 2);
  assert.strictEqual(res.body.data.trend.length, 2);
});
