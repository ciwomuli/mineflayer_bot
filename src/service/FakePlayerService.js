class FakePlayerService {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
    }
    async spawnFakePlayer(name, pos = null) {
        return new Promise((resolve) => {
            if (pos) {
                if (pos.dimension == "Nether") pos.dimension = "the_nether";
                if (pos.dimension == "End") pos.dimension = "the_end";
                this.bot.chat(`/player ${name} spawn at ${pos.x} ${pos.y} ${pos.z} facing 0 0 in minecraft:${pos.dimension}`);
            } else {
                this.bot.chat(`/player ${name} spawn`);
            }

            const onPlayerJoined = (player) => {
                if (player.username === name) {
                    this.bot.removeListener('playerJoined', onPlayerJoined);
                    clearTimeout(timer);
                    resolve(player);
                }
            };

            const timer = setTimeout(() => {
                this.bot.removeListener('playerJoined', onPlayerJoined);
                resolve(null);
            }, 20000);

            this.bot.on('playerJoined', onPlayerJoined);
        });
    }

    async killFakePlayer(name) {
        return new Promise((resolve) => {
            this.bot.chat(`/player ${name} kill`);
            const onPlayerLeft = (player) => {
                if (player.username === name) {
                    clearTimeout(timer);
                    this.bot.removeListener('playerLeft', onPlayerLeft);
                    resolve(true);
                }
            };

            const timer = setTimeout(() => {
                this.bot.removeListener('playerLeft', onPlayerLeft);
                resolve(false);
            }, 20000);

            this.bot.on('playerLeft', onPlayerLeft);
        });
    }

    async fillFakePlayerInventory(player, usedSlots) {
        try {
            const container = await this.bot.openContainer(player.entity);
            let freeSlots = [];
            for (let i = 18; i < 18 + 27; i++) {
                if (container.slots[i] == null) {
                    freeSlots.push(i);
                }
            }
            if (freeSlots.length < usedSlots.length) {
                console.error(`[FakePlayerService] 假人 ${player.username} 的空闲槽位不足，无法填充物品`);
                return;
            }
            for (let i = 0; i < usedSlots.length; i++) {
                const slot = usedSlots[i] + 9 * 6;
                const freeSlot = freeSlots[i];
                await this.bot.simpleClick.leftMouse(slot);
                await this.bot.simpleClick.leftMouse(freeSlot);
            }
        } catch (err) {
            console.error(`[FakePlayerService] 打开假人容器失败: ${err.message}`);
        }
    }
    async cleanFakePlayerInventory(player) {
        try {
            const container = await this.bot.openContainer(player.entity);
            let usedSlots = [];
            let freeSlots = [];
            for (let i = 18; i < 18 + 27; i++) {
                if (container.slots[i] != null) {
                    usedSlots.push(i);
                }
            }
            for (let i = 54; i < 54 + 27; i++) {
                if (container.slots[i] == null) {
                    freeSlots.push(i);
                }
            }
            if (freeSlots.length < usedSlots.length) {
                console.error(`[FakePlayerService] 玩家 ${player.username} 的空闲槽位不足，无法清空物品`);
                return;
            }
            for (let i = 0; i < usedSlots.length; i++) {
                const usedSlot = usedSlots[i];
                const freeSlot = freeSlots[i];
                await this.bot.simpleClick.leftMouse(usedSlot);
                await this.bot.simpleClick.leftMouse(freeSlot);
            }

        } catch (err) {
            console.error(`[FakePlayerService] 打开假人容器失败: ${err.stack}`);
        }
    }
}

module.exports = { FakePlayerService };