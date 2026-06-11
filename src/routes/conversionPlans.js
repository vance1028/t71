'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const { sendError, isNonEmptyString, toPositiveInt } = require('../utils/http');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_PLAN_STATUS = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

router.use(authRequired);

/* =========================================================
   预案管理（按工程）
   ========================================================= */

router.get('/projects/:projectId/plan', wrap(async (req, res) => {
  const projectId = toPositiveInt(req.params.projectId);
  if (projectId === null) return sendError(res, 400, '无效的工程ID');
  if (!(await store.getProject(projectId))) return sendError(res, 404, '工程不存在');

  const plan = await store.getPlanByProjectId(projectId);
  if (!plan) return res.json({ data: null });

  const latestVersion = await store.getLatestVersion(plan.id);
  const structure = latestVersion
    ? await store.getPlanFullStructure(latestVersion.id)
    : null;

  res.json({
    data: {
      plan,
      latestVersion,
      tasks: structure?.tasks || [],
    },
  });
}));

router.post('/projects/:projectId/plan', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const projectId = toPositiveInt(req.params.projectId);
  if (projectId === null) return sendError(res, 400, '无效的工程ID');
  if (!(await store.getProject(projectId))) return sendError(res, 404, '工程不存在');
  if (await store.getPlanByProjectId(projectId)) return sendError(res, 409, '该工程已有预案');

  const b = req.body || {};
  if (!isNonEmptyString(b.name)) return sendError(res, 400, '预案名称不能为空');
  if (b.status !== undefined && !VALID_PLAN_STATUS.includes(b.status)) {
    return sendError(res, 400, '无效的预案状态');
  }

  const plan = await store.createPlan({
    projectId,
    name: b.name.trim(),
    description: b.description || '',
    status: b.status || 'DRAFT',
  });
  res.status(201).json({ data: plan });
}));

router.put('/plans/:planId', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const planId = toPositiveInt(req.params.planId);
  if (planId === null) return sendError(res, 400, '无效的预案ID');
  if (!(await store.getPlan(planId))) return sendError(res, 404, '预案不存在');

  const b = req.body || {};
  if (b.name !== undefined && !isNonEmptyString(b.name)) {
    return sendError(res, 400, '预案名称不能为空');
  }
  if (b.status !== undefined && !VALID_PLAN_STATUS.includes(b.status)) {
    return sendError(res, 400, '无效的预案状态');
  }

  const updated = await store.updatePlan(planId, b);
  res.json({ data: updated });
}));

/* =========================================================
   版本管理
   ========================================================= */

router.get('/plans/:planId/versions', wrap(async (req, res) => {
  const planId = toPositiveInt(req.params.planId);
  if (planId === null) return sendError(res, 400, '无效的预案ID');
  if (!(await store.getPlan(planId))) return sendError(res, 404, '预案不存在');

  const versions = await store.listPlanVersions(planId);
  res.json({ data: versions, total: versions.length });
}));

router.get('/plan-versions/:versionId', wrap(async (req, res) => {
  const versionId = toPositiveInt(req.params.versionId);
  if (versionId === null) return sendError(res, 400, '无效的版本ID');
  const version = await store.getPlanVersion(versionId);
  if (!version) return sendError(res, 404, '版本不存在');

  const structure = await store.getPlanFullStructure(versionId);
  res.json({ data: structure });
}));

router.post('/plans/:planId/versions', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const planId = toPositiveInt(req.params.planId);
  if (planId === null) return sendError(res, 400, '无效的预案ID');
  if (!(await store.getPlan(planId))) return sendError(res, 404, '预案不存在');

  const b = req.body || {};
  const version = await store.createPlanVersion({
    planId,
    changeSummary: b.changeSummary || '',
    createdBy: req.user.id,
  });
  res.status(201).json({ data: version });
}));

/* =========================================================
   作业项管理
   ========================================================= */

router.get('/plan-versions/:versionId/tasks', wrap(async (req, res) => {
  const versionId = toPositiveInt(req.params.versionId);
  if (versionId === null) return sendError(res, 400, '无效的版本ID');
  if (!(await store.getPlanVersion(versionId))) return sendError(res, 404, '版本不存在');

  const tasks = await store.listTasksByVersion(versionId);
  const tasksWithDetails = [];
  for (const t of tasks) {
    const deps = await store.listTaskDependencies(t.id);
    const equips = await store.listTaskEquipments(t.id);
    tasksWithDetails.push({
      ...t,
      prerequisiteTaskIds: deps.map((d) => d.prerequisiteTaskId),
      equipments: equips.map((e) => ({ equipmentId: e.equipmentId, actionNote: e.actionNote })),
    });
  }
  res.json({ data: tasksWithDetails, total: tasksWithDetails.length });
}));

router.get('/tasks/:taskId', wrap(async (req, res) => {
  const taskId = toPositiveInt(req.params.taskId);
  if (taskId === null) return sendError(res, 400, '无效的作业ID');
  const task = await store.getTask(taskId);
  if (!task) return sendError(res, 404, '作业不存在');

  const deps = await store.listTaskDependencies(taskId);
  const equips = await store.listTaskEquipments(taskId);
  res.json({
    data: {
      ...task,
      prerequisiteTaskIds: deps.map((d) => d.prerequisiteTaskId),
      equipments: equips.map((e) => ({ equipmentId: e.equipmentId, actionNote: e.actionNote })),
    },
  });
}));

router.post('/plan-versions/:versionId/tasks', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const versionId = toPositiveInt(req.params.versionId);
  if (versionId === null) return sendError(res, 400, '无效的版本ID');
  if (!(await store.getPlanVersion(versionId))) return sendError(res, 404, '版本不存在');

  const b = req.body || {};
  if (!isNonEmptyString(b.name)) return sendError(res, 400, '作业名称不能为空');
  if (b.timeLimitMinutes === undefined) return sendError(res, 400, '时限不能为空');
  const timeLimit = toPositiveInt(b.timeLimitMinutes);
  if (timeLimit === null) return sendError(res, 400, '时限必须是正整数');

  const task = await store.createTask({
    planVersionId: versionId,
    name: b.name.trim(),
    description: b.description || '',
    sortOrder: b.sortOrder || 0,
    timeLimitMinutes: timeLimit,
    responsibleUserId: b.responsibleUserId || null,
    responsibleTeam: b.responsibleTeam || '',
  });

  if (Array.isArray(b.prerequisiteTaskIds)) {
    for (const pid of b.prerequisiteTaskIds) {
      const pidInt = toPositiveInt(pid);
      if (pidInt && pidInt !== task.id) {
        await store.addTaskDependency(task.id, pidInt);
      }
    }
  }

  if (Array.isArray(b.equipments)) {
    for (const e of b.equipments) {
      const eid = toPositiveInt(e.equipmentId);
      if (eid) {
        await store.addTaskEquipment(task.id, eid, e.actionNote || '');
      }
    }
  }

  const deps = await store.listTaskDependencies(task.id);
  const equips = await store.listTaskEquipments(task.id);
  res.status(201).json({
    data: {
      ...task,
      prerequisiteTaskIds: deps.map((d) => d.prerequisiteTaskId),
      equipments: equips.map((e) => ({ equipmentId: e.equipmentId, actionNote: e.actionNote })),
    },
  });
}));

router.put('/tasks/:taskId', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const taskId = toPositiveInt(req.params.taskId);
  if (taskId === null) return sendError(res, 400, '无效的作业ID');
  if (!(await store.getTask(taskId))) return sendError(res, 404, '作业不存在');

  const b = req.body || {};
  if (b.name !== undefined && !isNonEmptyString(b.name)) {
    return sendError(res, 400, '作业名称不能为空');
  }
  if (b.timeLimitMinutes !== undefined && toPositiveInt(b.timeLimitMinutes) === null) {
    return sendError(res, 400, '时限必须是正整数');
  }

  const patch = {};
  for (const k of ['name', 'description', 'sortOrder', 'timeLimitMinutes', 'responsibleUserId', 'responsibleTeam']) {
    if (b[k] !== undefined) patch[k] = b[k];
  }
  await store.updateTask(taskId, patch);

  if (Array.isArray(b.prerequisiteTaskIds)) {
    const existing = (await store.listTaskDependencies(taskId)).map((d) => d.prerequisiteTaskId);
    for (const pid of b.prerequisiteTaskIds) {
      const pidInt = toPositiveInt(pid);
      if (pidInt && pidInt !== taskId && !existing.includes(pidInt)) {
        await store.addTaskDependency(taskId, pidInt);
      }
    }
    for (const pid of existing) {
      if (!b.prerequisiteTaskIds.includes(pid)) {
        await store.removeTaskDependency(taskId, pid);
      }
    }
  }

  if (Array.isArray(b.equipments)) {
    const existing = (await store.listTaskEquipments(taskId)).map((e) => e.equipmentId);
    for (const e of b.equipments) {
      const eid = toPositiveInt(e.equipmentId);
      if (eid && !existing.includes(eid)) {
        await store.addTaskEquipment(taskId, eid, e.actionNote || '');
      }
    }
    for (const eid of existing) {
      const found = b.equipments.find((x) => toPositiveInt(x.equipmentId) === eid);
      if (!found) {
        await store.removeTaskEquipment(taskId, eid);
      }
    }
  }

  const updated = await store.getTask(taskId);
  const deps = await store.listTaskDependencies(taskId);
  const equips = await store.listTaskEquipments(taskId);
  res.json({
    data: {
      ...updated,
      prerequisiteTaskIds: deps.map((d) => d.prerequisiteTaskId),
      equipments: equips.map((e) => ({ equipmentId: e.equipmentId, actionNote: e.actionNote })),
    },
  });
}));

router.delete('/tasks/:taskId', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const taskId = toPositiveInt(req.params.taskId);
  if (taskId === null) return sendError(res, 400, '无效的作业ID');
  if (!(await store.getTask(taskId))) return sendError(res, 404, '作业不存在');

  await store.deleteTask(taskId);
  res.status(204).end();
}));

module.exports = router;
