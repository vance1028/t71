'use strict';

/**
 * 数据仓储层 - 基于 MySQL（mysql2/promise）。
 * 所有方法 async，返回 camelCase 字段对象。
 */

const { pool } = require('../db');
const { hashPassword } = require('../utils/password');

/* ----------------------------- 映射 ----------------------------- */

function mapUser(r) {
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role,
    department: r.department,
    status: r.status,
    createdAt: r.created_at,
  };
}

// 含密码哈希的内部映射，仅登录校验用，绝不直接返回给前端
function mapUserWithHash(r) {
  if (!r) return null;
  return { ...mapUser(r), passwordHash: r.password_hash };
}

function mapProject(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    protectionLevel: r.protection_level,
    areaSqm: Number(r.area_sqm),
    address: r.address,
    district: r.district,
    peacetimeUse: r.peacetime_use,
    status: r.status,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapEquipment(r) {
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    category: r.category,
    model: r.model,
    installDate: r.install_date,
    status: r.status,
    createdAt: r.created_at,
  };
}

function mapInspection(r) {
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    inspectorId: r.inspector_id,
    inspectDate: r.inspect_date,
    type: r.type,
    result: r.result,
    issues: r.issues,
    createdAt: r.created_at,
  };
}

/* ---------- 平战转换 ---------- */

function mapConversionPlan(r) {
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    description: r.description,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapPlanVersion(r) {
  if (!r) return null;
  return {
    id: r.id,
    planId: r.plan_id,
    version: r.version,
    changeSummary: r.change_summary,
    snapshot: typeof r.snapshot === 'string' ? JSON.parse(r.snapshot) : r.snapshot,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function mapConversionTask(r) {
  if (!r) return null;
  return {
    id: r.id,
    planVersionId: r.plan_version_id,
    name: r.name,
    description: r.description,
    sortOrder: r.sort_order,
    timeLimitMinutes: r.time_limit_minutes,
    responsibleUserId: r.responsible_user_id,
    responsibleTeam: r.responsible_team,
    createdAt: r.created_at,
  };
}

function mapTaskDependency(r) {
  if (!r) return null;
  return {
    id: r.id,
    taskId: r.task_id,
    prerequisiteTaskId: r.prerequisite_task_id,
  };
}

function mapTaskEquipment(r) {
  if (!r) return null;
  return {
    id: r.id,
    taskId: r.task_id,
    equipmentId: r.equipment_id,
    actionNote: r.action_note,
  };
}

function mapDrill(r) {
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    planVersionId: r.plan_version_id,
    type: r.type,
    status: r.status,
    nationalTimeLimitMinutes: r.national_time_limit_minutes,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    totalDurationMinutes: r.total_duration_minutes,
    remarks: r.remarks,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function mapDrillTask(r) {
  if (!r) return null;
  return {
    id: r.id,
    drillId: r.drill_id,
    taskId: r.task_id,
    taskSnapshot: typeof r.task_snapshot === 'string' ? JSON.parse(r.task_snapshot) : r.task_snapshot,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMinutes: r.duration_minutes,
    timeLimitMinutes: r.time_limit_minutes,
    isOvertime: r.is_overtime === 1,
    reportedBy: r.reported_by,
    remarks: r.remarks,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/* --------------------------- 初始化/重置 --------------------------- */

async function seed() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of [
      'drill_tasks', 'drills',
      'conversion_task_equipments', 'conversion_task_dependencies',
      'conversion_tasks', 'conversion_plan_versions', 'conversion_plans',
      'inspections', 'equipments', 'projects', 'users',
    ]) {
      await conn.query(`TRUNCATE TABLE ${t}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // 用户（密码运行时哈希）：admin/admin123, manager/manager123, inspector/inspect123
    await conn.query(
      `INSERT INTO users (id, username, password_hash, name, role, department) VALUES
        (1, 'admin', ?, '系统管理员', 'ADMIN', '人防办信息科'),
        (2, 'manager', ?, '张管理', 'MANAGER', '工程管理科'),
        (3, 'inspector', ?, '李巡检', 'INSPECTOR', '维护管理科')`,
      [hashPassword('admin123'), hashPassword('manager123'), hashPassword('inspect123')],
    );

    await conn.query(
      `INSERT INTO projects (id, code, name, type, protection_level, area_sqm, address, district, peacetime_use, status, completed_at) VALUES
        (1, 'RF-2024-001', '中心广场地下人防工程', 'COMBINED', '6', 8600.50, '人民中路1号地下', '城关区', '地下停车场', 'NORMAL', '2018-09-01'),
        (2, 'RF-2024-002', '滨江路防空地下室', 'BASEMENT', '6B', 3200.00, '滨江路88号', '江南区', '商业仓储', 'NORMAL', '2020-05-15'),
        (3, 'RF-2024-003', '老城区单建掘开式工程', 'SINGLE', '5', 5400.00, '解放街地下', '城关区', '暂未利用', 'MAINTENANCE', '2010-03-20'),
        (4, 'RF-2024-004', '科技园人员掩蔽所', 'SHELTER', '6', 2100.00, '科技大道12号地下', '高新区', '社区活动中心', 'NORMAL', '2021-11-30')`,
    );

    await conn.query(
      `INSERT INTO equipments (project_id, name, category, model, install_date, status) VALUES
        (1, '1号防护密闭门', 'PROTECTIVE_DOOR', 'HFM2030', '2018-08-01', 'NORMAL'),
        (1, '战时通风机', 'VENTILATION', 'F300', '2018-08-10', 'NORMAL'),
        (1, '柴油发电机组', 'POWER', '50GF', '2018-08-15', 'NORMAL'),
        (1, '2号防护密闭门', 'PROTECTIVE_DOOR', 'HFM1520', '2018-08-02', 'NORMAL'),
        (1, '滤毒通风装置', 'VENTILATION', 'LD-120', '2018-08-12', 'NORMAL'),
        (1, '电动封堵板', 'PROTECTIVE_DOOR', 'FDB-3000', '2018-08-05', 'NORMAL'),
        (2, '防爆波活门', 'PROTECTIVE_DOOR', 'HK600', '2020-04-20', 'NORMAL'),
        (2, '给排水泵', 'WATER', 'WQ15', '2020-05-01', 'FAULT'),
        (3, '滤毒通风设备', 'VENTILATION', 'LD60', '2010-03-01', 'MAINTENANCE')`,
    );

    await conn.query(
      `INSERT INTO inspections (project_id, inspector_id, inspect_date, type, result, issues) VALUES
        (1, 3, '2026-05-10', 'ROUTINE', 'PASS', ''),
        (2, 3, '2026-05-12', 'ROUTINE', 'FAIL', '给排水泵故障，需更换'),
        (3, 3, '2026-04-20', 'SPECIAL', 'FAIL', '滤毒设备老化，建议大修'),
        (1, 3, '2026-06-01', 'ROUTINE', 'PASS', '')`,
    );

    // ---------- 中心广场工程的平战转换预案 ----------

    // 1. 预案主表
    await conn.query(
      `INSERT INTO conversion_plans (id, project_id, name, description, status) VALUES
        (1, 1, '中心广场工程平战转换预案', '平时为地下停车场，战时转换为人员掩蔽所。按六级人防工程要求，转换时限30分钟。', 'ACTIVE')`,
    );

    // 2. 版本1（初始版本）
    const initialSnapshot = JSON.stringify({
      planName: '中心广场工程平战转换预案',
      tasks: [
        { name: '下达转换命令', timeLimitMinutes: 1 },
        { name: '清空停车场车辆', timeLimitMinutes: 10 },
        { name: '关闭防护门', timeLimitMinutes: 5 },
        { name: '封堵车道口', timeLimitMinutes: 10 },
        { name: '切换通风系统', timeLimitMinutes: 5 },
        { name: '启动备用电源', timeLimitMinutes: 3 },
        { name: '战前检查确认', timeLimitMinutes: 5 },
      ],
    });
    await conn.query(
      `INSERT INTO conversion_plan_versions (id, plan_id, version, change_summary, snapshot, created_by) VALUES
        (1, 1, 1, '初始版本，完成核心作业流程编制', ?, 1)`,
      [initialSnapshot],
    );

    // 3. 作业项
    await conn.query(
      `INSERT INTO conversion_tasks (id, plan_version_id, name, description, sort_order, time_limit_minutes, responsible_user_id, responsible_team) VALUES
        (1, 1, '下达转换命令', '工程值班室收到上级转换令后，立即通知各班组就位', 1, 1, 1, '指挥组'),
        (2, 1, '清空停车场车辆', '通过广播、电话通知车主移车，出入口设警戒', 2, 10, 2, '交通疏导组'),
        (3, 1, '启动备用电源', '启动柴油发电机组，确保战时电力供应', 3, 3, 3, '机电保障组'),
        (4, 1, '关闭防护门', '关闭1号、2号防护密闭门并锁紧', 4, 5, 3, '防护操作组'),
        (5, 1, '封堵车道口', '展开电动封堵板，封堵车辆出入口', 5, 10, 3, '防护操作组'),
        (6, 1, '切换通风系统', '由平时通风切换为滤毒通风模式', 6, 5, 3, '防化保障组'),
        (7, 1, '战前功能检查', '全面检查掩蔽功能、防护密闭性、水电供应', 7, 5, 2, '指挥组')`,
    );

    // 4. 依赖关系（DAG）
    await conn.query(
      `INSERT INTO conversion_task_dependencies (task_id, prerequisite_task_id) VALUES
        (2, 1),
        (3, 1),
        (4, 2),
        (5, 2),
        (6, 3),
        (7, 4),
        (7, 5),
        (7, 6)`,
    );

    // 5. 关联设备
    await conn.query(
      `INSERT INTO conversion_task_equipments (task_id, equipment_id, action_note) VALUES
        (3, 3, '启动柴油发电机组并检查输出电压'),
        (4, 1, '关闭1号防护密闭门并锁紧闭锁'),
        (4, 4, '关闭2号防护密闭门并锁紧闭锁'),
        (5, 6, '展开电动封堵板并固定'),
        (6, 2, '启动战时通风机'),
        (6, 5, '打开滤毒罐进出口阀门')`,
    );
  } finally {
    conn.release();
  }
}

async function isEmpty() {
  const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
  return rows[0].cnt === 0;
}

/* ----------------------------- 用户 ----------------------------- */

async function findUserByUsername(username) {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  return mapUserWithHash(rows[0]);
}

async function getUser(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return mapUser(rows[0]);
}

async function listUsers() {
  const [rows] = await pool.query('SELECT * FROM users ORDER BY id');
  return rows.map(mapUser);
}

async function createUser({ username, password, name = '', role = 'INSPECTOR', department = '' }) {
  const [r] = await pool.query(
    'INSERT INTO users (username, password_hash, name, role, department) VALUES (?, ?, ?, ?, ?)',
    [username, hashPassword(password), name, role, department],
  );
  return getUser(r.insertId);
}

/* ----------------------------- 人防工程 ----------------------------- */

async function listProjects({ status, district, keyword } = {}) {
  const where = [];
  const params = [];
  if (status !== undefined) { where.push('status = ?'); params.push(status); }
  if (district !== undefined) { where.push('district = ?'); params.push(district); }
  if (keyword !== undefined && keyword !== '') {
    where.push('(name LIKE ? OR code LIKE ? OR address LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(`SELECT * FROM projects ${clause} ORDER BY id`, params);
  return rows.map(mapProject);
}

async function getProject(id) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [id]);
  return mapProject(rows[0]);
}

async function findProjectByCode(code) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE code = ?', [code]);
  return mapProject(rows[0]);
}

async function createProject(p) {
  const [r] = await pool.query(
    `INSERT INTO projects (code, name, type, protection_level, area_sqm, address, district, peacetime_use, status, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.code, p.name, p.type || 'COMBINED', p.protectionLevel || '6', p.areaSqm || 0,
     p.address || '', p.district || '', p.peacetimeUse || '', p.status || 'NORMAL', p.completedAt || null],
  );
  return getProject(r.insertId);
}

async function updateProject(id, patch) {
  const map = {
    name: 'name', type: 'type', protectionLevel: 'protection_level', areaSqm: 'area_sqm',
    address: 'address', district: 'district', peacetimeUse: 'peacetime_use',
    status: 'status', completedAt: 'completed_at',
  };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) { sets.push(`${col} = ?`); params.push(patch[k]); }
  }
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP(3)');
    params.push(id);
    await pool.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  return getProject(id);
}

async function deleteProject(id) {
  const [r] = await pool.query('DELETE FROM projects WHERE id = ?', [id]);
  return r.affectedRows > 0;
}

/* ----------------------------- 设备设施 ----------------------------- */

async function listEquipments(projectId) {
  const [rows] = await pool.query(
    'SELECT * FROM equipments WHERE project_id = ? ORDER BY id', [projectId]);
  return rows.map(mapEquipment);
}

async function createEquipment(e) {
  const [r] = await pool.query(
    `INSERT INTO equipments (project_id, name, category, model, install_date, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [e.projectId, e.name, e.category || 'OTHER', e.model || '', e.installDate || null, e.status || 'NORMAL'],
  );
  const [rows] = await pool.query('SELECT * FROM equipments WHERE id = ?', [r.insertId]);
  return mapEquipment(rows[0]);
}

/* ----------------------------- 检查记录 ----------------------------- */

async function listInspections({ projectId } = {}) {
  if (projectId !== undefined) {
    const [rows] = await pool.query(
      'SELECT * FROM inspections WHERE project_id = ? ORDER BY inspect_date DESC, id DESC', [projectId]);
    return rows.map(mapInspection);
  }
  const [rows] = await pool.query('SELECT * FROM inspections ORDER BY inspect_date DESC, id DESC');
  return rows.map(mapInspection);
}

async function createInspection(i) {
  const [r] = await pool.query(
    `INSERT INTO inspections (project_id, inspector_id, inspect_date, type, result, issues)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [i.projectId, i.inspectorId || null, i.inspectDate, i.type || 'ROUTINE', i.result || 'PASS', i.issues || ''],
  );
  const [rows] = await pool.query('SELECT * FROM inspections WHERE id = ?', [r.insertId]);
  return mapInspection(rows[0]);
}

/* =========================================================
   平战转换 - 预案管理
   ========================================================= */

async function getPlanByProjectId(projectId) {
  const [rows] = await pool.query('SELECT * FROM conversion_plans WHERE project_id = ?', [projectId]);
  return mapConversionPlan(rows[0]);
}

async function getPlan(planId) {
  const [rows] = await pool.query('SELECT * FROM conversion_plans WHERE id = ?', [planId]);
  return mapConversionPlan(rows[0]);
}

async function createPlan({ projectId, name, description, status }) {
  const [r] = await pool.query(
    `INSERT INTO conversion_plans (project_id, name, description, status)
     VALUES (?, ?, ?, ?)`,
    [projectId, name, description || '', status || 'DRAFT'],
  );
  return getPlan(r.insertId);
}

async function updatePlan(planId, patch) {
  const map = { name: 'name', description: 'description', status: 'status' };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) { sets.push(`${col} = ?`); params.push(patch[k]); }
  }
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP(3)');
    params.push(planId);
    await pool.query(`UPDATE conversion_plans SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  return getPlan(planId);
}

/* ---------- 版本 ---------- */

async function getLatestVersion(planId) {
  const [rows] = await pool.query(
    'SELECT * FROM conversion_plan_versions WHERE plan_id = ? ORDER BY version DESC LIMIT 1',
    [planId],
  );
  return mapPlanVersion(rows[0]);
}

async function listPlanVersions(planId) {
  const [rows] = await pool.query(
    'SELECT * FROM conversion_plan_versions WHERE plan_id = ? ORDER BY version DESC',
    [planId],
  );
  return rows.map(mapPlanVersion);
}

async function getPlanVersion(versionId) {
  const [rows] = await pool.query('SELECT * FROM conversion_plan_versions WHERE id = ?', [versionId]);
  return mapPlanVersion(rows[0]);
}

async function createPlanVersion({ planId, changeSummary, createdBy }) {
  const tasks = await listTasksByVersion((await getLatestVersion(planId))?.id || 0);
  const tasksWithDetails = [];
  for (const t of tasks) {
    const deps = await listTaskDependencies(t.id);
    const equips = await listTaskEquipments(t.id);
    tasksWithDetails.push({
      ...t,
      dependencies: deps.map((d) => d.prerequisiteTaskId),
      equipments: equips.map((e) => ({ equipmentId: e.equipmentId, actionNote: e.actionNote })),
    });
  }
  const latest = await getLatestVersion(planId);
  const nextVersion = latest ? latest.version + 1 : 1;
  const snapshot = JSON.stringify({
    planName: (await getPlan(planId)).name,
    tasks: tasksWithDetails,
    generatedAt: new Date().toISOString(),
  });
  const [r] = await pool.query(
    `INSERT INTO conversion_plan_versions (plan_id, version, change_summary, snapshot, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [planId, nextVersion, changeSummary || '', snapshot, createdBy || null],
  );
  return getPlanVersion(r.insertId);
}

/* ---------- 作业项 ---------- */

async function listTasksByVersion(planVersionId) {
  const [rows] = await pool.query(
    'SELECT * FROM conversion_tasks WHERE plan_version_id = ? ORDER BY sort_order, id',
    [planVersionId],
  );
  return rows.map(mapConversionTask);
}

async function getTask(taskId) {
  const [rows] = await pool.query('SELECT * FROM conversion_tasks WHERE id = ?', [taskId]);
  return mapConversionTask(rows[0]);
}

async function createTask(t) {
  const [r] = await pool.query(
    `INSERT INTO conversion_tasks (plan_version_id, name, description, sort_order, time_limit_minutes, responsible_user_id, responsible_team)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [t.planVersionId, t.name, t.description || '', t.sortOrder || 0, t.timeLimitMinutes,
      t.responsibleUserId || null, t.responsibleTeam || ''],
  );
  return getTask(r.insertId);
}

async function updateTask(taskId, patch) {
  const map = {
    name: 'name', description: 'description', sortOrder: 'sort_order',
    timeLimitMinutes: 'time_limit_minutes', responsibleUserId: 'responsible_user_id',
    responsibleTeam: 'responsible_team',
  };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) { sets.push(`${col} = ?`); params.push(patch[k]); }
  }
  if (sets.length) {
    params.push(taskId);
    await pool.query(`UPDATE conversion_tasks SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  return getTask(taskId);
}

async function deleteTask(taskId) {
  await pool.query('DELETE FROM conversion_tasks WHERE id = ?', [taskId]);
}

/* ---------- 依赖关系 ---------- */

async function listTaskDependencies(taskId) {
  const [rows] = await pool.query(
    'SELECT * FROM conversion_task_dependencies WHERE task_id = ?',
    [taskId],
  );
  return rows.map(mapTaskDependency);
}

async function listTaskPrerequisites(taskId) {
  const [rows] = await pool.query(
    `SELECT ct.* FROM conversion_tasks ct
     INNER JOIN conversion_task_dependencies ctd ON ct.id = ctd.prerequisite_task_id
     WHERE ctd.task_id = ?`,
    [taskId],
  );
  return rows.map(mapConversionTask);
}

async function addTaskDependency(taskId, prerequisiteTaskId) {
  try {
    const [r] = await pool.query(
      'INSERT INTO conversion_task_dependencies (task_id, prerequisite_task_id) VALUES (?, ?)',
      [taskId, prerequisiteTaskId],
    );
    return { id: r.insertId, taskId, prerequisiteTaskId };
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return null;
    throw e;
  }
}

async function removeTaskDependency(taskId, prerequisiteTaskId) {
  await pool.query(
    'DELETE FROM conversion_task_dependencies WHERE task_id = ? AND prerequisite_task_id = ?',
    [taskId, prerequisiteTaskId],
  );
}

/* ---------- 关联设备 ---------- */

async function listTaskEquipments(taskId) {
  const [rows] = await pool.query(
    'SELECT * FROM conversion_task_equipments WHERE task_id = ?',
    [taskId],
  );
  return rows.map(mapTaskEquipment);
}

async function addTaskEquipment(taskId, equipmentId, actionNote) {
  try {
    const [r] = await pool.query(
      'INSERT INTO conversion_task_equipments (task_id, equipment_id, action_note) VALUES (?, ?, ?)',
      [taskId, equipmentId, actionNote || ''],
    );
    return { id: r.insertId, taskId, equipmentId, actionNote: actionNote || '' };
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return null;
    throw e;
  }
}

async function removeTaskEquipment(taskId, equipmentId) {
  await pool.query(
    'DELETE FROM conversion_task_equipments WHERE task_id = ? AND equipment_id = ?',
    [taskId, equipmentId],
  );
}

/* ---------- 预案完整结构（含版本、作业、依赖、设备） ---------- */

async function getPlanFullStructure(planVersionId) {
  const version = await getPlanVersion(planVersionId);
  if (!version) return null;
  const plan = await getPlan(version.planId);
  const tasks = await listTasksByVersion(planVersionId);
  const tasksWithDetails = [];
  for (const t of tasks) {
    const deps = await listTaskDependencies(t.id);
    const equips = await listTaskEquipments(t.id);
    tasksWithDetails.push({
      ...t,
      prerequisiteTaskIds: deps.map((d) => d.prerequisiteTaskId),
      equipments: equips.map((e) => ({ equipmentId: e.equipmentId, actionNote: e.actionNote })),
    });
  }
  return {
    plan,
    version,
    tasks: tasksWithDetails,
  };
}

/* =========================================================
   平战转换 - 演练管理
   ========================================================= */

const NATIONAL_TIME_LIMITS = {
  '5': 15,
  '6': 30,
  '6B': 30,
  '4B': 20,
  '4': 15,
};

function getNationalTimeLimit(protectionLevel) {
  return NATIONAL_TIME_LIMITS[protectionLevel] || 30;
}

/* ---------- 演练基础 ---------- */

async function listDrills({ projectId } = {}) {
  let sql = 'SELECT * FROM drills';
  const params = [];
  if (projectId !== undefined) {
    sql += ' WHERE project_id = ?';
    params.push(projectId);
  }
  sql += ' ORDER BY created_at DESC, id DESC';
  const [rows] = await pool.query(sql, params);
  return rows.map(mapDrill);
}

async function getDrill(drillId) {
  const [rows] = await pool.query('SELECT * FROM drills WHERE id = ?', [drillId]);
  return mapDrill(rows[0]);
}

async function createDrill({ projectId, planVersionId, type, remarks, createdBy }) {
  const project = await getProject(projectId);
  if (!project) throw new Error('工程不存在');
  const nationalLimit = getNationalTimeLimit(project.protectionLevel);
  const [r] = await pool.query(
    `INSERT INTO drills (project_id, plan_version_id, type, status, national_time_limit_minutes, remarks, created_by)
     VALUES (?, ?, ?, 'PENDING', ?, ?, ?)`,
    [projectId, planVersionId, type || 'SIMULATION', nationalLimit, remarks || '', createdBy || null],
  );
  const drillId = r.insertId;

  const structure = await getPlanFullStructure(planVersionId);
  for (const task of structure.tasks) {
    const snapshot = JSON.stringify({
      task,
      planVersionId,
      createdAt: new Date().toISOString(),
    });
    await pool.query(
      `INSERT INTO drill_tasks (drill_id, task_id, task_snapshot, status, time_limit_minutes)
       VALUES (?, ?, ?, 'PENDING', ?)`,
      [drillId, task.id, snapshot, task.timeLimitMinutes],
    );
  }
  return getDrill(drillId);
}

/* ---------- 演练作业 ---------- */

async function listDrillTasks(drillId) {
  const [rows] = await pool.query(
    'SELECT * FROM drill_tasks WHERE drill_id = ? ORDER BY id',
    [drillId],
  );
  return rows.map(mapDrillTask);
}

async function getDrillTask(drillTaskId) {
  const [rows] = await pool.query('SELECT * FROM drill_tasks WHERE id = ?', [drillTaskId]);
  return mapDrillTask(rows[0]);
}

async function getDrillTaskByDrillAndTask(drillId, taskId) {
  const [rows] = await pool.query(
    'SELECT * FROM drill_tasks WHERE drill_id = ? AND task_id = ?',
    [drillId, taskId],
  );
  return mapDrillTask(rows[0]);
}

/* ---------- 依赖检查 ---------- */

async function checkPrerequisitesMet(drillId, taskId) {
  const deps = await listTaskDependencies(taskId);
  if (deps.length === 0) return { met: true };
  const drillTasks = await listDrillTasks(drillId);
  const uncompleted = [];
  for (const dep of deps) {
    const dt = drillTasks.find((d) => d.taskId === dep.prerequisiteTaskId);
    if (!dt || dt.status !== 'COMPLETED') {
      const preTask = await getTask(dep.prerequisiteTaskId);
      uncompleted.push({ taskId: dep.prerequisiteTaskId, taskName: preTask?.name, status: dt?.status });
    }
  }
  return { met: uncompleted.length === 0, uncompleted };
}

/* ---------- 演练流程 ---------- */

async function startDrill(drillId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM drills WHERE id = ? FOR UPDATE', [drillId]);
    if (rows.length === 0) throw new Error('演练不存在');
    const drill = rows[0];
    if (drill.status !== 'PENDING') throw new Error('演练状态不允许开始');

    const now = new Date().toISOString().slice(0, 23).replace('T', ' ');
    await conn.query(
      "UPDATE drills SET status = 'IN_PROGRESS', started_at = ? WHERE id = ?",
      [now, drillId],
    );
    await conn.commit();
    return getDrill(drillId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function startDrillTask(drillId, taskId, reportedBy, remarks) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [drillRows] = await conn.query('SELECT * FROM drills WHERE id = ? FOR UPDATE', [drillId]);
    if (drillRows.length === 0) { await conn.rollback(); throw new Error('演练不存在'); }
    if (drillRows[0].status !== 'IN_PROGRESS') { await conn.rollback(); throw new Error('演练未在进行中'); }
    const drill = drillRows[0];

    const prereqCheck = await checkPrerequisitesMet(drillId, taskId);
    if (!prereqCheck.met) {
      await conn.rollback();
      const names = prereqCheck.uncompleted.map((u) => u.taskName).join('、');
      throw new Error(`前置作业未完成：${names}`);
    }

    const [dtRows] = await conn.query(
      'SELECT * FROM drill_tasks WHERE drill_id = ? AND task_id = ? FOR UPDATE',
      [drillId, taskId],
    );
    if (dtRows.length === 0) { await conn.rollback(); throw new Error('演练作业不存在'); }
    const dt = dtRows[0];
    if (dt.status !== 'PENDING') { await conn.rollback(); throw new Error('作业状态不允许开始'); }

    const now = new Date().toISOString().slice(0, 23).replace('T', ' ');
    await conn.query(
      `UPDATE drill_tasks SET status = 'IN_PROGRESS', started_at = ?, reported_by = ?, remarks = ?, updated_at = ?
       WHERE id = ?`,
      [now, reportedBy || null, remarks || '', now, dt.id],
    );

    await conn.commit();
    return getDrillTask(dt.id);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function finishDrillTask(drillId, taskId, reportedBy, remarks) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [drillRows] = await conn.query('SELECT * FROM drills WHERE id = ? FOR UPDATE', [drillId]);
    if (drillRows.length === 0) { await conn.rollback(); throw new Error('演练不存在'); }
    if (drillRows[0].status !== 'IN_PROGRESS') { await conn.rollback(); throw new Error('演练未在进行中'); }
    const drill = drillRows[0];

    const [dtRows] = await conn.query(
      'SELECT * FROM drill_tasks WHERE drill_id = ? AND task_id = ? FOR UPDATE',
      [drillId, taskId],
    );
    if (dtRows.length === 0) { await conn.rollback(); throw new Error('演练作业不存在'); }
    const dt = dtRows[0];
    if (dt.status !== 'IN_PROGRESS') { await conn.rollback(); throw new Error('作业未在进行中'); }

    const now = new Date();
    const startedAt = new Date(dt.started_at);
    const durationMs = now - startedAt;
    const durationMinutes = Math.ceil(durationMs / 60000);
    const isOvertime = durationMinutes > dt.time_limit_minutes;

    const nowStr = now.toISOString().slice(0, 23).replace('T', ' ');
    await conn.query(
      `UPDATE drill_tasks SET status = 'COMPLETED', finished_at = ?, duration_minutes = ?,
       is_overtime = ?, reported_by = ?, remarks = ?, updated_at = ? WHERE id = ?`,
      [nowStr, durationMinutes, isOvertime ? 1 : 0, reportedBy || null, remarks || dt.remarks, nowStr, dt.id],
    );

    const [remainingRows] = await conn.query(
      "SELECT COUNT(*) AS cnt FROM drill_tasks WHERE drill_id = ? AND status != 'COMPLETED'",
      [drillId],
    );
    if (remainingRows[0].cnt === 0) {
      const totalStart = new Date(drill.started_at);
      const totalDurationMs = now - totalStart;
      const totalDurationMinutes = Math.ceil(totalDurationMs / 60000);
      await conn.query(
        `UPDATE drills SET status = 'COMPLETED', finished_at = ?, total_duration_minutes = ? WHERE id = ?`,
        [nowStr, totalDurationMinutes, drillId],
      );
    }

    await conn.commit();
    return getDrillTask(dt.id);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function cancelDrill(drillId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM drills WHERE id = ? FOR UPDATE', [drillId]);
    if (rows.length === 0) { await conn.rollback(); throw new Error('演练不存在'); }
    if (rows[0].status === 'COMPLETED') { await conn.rollback(); throw new Error('已完成的演练不能取消'); }

    const now = new Date().toISOString().slice(0, 23).replace('T', ' ');
    await conn.query(
      "UPDATE drills SET status = 'CANCELLED', finished_at = ? WHERE id = ?",
      [now, drillId],
    );
    await conn.query(
      "UPDATE drill_tasks SET status = 'CANCELLED', updated_at = ? WHERE drill_id = ? AND status != 'COMPLETED'",
      [now, drillId],
    );
    await conn.commit();
    return getDrill(drillId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/* ---------- 实时进度与超时检查 ---------- */

async function getDrillProgress(drillId) {
  const drill = await getDrill(drillId);
  if (!drill) return null;
  const drillTasks = await listDrillTasks(drillId);
  const total = drillTasks.length;
  const completed = drillTasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgress = drillTasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const pending = total - completed - inProgress;

  const now = new Date();
  const currentElapsedMinutes = drill.status === 'IN_PROGRESS' && drill.startedAt
    ? Math.ceil((now - new Date(drill.startedAt)) / 60000)
    : (drill.totalDurationMinutes || 0);

  const overtimeTasks = drillTasks.filter((t) => {
    if (t.status === 'COMPLETED') return t.isOvertime;
    if (t.status === 'IN_PROGRESS' && t.startedAt) {
      const elapsed = Math.ceil((now - new Date(t.startedAt)) / 60000);
      return elapsed > t.timeLimitMinutes;
    }
    return false;
  });

  const isOverallOvertime = drill.status !== 'PENDING'
    && currentElapsedMinutes > drill.nationalTimeLimitMinutes;

  return {
    drill,
    total,
    completed,
    inProgress,
    pending,
    progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
    currentElapsedMinutes,
    isOverallOvertime,
    overtimeTasks,
    nationalTimeLimitMinutes: drill.nationalTimeLimitMinutes,
  };
}

/* ---------- 关键路径分析 ---------- */

async function findCriticalPath(drillId) {
  const drillTasks = await listDrillTasks(drillId);
  const structure = await getPlanFullStructure(drillTasks[0]?.taskSnapshot?.planVersionId);
  if (!structure) return null;

  const taskMap = new Map();
  for (const t of structure.tasks) {
    const dt = drillTasks.find((d) => d.taskId === t.id);
    taskMap.set(t.id, {
      ...t,
      duration: dt?.durationMinutes || t.timeLimitMinutes,
      status: dt?.status,
      isOvertime: dt?.isOvertime,
    });
  }

  const memo = new Map();
  function longestPath(taskId) {
    if (memo.has(taskId)) return memo.get(taskId);
    const task = taskMap.get(taskId);
    if (!task) return { path: [], duration: 0 };
    const prereqs = task.prerequisiteTaskIds || [];
    if (prereqs.length === 0) {
      const result = { path: [task], duration: task.duration };
      memo.set(taskId, result);
      return result;
    }
    let maxPath = [];
    let maxDuration = 0;
    for (const pid of prereqs) {
      const sub = longestPath(pid);
      if (sub.duration > maxDuration) {
        maxDuration = sub.duration;
        maxPath = sub.path;
      }
    }
    const result = {
      path: [...maxPath, task],
      duration: maxDuration + task.duration,
    };
    memo.set(taskId, result);
    return result;
  }

  let critical = { path: [], duration: 0 };
  for (const task of taskMap.values()) {
    const path = longestPath(task.id);
    if (path.duration > critical.duration) {
      critical = path;
    }
  }

  const bottlenecks = critical.path.filter((t) => t.isOvertime || t.status !== 'COMPLETED');
  return {
    criticalPath: critical.path.map((t) => ({
      id: t.id, name: t.name, duration: t.duration,
      timeLimitMinutes: t.timeLimitMinutes, isOvertime: t.isOvertime, status: t.status,
    })),
    totalDuration: critical.duration,
    bottlenecks: bottlenecks.map((t) => ({ id: t.id, name: t.name })),
  };
}

/* ---------- 演练评估报告 ---------- */

async function getDrillReport(drillId) {
  const drill = await getDrill(drillId);
  if (!drill) return null;
  const drillTasks = await listDrillTasks(drillId);
  const progress = await getDrillProgress(drillId);
  const critical = await findCriticalPath(drillId);

  const taskDetails = [];
  for (const dt of drillTasks) {
    const prereqs = await listTaskPrerequisites(dt.taskId);
    const equips = await listTaskEquipments(dt.taskId);
    taskDetails.push({
      drillTask: dt,
      prerequisiteNames: prereqs.map((p) => p.name),
      equipments: equips,
    });
  }

  const passedCount = drillTasks.filter((t) => t.status === 'COMPLETED' && !t.isOvertime).length;
  const failedCount = drillTasks.filter((t) => t.status === 'COMPLETED' && t.isOvertime).length;

  return {
    drill,
    summary: {
      totalTasks: drillTasks.length,
      completedTasks: drillTasks.filter((t) => t.status === 'COMPLETED').length,
      passedTasks: passedCount,
      failedTasks: failedCount,
      passRate: drillTasks.length > 0 ? Math.round((passedCount / drillTasks.length) * 100) : 0,
      totalDurationMinutes: drill.totalDurationMinutes,
      nationalTimeLimitMinutes: drill.nationalTimeLimitMinutes,
      isOverallOvertime: drill.totalDurationMinutes
        ? drill.totalDurationMinutes > drill.nationalTimeLimitMinutes
        : progress.isOverallOvertime,
    },
    taskDetails,
    progress,
    criticalPath: critical,
    generatedAt: new Date().toISOString(),
  };
}

/* ---------- 多轮演练对比 ---------- */

async function getDrillsComparison(projectId) {
  const drills = await listDrills({ projectId });
  const completed = drills.filter((d) => d.status === 'COMPLETED');
  const comparison = [];
  for (const d of completed) {
    const report = await getDrillReport(d.id);
    comparison.push({
      drillId: d.id,
      type: d.type,
      createdAt: d.createdAt,
      totalDurationMinutes: d.totalDurationMinutes,
      nationalTimeLimitMinutes: d.nationalTimeLimitMinutes,
      isOvertime: d.totalDurationMinutes > d.nationalTimeLimitMinutes,
      passRate: report.summary.passRate,
      completedTasks: report.summary.completedTasks,
      totalTasks: report.summary.totalTasks,
    });
  }
  const project = await getProject(projectId);
  return {
    project,
    totalDrills: drills.length,
    completedDrills: completed.length,
    trend: comparison,
  };
}

module.exports = {
  seed, isEmpty,
  findUserByUsername, getUser, listUsers, createUser,
  listProjects, getProject, findProjectByCode, createProject, updateProject, deleteProject,
  listEquipments, createEquipment,
  listInspections, createInspection,

  getPlanByProjectId, getPlan, createPlan, updatePlan,
  getLatestVersion, listPlanVersions, getPlanVersion, createPlanVersion,
  listTasksByVersion, getTask, createTask, updateTask, deleteTask,
  listTaskDependencies, listTaskPrerequisites, addTaskDependency, removeTaskDependency,
  listTaskEquipments, addTaskEquipment, removeTaskEquipment,
  getPlanFullStructure,

  listDrills, getDrill, createDrill,
  listDrillTasks, getDrillTask, getDrillTaskByDrillAndTask,
  checkPrerequisitesMet,
  startDrill, startDrillTask, finishDrillTask, cancelDrill,
  getDrillProgress, findCriticalPath, getDrillReport, getDrillsComparison,
  getNationalTimeLimit,
};
