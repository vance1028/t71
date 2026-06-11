-- 人防工程管理平台 - 表结构（MySQL）

-- 用户（登录与角色）
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(64)  NOT NULL DEFAULT '',
    role          VARCHAR(16)  NOT NULL DEFAULT 'INSPECTOR',
    department    VARCHAR(128) NOT NULL DEFAULT '',
    status        VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 人防工程档案
CREATE TABLE IF NOT EXISTS projects (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    code            VARCHAR(48)  NOT NULL,
    name            VARCHAR(128) NOT NULL,
    type            VARCHAR(32)  NOT NULL DEFAULT 'COMBINED',
    protection_level VARCHAR(16) NOT NULL DEFAULT '6',
    area_sqm        DECIMAL(12,2) NOT NULL DEFAULT 0,
    address         VARCHAR(255) NOT NULL DEFAULT '',
    district        VARCHAR(64)  NOT NULL DEFAULT '',
    peacetime_use   VARCHAR(128) NOT NULL DEFAULT '',
    status          VARCHAR(16)  NOT NULL DEFAULT 'NORMAL',
    completed_at    DATE         NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_projects_code (code),
    KEY idx_projects_status (status),
    KEY idx_projects_district (district)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 工程内的设备设施
CREATE TABLE IF NOT EXISTS equipments (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    project_id  BIGINT       NOT NULL,
    name        VARCHAR(128) NOT NULL,
    category    VARCHAR(32)  NOT NULL DEFAULT 'OTHER',
    model       VARCHAR(64)  NOT NULL DEFAULT '',
    install_date DATE        NULL,
    status      VARCHAR(16)  NOT NULL DEFAULT 'NORMAL',
    created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_equip_project (project_id),
    CONSTRAINT fk_equip_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 检查/维护记录
CREATE TABLE IF NOT EXISTS inspections (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    project_id   BIGINT       NOT NULL,
    inspector_id BIGINT       NULL,
    inspect_date DATE         NOT NULL,
    type         VARCHAR(16)  NOT NULL DEFAULT 'ROUTINE',
    result       VARCHAR(16)  NOT NULL DEFAULT 'PASS',
    issues       VARCHAR(1000) NOT NULL DEFAULT '',
    created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_insp_project (project_id),
    KEY idx_insp_date (inspect_date),
    CONSTRAINT fk_insp_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_insp_user FOREIGN KEY (inspector_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 平战转换 ==========

-- 平战转换预案主表（按工程）
CREATE TABLE IF NOT EXISTS conversion_plans (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    project_id     BIGINT       NOT NULL,
    name           VARCHAR(128) NOT NULL,
    description    VARCHAR(500) NOT NULL DEFAULT '',
    status         VARCHAR(16)  NOT NULL DEFAULT 'DRAFT',
    created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_plan_project (project_id),
    CONSTRAINT fk_plan_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 预案版本（快照，不可修改）
CREATE TABLE IF NOT EXISTS conversion_plan_versions (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    plan_id         BIGINT       NOT NULL,
    version         INT          NOT NULL,
    change_summary  VARCHAR(500) NOT NULL DEFAULT '',
    snapshot        JSON         NOT NULL,
    created_by      BIGINT       NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_version_plan_ver (plan_id, version),
    KEY idx_version_plan (plan_id),
    CONSTRAINT fk_version_plan FOREIGN KEY (plan_id) REFERENCES conversion_plans (id) ON DELETE CASCADE,
    CONSTRAINT fk_version_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 转换作业项（归属于某个版本）
CREATE TABLE IF NOT EXISTS conversion_tasks (
    id                   BIGINT       NOT NULL AUTO_INCREMENT,
    plan_version_id      BIGINT       NOT NULL,
    name                 VARCHAR(128) NOT NULL,
    description          VARCHAR(500) NOT NULL DEFAULT '',
    sort_order           INT          NOT NULL DEFAULT 0,
    time_limit_minutes   INT          NOT NULL,
    responsible_user_id  BIGINT       NULL,
    responsible_team     VARCHAR(64)  NOT NULL DEFAULT '',
    created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_task_version (plan_version_id),
    CONSTRAINT fk_task_version FOREIGN KEY (plan_version_id) REFERENCES conversion_plan_versions (id) ON DELETE CASCADE,
    CONSTRAINT fk_task_user FOREIGN KEY (responsible_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 作业项依赖关系（DAG）
CREATE TABLE IF NOT EXISTS conversion_task_dependencies (
    id                      BIGINT NOT NULL AUTO_INCREMENT,
    task_id                 BIGINT NOT NULL,
    prerequisite_task_id    BIGINT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_dep_task_pre (task_id, prerequisite_task_id),
    KEY idx_dep_task (task_id),
    KEY idx_dep_pre (prerequisite_task_id),
    CONSTRAINT fk_dep_task FOREIGN KEY (task_id) REFERENCES conversion_tasks (id) ON DELETE CASCADE,
    CONSTRAINT fk_dep_pre FOREIGN KEY (prerequisite_task_id) REFERENCES conversion_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 作业项关联设备
CREATE TABLE IF NOT EXISTS conversion_task_equipments (
    id             BIGINT NOT NULL AUTO_INCREMENT,
    task_id        BIGINT NOT NULL,
    equipment_id   BIGINT NOT NULL,
    action_note    VARCHAR(255) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    UNIQUE KEY uk_equip_task_equip (task_id, equipment_id),
    KEY idx_equip_task (task_id),
    KEY idx_equip_equip (equipment_id),
    CONSTRAINT fk_equip_task FOREIGN KEY (task_id) REFERENCES conversion_tasks (id) ON DELETE CASCADE,
    CONSTRAINT fk_equip_equip FOREIGN KEY (equipment_id) REFERENCES equipments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 演练记录
CREATE TABLE IF NOT EXISTS drills (
    id                          BIGINT       NOT NULL AUTO_INCREMENT,
    project_id                  BIGINT       NOT NULL,
    plan_version_id             BIGINT       NOT NULL,
    type                        VARCHAR(16)  NOT NULL DEFAULT 'SIMULATION',
    status                      VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    national_time_limit_minutes INT          NOT NULL,
    started_at                  DATETIME(3)  NULL,
    finished_at                 DATETIME(3)  NULL,
    total_duration_minutes      INT          NULL,
    remarks                     VARCHAR(1000) NOT NULL DEFAULT '',
    created_by                  BIGINT       NULL,
    created_at                  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_drill_project (project_id),
    KEY idx_drill_status (status),
    KEY idx_drill_created (created_at),
    CONSTRAINT fk_drill_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_drill_version FOREIGN KEY (plan_version_id) REFERENCES conversion_plan_versions (id),
    CONSTRAINT fk_drill_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 演练作业实例（快照+不可篡改，全程留痕）
CREATE TABLE IF NOT EXISTS drill_tasks (
    id                   BIGINT       NOT NULL AUTO_INCREMENT,
    drill_id             BIGINT       NOT NULL,
    task_id              BIGINT       NOT NULL,
    task_snapshot        JSON         NOT NULL,
    status               VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    started_at           DATETIME(3)  NULL,
    finished_at          DATETIME(3)  NULL,
    duration_minutes     INT          NULL,
    time_limit_minutes   INT          NOT NULL,
    is_overtime          TINYINT(1)   NOT NULL DEFAULT 0,
    reported_by          BIGINT       NULL,
    remarks              VARCHAR(500) NOT NULL DEFAULT '',
    created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_drilltask_drill_task (drill_id, task_id),
    KEY idx_drilltask_drill (drill_id),
    KEY idx_drilltask_status (status),
    CONSTRAINT fk_drilltask_drill FOREIGN KEY (drill_id) REFERENCES drills (id) ON DELETE CASCADE,
    CONSTRAINT fk_drilltask_task FOREIGN KEY (task_id) REFERENCES conversion_tasks (id),
    CONSTRAINT fk_drilltask_reporter FOREIGN KEY (reported_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
