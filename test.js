const mineflayer = require('mineflayer');
const Vec3 = require('vec3');
const { initPathfinder, gotoNear } = require('./src/goto');
const { DeliverService } = require('./src/service/DeliverService');
const { FakePlayerService } = require('./src/service/FakePlayerService');
const { PlayerService } = require('./src/service/PlayerService');
const { LitematicaService } = require('./src/service/LitematicaService');
const { sleep } = require('./src/utils');
const BOT_CONFIG = {
    host: 'frp.uestc.world',
    port: 25565,
    username: 'test',
    // auth: 'offline',  // 离线模式（正版服务器需要注释此行）
};

const bot = mineflayer.createBot(BOT_CONFIG);
// ---------- 基础事件 ----------

bot.on('login', async () => {
});

bot.once('spawn', async () => {
    bot.chat('/login 123456');
    await sleep(5000);
    console.log(bot.tablist);
});

bot.on('login', () => {
    console.log(`[Bot] 已登录: ${bot.username}`);
});

bot.on('end', (reason) => {
    console.log(`[Bot] 连接断开: ${reason}`);
});

bot.on('kicked', (reason) => {
    console.log(`[Bot] 被踢出: ${reason}`);
});

bot.on('error', (err) => {
    console.error('[Bot] 错误:', err.message);
});

// bot.on('chat', async (username, message) => {
//     // const chest0 = bot.world.getBlock(new Vec3(5, -60, 39));
//     // const args = message.split(' ');
//     // const num = parseInt(args[1], 10);
//     // const shulkerBox = args[2] === 'true';
//     // deliverService.fetchItem(chest0, "gold_ingot", num, shulkerBox);
//     if (message == "test") {
//         playerService.getPlayerPosition("ciwomuli");
//     }
// });

// bot.on('playerJoined', (player) => {
//     console.log(`[Bot] 玩家加入: ${player.username}`);
// });

// bot.on('playerLeft', (player) => {
//     console.log(`[Bot] 玩家离开: ${player.username}`);
// });

// // 导出供外部使用
// module.exports = { bot, gotoNear };
