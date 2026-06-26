const db = require('../db');
const Vec3 = require('vec3');
const { sleep } = require('../utils');
const { gotoNear } = require('../goto');
class DeliverService {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.busy = false;
        this.delivers = [];
        for (let i = 0; i < this.config.deliverNum; i++) {
            this.delivers.push("deliver_" + (i + 1));
        }
        this.using_delivers = [];
        this.bot.on('chat', (username, message) => {
            if (message.startsWith('!deliver') || message.startsWith('!dv')) {
                if (this.busy) {
                    this.bot.whisper(username, `[InventoryBot] ${this.bot.username} 正在忙碌，无法执行交付命令`);
                    console.log(`[InventoryBot] ${this.bot.username} 正在忙碌，无法执行交付命令`);
                    return;
                }
                this.busy = true;
                const parts = message.split(' ');
                if (parts.length < 3) {
                    this.bot.whisper(username, `[InventoryBot] ${this.bot.username} 交付命令格式错误，请使用: !deliver <物品ID> <数量>`);
                    console.log(`[InventoryBot] ${this.bot.username} 交付命令格式错误，请使用: !deliver <物品ID> <数量>`);
                    this.busy = false;
                    return;
                }
                let itemId = parts[1];
                const quantity = parseInt(parts[2]);
                if (isNaN(quantity) || quantity <= 0) {
                    this.bot.whisper(username, `[InventoryBot] ${this.bot.username} 交付命令数量错误，请使用正整数`);
                    console.log(`[InventoryBot] ${this.bot.username} 交付命令数量错误，请使用正整数`);
                    this.busy = false;
                    return;
                }
                if (!itemId.startsWith('minecraft:')) {
                    const result = db.searchByZhName(itemId);
                    if (result.length === 0) {
                        this.bot.whisper(username, `[InventoryBot] ${this.bot.username} 交付命令物品ID错误，未在数据库中找到 ${itemId}`);
                        console.log(`[InventoryBot] ${this.bot.username} 交付命令物品ID错误，未在数据库中找到 ${itemId}`);
                        this.busy = false;
                        return;
                    }
                    itemId = "minecraft:" + result[0].minecraft_id;
                }
                if (!db.getItemTotal(itemId)) {
                    this.bot.whisper(username, `[InventoryBot] ${this.bot.username} 交付命令物品ID错误，未在数据库中找到 ${itemId}`);
                    console.log(`[InventoryBot] ${this.bot.username} 交付命令物品ID错误，未在数据库中找到 ${itemId}`);
                    this.busy = false;
                    return;
                }
                this.DeliverItem(username, itemId, quantity).catch(err => {
                    console.error(`[DeliverService] ${this.bot.username} 交付失败:`, err);
                }).finally(() => {
                    this.busy = false;
                });
            }
        });
        this.bot.on("playerLeft", (player) => {
            const index = this.using_delivers.indexOf(player.username);
            if (index !== -1) {
                this.using_delivers.splice(index, 1);
                this.delivers.push(player.username);
                console.log(`[DeliverService] 玩家 ${player.username} 离开，释放假人`);
            }
        });
    }

    async fetchItemWithContainer(containerBlock, id, quantity, shulkerBox = false, quickShulkerBox = false) {
        try {
            //去掉id开头的minecraft:前缀
            if (id.startsWith('minecraft:')) {
                id = id.substring(10);
            }
            const container = await this.bot.openContainer(containerBlock);
            const slots = container.itemsRange(0, container.inventoryStart);
            let availableItems = [];
            let availableshulkerBox = [];
            let usedSlots = [];
            for (const slot of slots) {
                if (slot.name == id) {
                    availableItems.push([slot.slot, slot.count]);
                } else if (slot.name.includes('shulker_box')) {
                    availableshulkerBox.push([slot.slot, countShulkerBox(slot, id)]);
                }
            }
            availableItems.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
            availableshulkerBox.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
            while (quantity > 0 && (availableItems.length > 0 || availableshulkerBox.length > 0)) {
                const emptySlot = container.firstEmptySlotRange(container.inventoryStart, container.inventoryEnd);
                if (emptySlot == null) {
                    break;
                }
                usedSlots.push(emptySlot - container.inventoryStart);
                if (quantity > this.config.shulkerBoxThereHold && availableshulkerBox.length > 0 && shulkerBox) {
                    const [slot, count] = availableshulkerBox.shift();
                    await this.bot.simpleClick.leftMouse(slot);
                    await this.bot.simpleClick.leftMouse(emptySlot);
                    quantity -= count;
                } else if (availableItems.length > 0) {
                    const [slot, count] = availableItems.shift();
                    await this.bot.simpleClick.leftMouse(slot);
                    if (quantity > count) {
                        await this.bot.simpleClick.leftMouse(emptySlot);
                        quantity -= count;
                    } else {
                        for (let i = 0; i < quantity; i++) {
                            await this.bot.simpleClick.rightMouse(emptySlot);
                        }
                        await this.bot.simpleClick.leftMouse(slot);
                        quantity = 0;
                    }
                } else if (availableshulkerBox.length > 0 && quickShulkerBox) {
                    const [slot, count] = availableshulkerBox[0];
                    await this.bot.simpleClick.leftMouse(slot);
                    await this.bot.simpleClick.rightMouse(emptySlot);
                    await this.bot.simpleClick.leftMouse(slot);
                    await sleep(1000);
                    const takeCount = container?.slots[emptySlot]?.count || 0;
                    if (takeCount == 0) {
                        console.log('Failed to take items from shulker box');
                        break;
                    }
                    quantity -= takeCount;
                    if (takeCount < count) {
                        availableshulkerBox[0][1] -= takeCount;
                    } else {
                        availableshulkerBox.shift();
                    }
                } else {
                    break;
                }
            }
            container.close();
            return { quantity, usedSlots };
        } catch (err) {
            console.error(`[DeliverService] 获取物品失败: ${err.message}`);
            return { quantity, usedSlots: [] };
        }
    }
    async fetchItem(id, quantity, shulkerBox = false) {
        const rawQuantity = quantity;
        let containers = db.findContainersWithItem(id);
        containers = containers.filter(c => {
            if (c.count <= 0) {
                return false;
            }
            return true;
        });

        let usedSlots = [];
        if (containers.length === 0) {
            console.log(`[DeliverService] 未找到包含 ${id} 的容器`);
            return { quantity, usedSlots: [] };
        } else if (containers.length == 1) {
            const container = containers[0];
            await gotoNear(this.bot, container.x, container.y, container.z, 5);
            const block = this.bot.world.getBlock(new Vec3(container.x, container.y, container.z));
            if (!block || !this.bot.containerService.getContainerTypes().has(block.name)) {
                console.log(`[DeliverService] 容器 (${container.x}, ${container.y}, ${container.z}) 不存在`);
                return { quantity, usedSlots: [] };
            }
            ({ quantity, usedSlots } = await this.fetchItemWithContainer(block, id, quantity, shulkerBox, true));
        } else if (containers.length == 2) {
            const container_item = containers[0];
            const container_shulker = containers[1];
            const block_item = this.bot.world.getBlock(new Vec3(container_item.x, container_item.y, container_item.z));
            const block_shulker = this.bot.world.getBlock(new Vec3(container_shulker.x, container_shulker.y, container_shulker.z));
            if (block_shulker && this.bot.containerService.getContainerTypes().has(block_shulker.name)
                && quantity > this.config.shulkerBoxThereHold && shulkerBox) {
                await gotoNear(this.bot, container_shulker.x, container_shulker.y, container_shulker.z, 5);
                ({ quantity, usedSlots } = await this.fetchItemWithContainer(block_shulker, id, quantity, shulkerBox, false));
            }
            while (quantity > 0) {
                const rawQuantity = quantity;
                if (block_item && this.bot.containerService.getContainerTypes().has(block_item.name)) {
                    await gotoNear(this.bot, container_item.x, container_item.y, container_item.z, 5);
                    let usedSlots_tmp = [];
                    ({ quantity, usedSlots: usedSlots_tmp } = await this.fetchItemWithContainer(block_item, id, quantity, false, true));
                    usedSlots = usedSlots.concat(usedSlots_tmp);
                    await sleep(2000);
                    if (quantity == rawQuantity) {
                        console.log(`[DeliverService] 容器 (${container_item.x}, ${container_item.y}, ${container_item.z}) 中没有足够的 ${id}`);
                        break;
                    }
                } else {
                    console.log(`[DeliverService] 容器 (${container_item.x}, ${container_item.y}, ${container_item.z}) 不存在`);
                    break;
                }
            }
        }
        return { quantity, usedSlots };
    }

    async DeliverItem(username, id, quantity) {
        let { quantity: unfetchedQuantity, usedSlots } = await this.fetchItem(id, quantity, true);
        let pos = await this.bot.playerService.getPlayerPosition(username);
        pos.y += 1; // 提升一格，避免假人卡在地面
        if (!pos) {
            console.log(`[DeliverService] 未找到玩家 ${username} 的位置`);
            return;
        }
        const fakePlayerName = this.delivers.shift();
        let fakePlayer = await this.bot.fakePlayerService.spawnFakePlayer(fakePlayerName);
        await sleep(2000);
        await this.bot.fakePlayerService.fillFakePlayerInventory(fakePlayer, usedSlots);
        await this.bot.fakePlayerService.killFakePlayer(fakePlayerName);
        await this.bot.fakePlayerService.spawnFakePlayer(fakePlayerName, pos);
        this.using_delivers.push(fakePlayerName);
        this.bot.whisper(username, `已将 ${quantity - unfetchedQuantity}/${quantity} 个 ${id} 交付给你，请在假人 ${fakePlayerName} 处领取`);
        this.delivers.push(fakePlayerName);
        await gotoNear(this.bot, this.config.center.x, this.config.center.y, this.config.center.z, 1);
    }

}
function countShulkerBox(slot, id) {
    let total = 0;
    for (const item of slot.components[0].data.contents) {
        total += item.itemCount;
    }
    return total;
}
module.exports = { DeliverService };