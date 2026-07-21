const mineflayer = require('mineflayer');
const { ServerService } = require('./src/service/ServerService');
const { attachProtocolDiagnostics } = require('./src/utils');

const bot = mineflayer.createBot({
    host: process.env.MC_HOST || 'frp.uestc.world',
    port: Number(process.env.MC_PORT || 25565),
    username: process.env.MC_USERNAME || 'Elysia',
    version: process.env.MC_VERSION || '1.21.4'
});
attachProtocolDiagnostics(bot);

bot.serverService = new ServerService(bot, {
    targetServer: process.env.MC_TARGET_SERVER || 'survival',
    availableServers: ['creative', 'mirror', 'survival'],
    loginCommand: process.env.MC_LOGIN_COMMAND || '/login 123456',
    checkIntervalMs: 60 * 1000
});

bot.on('login', () => {
    console.log(`[Bot] 已登录: ${bot.username}，等待服务器认证提示`);
    bot.serverService.start();
});

bot.once('spawn', () => {
    console.log('[Bot] 已出生，执行首次服务器检查');
    bot.serverService.checkServer();
});

bot.on('message', (jsonMsg, position, sender) => {
    console.log(`[Bot] 聊天消息 - ${sender || 'system'}: ${jsonMsg.toString()}`);
});

bot.on('end', (reason) => console.log(`[Bot] 连接断开: ${reason}`));
bot.on('kicked', (reason) => console.log(`[Bot] 被踢出: ${reason}`));
bot.on('error', (err) => console.error('[Bot] 错误:', err.message));
