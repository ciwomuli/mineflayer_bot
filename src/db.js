/**
 * 数据库模块
 * 
 * 使用 sql.js (纯 JS 实现的 SQLite) 管理三张表：
 * 1. item_translations — 物品 ID 与中英文名称对照
 * 2. item_totals      — 每种物品的全局总数量
 * 3. containers       — 所有容器的位置及其中存储的物品
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'bot.db');
const CSV_PATH = path.join(__dirname, '..', 'list.csv');

let db = null;           // sql.js Database 实例
let dbReady = false;     // 是否已完成初始化

/**
 * 初始化数据库：打开/创建、建表、导入翻译数据
 * @returns {Promise<void>}
 */
async function init() {
    if (dbReady) return;

    // 确保 data 目录存在
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const SQL = await initSqlJs();

    // 尝试从文件加载已有数据库，否则新建
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // ---------- 建表 ----------
    db.run(`
        CREATE TABLE IF NOT EXISTS item_translations (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            minecraft_id TEXT    UNIQUE NOT NULL,
            name_en      TEXT    NOT NULL,
            name_zh      TEXT    NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS item_totals (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            minecraft_id TEXT    UNIQUE NOT NULL,
            total_count  INTEGER NOT NULL DEFAULT 0,
            updated_at   TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS containers (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            x            INTEGER NOT NULL,
            y            INTEGER NOT NULL,
            z            INTEGER NOT NULL,
            minecraft_id TEXT    NOT NULL,
            count        INTEGER NOT NULL DEFAULT 0,
            updated_at   TEXT,
            UNIQUE(x, y, z)
        )
    `);

    // ---------- 从 CSV 初始化翻译表 ----------
    const countRow = db.exec('SELECT COUNT(*) AS cnt FROM item_translations');
    const rowCount = countRow.length > 0 ? countRow[0].values[0][0] : 0;

    if (rowCount === 0) {
        console.log('[DB] 翻译表为空，从 list.csv 导入...');
        await importTranslationsFromCSV();
    }

    dbReady = true;
    console.log('[DB] 数据库初始化完成');

    // 自动保存（每 30 秒）
    setInterval(saveToDisk, 30_000);
}

/**
 * 从 list.csv 导入翻译数据
 * 格式：minecraft,en_us,zh_cn
 */
async function importTranslationsFromCSV() {
    if (!fs.existsSync(CSV_PATH)) {
        console.warn(`[DB] CSV 文件不存在: ${CSV_PATH}`);
        return;
    }

    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim());

    // 跳过表头
    const insertStmt = db.prepare(
        'INSERT OR IGNORE INTO item_translations (minecraft_id, name_en, name_zh) VALUES (?, ?, ?)'
    );

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 3) continue;

        const minecraftId = cols[0].trim();
        const nameEn = cols[1].trim();
        const nameZh = cols.slice(2).join(',').trim();

        if (!minecraftId) continue;

        insertStmt.run([minecraftId, nameEn, nameZh]);
        imported++;
    }
    insertStmt.free();

    console.log(`[DB] 已从 CSV 导入 ${imported} 条翻译记录`);
    saveToDisk();
}

// ===================== 查询接口 =====================

/**
 * 根据 minecraft_id 获取翻译
 * @param {string} minecraftId
 * @returns {{ name_en: string, name_zh: string } | null}
 */
function getTranslation(minecraftId) {
    const result = db.exec(
        'SELECT name_en, name_zh FROM item_translations WHERE minecraft_id = ?',
        [minecraftId]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    const [name_en, name_zh] = result[0].values[0];
    return { name_en, name_zh };
}

/**
 * 根据中文名模糊搜索物品
 * @param {string} keyword - 中文关键词
 * @returns {Array<{ minecraft_id: string, name_en: string, name_zh: string }>}
 */
function searchByZhName(keyword) {
    const result = db.exec(
        'SELECT minecraft_id, name_en, name_zh FROM item_translations WHERE name_zh=?',
        [keyword]
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
        minecraft_id: row[0],
        name_en: row[1],
        name_zh: row[2]
    }));
}

// ===================== item_totals 操作 =====================

/**
 * 更新某个物品的全局总数量（增量）
 * @param {string} minecraftId
 * @param {number} delta - 变化量（正数为增加，负数为减少）
 */
function updateItemTotal(minecraftId, delta, save = false) {
    db.run(
        `INSERT INTO item_totals (minecraft_id, total_count, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(minecraft_id) DO UPDATE SET
             total_count = total_count + ?,
             updated_at = datetime('now')`,
        [minecraftId, delta, delta]
    );
    if (save) saveToDisk();
}

/**
 * 直接设置某个物品的全局总数量
 * @param {string} minecraftId
 * @param {number} count
 */
function setItemTotal(minecraftId, count, save = false) {
    db.run(
        `INSERT INTO item_totals (minecraft_id, total_count, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(minecraft_id) DO UPDATE SET
             total_count = ?,
             updated_at = datetime('now')`,
        [minecraftId, count, count]
    );
    if (save) saveToDisk();
}

/**
 * 获取某个物品的全局总数量
 * @param {string} minecraftId
 * @returns {number}
 */
function getItemTotal(minecraftId) {
    const result = db.exec(
        'SELECT total_count FROM item_totals WHERE minecraft_id = ?',
        [minecraftId]
    );
    if (result.length === 0 || result[0].values.length === 0) return 0;
    return result[0].values[0][0];
}

/**
 * 获取所有物品的总数量（带翻译）
 * @returns {Array<{ minecraft_id: string, name_zh: string, total_count: number }>}
 */
function getAllItemTotals() {
    const result = db.exec(`
        SELECT t.minecraft_id, tr.name_zh, t.total_count
        FROM item_totals t
        LEFT JOIN item_translations tr ON t.minecraft_id = tr.minecraft_id
        ORDER BY t.total_count DESC
    `);
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
        minecraft_id: row[0],
        name_zh: row[1] || row[0],
        total_count: row[2]
    }));
}

// ===================== containers 操作 =====================

/**
 * 记录/更新容器中某个物品的数量
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} minecraftId
 * @param {number} count
 */
function upsertContainerItem(x, y, z, minecraftId, count, save = false) {
    db.run(
        `INSERT INTO containers (x, y, z, minecraft_id, count, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(x, y, z) DO UPDATE SET
             count = ?,
             updated_at = datetime('now')`,
        [x, y, z, minecraftId, count, count]
    );
    if (save) saveToDisk();
}

/**
 * 获取指定容器内的所有物品
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {Array<{ minecraft_id: string, name_zh: string, count: number }>}
 */
function getContainerItems(x, y, z) {
    const result = db.exec(
        `SELECT c.minecraft_id, tr.name_zh, c.count
         FROM containers c
         LEFT JOIN item_translations tr ON c.minecraft_id = tr.minecraft_id
         WHERE c.x = ? AND c.y = ? AND c.z = ?`,
        [x, y, z]
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
        minecraft_id: row[0],
        name_zh: row[1] || row[0],
        count: row[2]
    }));
}

/**
 * 查找包含指定物品的所有容器
 * @param {string} minecraftId
 * @returns {Array<{ x: number, y: number, z: number, count: number }>}
 */
function findContainersWithItem(minecraftId) {
    const result = db.exec(
        'SELECT x, y, z, count FROM containers WHERE minecraft_id = ? ORDER BY count ASC',
        [minecraftId]
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
        x: row[0], y: row[1], z: row[2],
        count: row[3]
    }));
}

/**
 * 清空指定容器的记录（用于重新扫描）
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function clearContainer(x, y, z, save = false) {
    db.run('DELETE FROM containers WHERE x = ? AND y = ? AND z = ?', [x, y, z]);
    if (save) saveToDisk();
}

/**
 * 获取所有已记录的容器坐标（去重）
 * @returns {Array<{ x: number, y: number, z: number }>}
 */
function getAllContainerPositions() {
    const result = db.exec(
        'SELECT DISTINCT x, y, z FROM containers ORDER BY y, x, z'
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => ({ x: row[0], y: row[1], z: row[2] }));
}

/**
 * 根据 containers 表重新计算并更新 item_totals
 * 在计算前，先将 x 轴或 z 轴上相邻且物品类型相同的容器合并，
 * 保留距离中心 (x, z) 最近的那个，累加计数。
 *
 * @param {number} cx - 中心 x 坐标
 * @param {number} cz - 中心 z 坐标
 * @param {boolean} save - 是否立即保存到磁盘
 * @returns {number} 更新的物品种类数
 */
function recalculateItemTotals(cx, cz, save = false) {
    // ---------- 1. 读取所有容器条目 ----------
    const allResult = db.exec('SELECT x, y, z, minecraft_id, count FROM containers');
    if (!allResult.length || !allResult[0].values.length) return 0;

    const entries = allResult[0].values.map(row => ({
        x: row[0], y: row[1], z: row[2],
        minecraft_id: row[3],
        count: row[4]
    }));

    // ---------- 2. 合并相邻且同类型的容器 ----------
    // 遍历每对容器，如果 y 相同、物品类型相同、且 x 或 z 坐标只差 1，
    // 则将数量合并到距离中心 (cx, cz) 更近的那个容器中
    const absorbed = new Set();
    let mergedCount = 0;

    for (let i = 0; i < entries.length; i++) {
        if (absorbed.has(i)) continue;
        for (let j = i + 1; j < entries.length; j++) {
            if (absorbed.has(j)) continue;
            const a = entries[i];
            const b = entries[j];
            if (a.y !== b.y) continue;
            if (a.minecraft_id !== b.minecraft_id) continue;

            const dx = Math.abs(a.x - b.x);
            const dz = Math.abs(a.z - b.z);
            if ((dx === 1 && dz === 0) || (dx === 0 && dz === 1)) {
                // 计算各自到中心的曼哈顿距离
                const distA = Math.abs(a.x - cx) + Math.abs(a.z - cz);
                const distB = Math.abs(b.x - cx) + Math.abs(b.z - cz);

                if (distA <= distB) {
                    a.count += b.count;
                    absorbed.add(j);
                } else {
                    b.count += a.count;
                    absorbed.add(i);
                    break; // i 已被吸收，跳到下一个 i
                }
            }
        }
    }

    // 过滤掉已被吸收的条目
    const remaining = entries.filter((_, i) => !absorbed.has(i));

    // 删除被吸收的容器，更新保留容器的数量
    for (const idx of absorbed) {
        const e = entries[idx];
        clearContainer(e.x, e.y, e.z);
    }
    for (const e of remaining) {
        upsertContainerItem(e.x, e.y, e.z, e.minecraft_id, e.count);
    }

    mergedCount = absorbed.size;
    if (mergedCount > 0) {
        console.log(`[DB] 已合并 ${mergedCount} 个相邻容器`);
    }

    // ---------- 5. 汇总所有容器，写入 item_totals ----------
    const result = db.exec(`
        SELECT minecraft_id, SUM(count) AS total
        FROM containers
        GROUP BY minecraft_id
    `);
    if (result.length === 0) return 0;

    const rows = result[0].values;
    const stmt = db.prepare(
        `INSERT INTO item_totals (minecraft_id, total_count, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(minecraft_id) DO UPDATE SET
             total_count = ?,
             updated_at = datetime('now')`
    );

    for (const [minecraftId, total] of rows) {
        stmt.run([minecraftId, total, total]);
    }
    stmt.free();

    console.log(`[DB] 已从 containers 重新计算 ${rows.length} 种物品的总量`);
    if (save) saveToDisk();
    return rows.length;
}

/**
 * 将数据库保存到磁盘
 */
function saveToDisk() {
    if (!db) return;
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
        console.error('[DB] 保存失败:', err.message);
    }
}

/**
 * 获取原始 sql.js Database 实例（供高级操作使用）
 * @returns {import('sql.js').Database}
 */
function getDB() {
    return db;
}

/**
 * 关闭数据库
 */
function close() {
    if (db) {
        saveToDisk();
        db.close();
        db = null;
        dbReady = false;
        console.log('[DB] 数据库已关闭');
    }
}

module.exports = {
    init,
    close,
    getDB,
    saveToDisk,

    // 翻译表
    getTranslation,
    searchByZhName,

    // 物品总量表
    updateItemTotal,
    setItemTotal,
    getItemTotal,
    getAllItemTotals,
    recalculateItemTotals,

    // 容器表
    upsertContainerItem,
    getContainerItems,
    findContainersWithItem,
    clearContainer,
    getAllContainerPositions,
};
