/**
 * 多 Bot 启动入口
 * 读取 config.js 中的 bots 配置，依次启动各类型 Bot
 */
const path = require('path');
const config = require('../config');
const InventoryBot = require('./bots/inventory').InventoryBot;
const db = require('./db');

/**
 * 主函数：遍历 config.bots 并逐一启动
 */
async function main() {
    console.log('[启动器] ========== 多 Bot 框架启动 ==========');
    console.log(`[启动器] 共配置 ${config.bots.length} 个 Bot`);
    await db.init();

    // 支持命令行过滤：node src/index.js --bots inventory
    const args = process.argv.slice(2);
    const botsArgIndex = args.indexOf('--bots');
    let filterTypes = null;
    if (botsArgIndex !== -1 && args[botsArgIndex + 1]) {
        filterTypes = args[botsArgIndex + 1].split(',');
        console.log(`[启动器] 仅启动类型: ${filterTypes.join(', ')}`);
    }
    let bots = [];
    for (const botConfig of config.bots) {
        if (filterTypes && !filterTypes.includes(botConfig.type)) {
            console.log(`[启动器] 跳过 Bot: ${botConfig.username} (类型: ${botConfig.type})`);
            continue;
        }
        if (botConfig.type === 'inventory') {
            bots.push(new InventoryBot(botConfig));
        }
    }
    for (const bot of bots) {
        try {
            await bot.initBot();
        } catch (err) {
            console.error(`[启动器] Bot ${bot.username} 启动失败:`, err);
        }  
    }
    console.log('[启动器] ========== 所有 Bot 启动完成 ==========');
}

main().catch(err => {
    console.error('[启动器] 致命错误:', err);
    process.exit(1);
});
