'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const { sendError, isNonEmptyString, toPositiveInt } = require('../utils/http');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_DRILL_TYPE = ['SIMULATION', 'REAL'];

router.use(authRequired);

/* =========================================================
   演练管理
   ========================================================= */

router.get('/projects/:projectId/drills', wrap(async (req, res) => {
  const projectId = toPositiveInt(req.params.projectId);
  if (projectId === null) return sendError(res, 400, '无效的工程ID');
  if (!(await store.getProject(projectId))) return sendError(res, 404, '工程不存在');

  const drills = await store.listDrills({ projectId });
  res.json({ data: drills, total: drills.length });
}));

router.get('/drills/:drillId', wrap(async (req, res) => {
  const drillId = toPositiveInt(req.params.drillId);
  if (drillId === null) return sendError(res, 400, '无效的演练ID');
  const drill = await store.getDrill(drillId);
  if (!drill) return sendError(res, 404, '演练不存在');
  res.json({ data: drill });
}));

router.post('/projects/:projectId/drills', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const projectId = toPositiveInt(req.params.projectId);
  if (projectId === null) return sendError(res, 400, '无效的工程ID');
  const project = await store.getProject(projectId);
  if (!project) return sendError(res, 404, '工程不存在');

  const plan = await store.getPlanByProjectId(projectId);
  if (!plan) return sendError(res, 400, '该工程尚未配置平战转换预案');

  const latestVersion = await store.getLatestVersion(plan.id);
  if (!latestVersion) return sendError(res, 400, '预案尚无版本，请先发布版本');

  const b = req.body || {};
  if (b.type !== undefined && !VALID_DRILL_TYPE.includes(b.type)) {
    return sendError(res, 400, '无效的演练类型');
  }

  const activeDrills = (await store.listDrills({ projectId })).filter(
    (d) => d.status === 'PENDING' || d.status === 'IN_PROGRESS',
  );
  if (activeDrills.length > 0) {
    return sendError(res, 409, '该工程已有进行中的演练，请先完成或取消');
  }

  const drill = await store.createDrill({
    projectId,
    planVersionId: b.planVersionId || latestVersion.id,
    type: b.type || 'SIMULATION',
    remarks: b.remarks || '',
    createdBy: req.user.id,
  });

  res.status(201).json({ data: drill });
}));

router.post('/drills/:drillId/start', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const drillId = toPositiveInt(req.params.drillId);
  if (drillId === null) return sendError(res, 400, '无效的演练ID');
  if (!(await store.getDrill(drillId))) return sendError(res, 404, '演练不存在');

  try {
    const drill = await store.startDrill(drillId);
    res.json({ data: drill });
  } catch (e) {
    return sendError(res, 400, e.message);
  }
}));

router.post('/drills/:drillId/cancel', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const drillId = toPositiveInt(req.params.drillId);
  if (drillId === null) return sendError(res, 400, '无效的演练ID');
  if (!(await store.getDrill(drillId))) return sendError(res, 404, '演练不存在');

  try {
    const drill = await store.cancelDrill(drillId);
    res.json({ data: drill });
  } catch (e) {
    return sendError(res, 400, e.message);
  }
}));

/* =========================================================
   演练作业上报
   ========================================================= */

router.get('/drills/:drillId/tasks', wrap(async (req, res) => {
  const drillId = toPositiveInt(req.params.drillId);
  if (drillId === null) return sendError(res, 400, '无效的演练ID');
  if (!(await store.getDrill(drillId))) return sendError(res, 404, '演练不存在');

  const drillTasks = await store.listDrillTasks(drillId);
  const enriched = [];
  for (const dt of drillTasks) {
    const prereqs = await store.listTaskPrerequisites(dt.taskId);
    const prereqCheck = await store.checkPrerequisitesMet(drillId, dt.taskId);
    enriched.push({
      ...dt,
      prerequisiteNames: prereqs.map((p) => p.name),
      canStart: prereqCheck.met,
      uncompletedPrerequisites: prereqCheck.uncompleted || [],
    });
  }
  res.json({ data: enriched, total: enriched.length });
}));

router.get('/drills/:drillId/tasks/:taskId', wrap(async (req, res) => {
  const drillId = toPositiveInt(req.params.drillId);
  const taskId = toPositiveInt(req.params.taskId);
  if (drillId === null || taskId === null) return sendError(res, 400, '无效的ID');

  const dt = await store.getDrillTaskByDrillAndTask(drillId, taskId);
  if (!dt) return sendError(res, 404, '演练作业不存在');

  const prereqs = await store.listTaskPrerequisites(taskId);
  const equips = await store.listTaskEquipments(taskId);
  const prereqCheck = await store.checkPrerequisitesMet(drillId, taskId);

  res.json({
    data: {
      ...dt,
      prerequisiteNames: prereqs.map((p) => p.name),
      equipments: equips,
      canStart: prereqCheck.met,
      uncompletedPrerequisites: prereqCheck.uncompleted || [],
    },
  });
}));

router.post('/drills/:drillId/tasks/:taskId/start', wrap(async (req, res) => {
  const drillId = toPositiveInt(req.params.drillId);
  const taskId = toPositiveInt(req.params.taskId);
  if (drillId === null || taskId === null) return sendError(res, 400, '无效的ID');
  if (!(await store.getDrill(drillId))) return sendError(res, 404, '演练不存在');

  const b = req.body || {};
  try {
    const dt = await store.startDrillTask(drillId, taskId, req.user.id, b.remarks);
    res.json({ data: dt });
  } catch (e) {
    return sendError(res, 400, e.message);
  }
}));

router.post('/drills/:drillId/tasks/:taskId/finish', wrap(async (req, res) => {
  const drillId = toPositiveInt(req.params.drillId);
  const taskId = toPositiveInt(req.params.taskId);
  if (drillId === null || taskId === null) return sendError(res, 400, '无效的ID');
  if (!(await store.getDrill(drillId))) return sendError(res, 404, '演练不存在');

  const b = req.body || {};
  try {
    const dt = await store.finishDrillTask(drillId, taskId, req.user.id, b.remarks);
    res.json({ data: dt });
  } catch (e) {
    return sendError(res, 400, e.message);
  }
}));

/* =========================================================
   实时进度、评估报告、多轮对比
   ========================================================= */

router.get('/drills/:drillId/progress', wrap(async (req, res) => {
  const drillId = toPositiveInt(req.params.drillId);
  if (drillId === null) return sendError(res, 400, '无效的演练ID');
  if (!(await store.getDrill(drillId))) return sendError(res, 404, '演练不存在');

  const progress = await store.getDrillProgress(drillId);
  res.json({ data: progress });
}));

router.get('/drills/:drillId/critical-path', wrap(async (req, res) => {
  const drillId = toPositiveInt(req.params.drillId);
  if (drillId === null) return sendError(res, 400, '无效的演练ID');
  if (!(await store.getDrill(drillId))) return sendError(res, 404, '演练不存在');

  const critical = await store.findCriticalPath(drillId);
  res.json({ data: critical });
}));

router.get('/drills/:drillId/report', wrap(async (req, res) => {
  const drillId = toPositiveInt(req.params.drillId);
  if (drillId === null) return sendError(res, 400, '无效的演练ID');
  if (!(await store.getDrill(drillId))) return sendError(res, 404, '演练不存在');

  const report = await store.getDrillReport(drillId);
  res.json({ data: report });
}));

router.get('/projects/:projectId/drills/comparison', wrap(async (req, res) => {
  const projectId = toPositiveInt(req.params.projectId);
  if (projectId === null) return sendError(res, 400, '无效的工程ID');
  if (!(await store.getProject(projectId))) return sendError(res, 404, '工程不存在');

  const comparison = await store.getDrillsComparison(projectId);
  res.json({ data: comparison });
}));

module.exports = router;
