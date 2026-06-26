const { gotoNear } = require("../goto");
const { sleep } = require("../utils");
const Vec3 = require("vec3");
class PlayerService {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.bot.on('chat', (username, message) => {
            if (message == "!clear") {
                if (this.bot.setBusy()) {
                    console.log(`[PlayerService] ${this.bot.username} 正在忙碌，跳过清理背包`);
                    return;
                }
                this.clearInventory().finally(() => {
                    this.bot.unsetBusy();
                });
            }
        });
    }
    async getPlayerPosition(name) {
        return new Promise((resolve) => {
            const onChat = (jsonMsg, position, sender, verified) => {
                //ciwomuli @ createWorld.customize.preset.overworld [-26, -60, 268] [+V] [+X] -> [-3, -60, 33]
                //TODO: 提取维度名和坐标
                const msgText = jsonMsg.toString();
                const regex = new RegExp(`${name} @ (.+) \\[(-?\\d+), (-?\\d+), (-?\\d+)\\] \\[`);
                const match = msgText.match(regex);
                if (match) {
                    const dimension = match[1].split('.').pop();
                    const x = parseInt(match[2], 10);
                    const y = parseInt(match[3], 10);
                    const z = parseInt(match[4], 10);
                    console.log(`[PlayerService] 玩家 ${name} 的位置: (${x}, ${y}, ${z}) in ${dimension}`);
                    this.bot.removeListener('message', onChat);
                    clearTimeout(timer);
                    resolve({ dimension, x, y, z });
                }
            };
            this.bot.on('message', onChat);
            this.bot.chat(`!!whereis ${name}`);
            const timer = setTimeout(() => {
                this.bot.removeListener('message', onChat);
                try {
                } catch (_) {
                    // 忽略停止时的错误
                }
                resolve(false);
            }, 20000);
        });
    }
    async clearInventory() {
        console.log(`[清理] ${this.bot.username} 开始清理背包`);
        const result = await gotoNear(this.bot, this.config.center.x, this.config.center.y, this.config.center.z, 0);
        if (!result) {
            console.log(`[清理] 无法到达中心点 (${this.config.center.x}, ${this.config.center.y}, ${this.config.center.z})`);
            return;
        }
        await this.bot.lookAt(new Vec3(this.config.dropPoint.x, this.config.dropPoint.y, this.config.dropPoint.z), true);
        await sleep(1000);
        for (let i = 9; i < 9 + 27; i++) {
            if (this.bot.inventory.slots[i]) {
                console.log(`[清理] ${this.bot.username} 扔掉物品: ${this.bot.inventory.slots[i].name} x${this.bot.inventory.slots[i].count}`);
                await this.bot.tossStack(this.bot.inventory.slots[i])
                await sleep(100);
            }
        }
    }
}

module.exports = { PlayerService };