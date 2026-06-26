class PlayerService {
    constructor(bot) {
        this.bot = bot;
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
}

module.exports = { PlayerService };