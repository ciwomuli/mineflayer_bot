const mcData = require('minecraft-data')('1.21');
const { gotoNear } = require('../goto');
class KeepAliveService {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.bot.on('health', () => {
            if (this.bot.health == 20) {
                return;
            }
            if (this.bot.busy) {
                console.log(`[KeepAliveService] ${this.bot.username} 正在忙碌，跳过自动回血`);
                return;
            }
            this.bot.busy = true;
            this.eatGoldenCarrots().finally(() => {
                this.bot.busy = false;
            });
        });
        this.bot.on('chat', (username, message) => {
            if (username === this.bot.username) return;
            if (message == "!eat") {
                if (this.bot.busy) {
                    console.log(`[KeepAliveService] ${this.bot.username} 正在忙碌，跳过手动回血`);
                    return;
                }
                this.bot.busy = true;
                this.eatGoldenCarrots().finally(() => {
                    this.bot.busy = false;
                });
            }
        });
    }
    async eatGoldenCarrots() {
        try {
            // 查找背包中的金胡萝卜
            let goldenCarrot = this.bot.inventory.items().find(item =>
                item.name === 'golden_carrot'
            );

            // 如果金胡萝卜小于64个，先补充
            if (!goldenCarrot || goldenCarrot.count < 32 && this.config.restockGoldenCarrots) {
                console.log('\x1b[33m%s\x1b[0m', '[保活] 金胡萝卜不足64个，开始补充...');
                await this.bot.deliverService.fetchItem("minecraft:golden_carrot", 64, false);
                // 重新查找
                goldenCarrot = this.bot.inventory.items().find(item =>
                    item.name === 'golden_carrot'
                );
            }

            if (!goldenCarrot) {
                console.log('\x1b[31m%s\x1b[0m', '[保活] 补充后背包中仍没有金胡萝卜！');
                return;
            }

            console.log(`\x1b[36m%s\x1b[0m`, `[保活] 找到 ${goldenCarrot.count} 个金胡萝卜`);

            // 吃金胡萝卜直到饱和度满（20.0）或没有更多金胡萝卜
            while (this.bot.food < 20.0 && goldenCarrot.count > 0) {
                console.log(`\x1b[36m%s\x1b[0m`, `[保活] 正在吃金胡萝卜，当前饱和度: ${this.bot.foodSaturation}`);

                // 装备到手上
                await this.bot.equip(goldenCarrot, 'hand');

                // 吃掉
                await this.bot.consume();

                // 等待一下
                await new Promise(resolve => setTimeout(resolve, 1000));

                // 重新查找（因为数量可能变化）
                const updatedCarrot = this.bot.inventory.items().find(item =>
                    item.name === 'golden_carrot'
                );

                if (!updatedCarrot || updatedCarrot.count === 0) {
                    console.log('\x1b[33m%s\x1b[0m', '[保活] 金胡萝卜已用完');
                    break;
                }

                goldenCarrot.count = updatedCarrot.count;
            }
            await gotoNear(this.bot, this.config.center.x, this.config.center.y, this.config.center.z, 1);
            console.log(`\x1b[32m%s\x1b[0m`, `[保活] 吃完金胡萝卜，当前饱和度: ${this.bot.food}`);

        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', '[保活] 吃金胡萝卜时出错:', error.message);
        }
    }
}

module.exports = { KeepAliveService };