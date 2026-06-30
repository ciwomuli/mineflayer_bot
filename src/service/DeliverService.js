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
        this.full = false;
        for (let i = 0; i < this.config.deliverNum; i++) {
            this.delivers.push("deliver_" + (i + 1));
        }
        this.using_delivers = [];
        this.bot.on('chat', this.handleDeliverRequest.bind(this));
        this.bot.on('whisper', this.handleDeliverRequest.bind(this));
        this.bot.on("playerLeft", (player) => {
            const index = this.using_delivers.indexOf(player.username);
            if (index !== -1) {
                this.using_delivers.splice(index, 1);
                const name = player.username;
                this.delivers.push(player.username);
                console.log(`[DeliverService] 玩家 ${player.username} 离开，释放假人`);
                this.bot.taskQueueService.addTask(async () => {
                    const player = await this.bot.fakePlayerService.spawnFakePlayer(name);
                    await sleep(2000);
                    await this.bot.fakePlayerService.cleanFakePlayerInventory(player);
                    await this.bot.fakePlayerService.killFakePlayer(player.username);
                    await sleep(2000);
                    await this.bot.playerService.clearInventory();
                }, "release_fake_player", false).catch(err => {
                    console.error(`[DeliverService] 释放假人 ${name} 失败:`, err);
                });
            }
        });
    }
    async handleDeliverRequest(username, message) {
        if (message.startsWith('!deliver') || message.startsWith('!dv')) {
            const parts = message.split(' ');
            if (parts.length < 3) {
                this.bot.whisper(username, `[InventoryBot] ${this.bot.username} 交付命令格式错误，请使用: !deliver <物品ID> <数量>`);
                console.log(`[InventoryBot] ${this.bot.username} 交付命令格式错误，请使用: !deliver <物品ID> <数量>`);
                return;
            }
            let itemId = parts[1];
            const quantity = parseInt(parts[2]);
            if (isNaN(quantity) || quantity <= 0) {
                this.bot.whisper(username, `[InventoryBot] ${this.bot.username} 交付命令数量错误，请使用正整数`);
                console.log(`[InventoryBot] ${this.bot.username} 交付命令数量错误，请使用正整数`);
                return;
            }
            if (!itemId.startsWith('minecraft:')) {
                const result = db.searchByZhName(itemId);
                if (result.length === 0) {
                    this.bot.whisper(username, `[InventoryBot] ${this.bot.username} 交付命令物品ID错误，未在数据库中找到 ${itemId}`);
                    console.log(`[InventoryBot] ${this.bot.username} 交付命令物品ID错误，未在数据库中找到 ${itemId}`);
                    return;
                }
                itemId = "minecraft:" + result[0].minecraft_id;
            }
            if (!db.getItemTotal(itemId)) {
                this.bot.whisper(username, `[InventoryBot] ${this.bot.username} 交付命令物品ID错误，未在数据库中找到 ${itemId}`);
                console.log(`[InventoryBot] ${this.bot.username} 交付命令物品ID错误，未在数据库中找到 ${itemId}`);
                return;
            }
            if (this.bot.setBusy()) {
                this.bot.whisper(username, `[InventoryBot] ${this.bot.username} 正在忙碌，无法执行交付命令`);
                console.log(`[InventoryBot] ${this.bot.username} 正在忙碌，无法执行交付命令`);
                return;
            }
            this.DeliverItem(username, itemId, quantity).catch(err => {
                console.error(`[DeliverService] ${this.bot.username} 交付失败:`, err);
            }).finally(() => {
                this.bot.unsetBusy();
            });
        }
    }
    async fetchItemWithContainer(containerBlock, id, quantity, shulkerBox = false, quickShulkerBox = false) {
        try {
            const rawQuantity = quantity;
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
                } else if (slot.name.includes('shulker_box') && slot?.components[0]?.data?.contents) {
                    availableshulkerBox.push([slot.slot, countShulkerBox(slot, id)]);
                }
            }
            availableItems.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
            availableshulkerBox.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
            while (quantity > 0 && (availableItems.length > 0 || availableshulkerBox.length > 0)) {
                const emptySlot = container.firstEmptySlotRange(container.inventoryStart, container.inventoryEnd - 9);
                if (emptySlot == null) {
                    this.full = true;
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
            db.updateContainerItem(containerBlock.position.x, containerBlock.position.y, containerBlock.position.z, "minecraft:" + id, quantity - rawQuantity);
            db.updateItemTotal("minecraft:" + id, quantity - rawQuantity, true);
            db.saveToDisk();
            return { quantity, usedSlots };
        } catch (err) {
            console.error(`[DeliverService] 获取物品失败: ${err.stack}`);
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
            await this.goto(container.x, container.y, container.z);
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
                await this.goto(container_shulker.x, container_shulker.y, container_shulker.z);
                ({ quantity, usedSlots } = await this.fetchItemWithContainer(block_shulker, id, quantity, shulkerBox, false));
            }
            while (quantity > 0) {
                const rawQuantity = quantity;
                if (block_item && this.bot.containerService.getContainerTypes().has(block_item.name)) {
                    await this.goto(container_item.x, container_item.y, container_item.z);
                    let usedSlots_tmp = [];
                    ({ quantity, usedSlots: usedSlots_tmp } = await this.fetchItemWithContainer(block_item, id, quantity, false, true));
                    usedSlots = usedSlots.concat(usedSlots_tmp);
                    await sleep(2000);
                    if (quantity == rawQuantity) {
                        if (!this.full)
                            console.log(`[DeliverService] 容器 (${container_item.x}, ${container_item.y}, ${container_item.z}) 中没有足够的 ${id}`);
                        break;
                    }
                } else {
                    console.log(`[DeliverService] 容器 (${container_item.x}, ${container_item.y}, ${container_item.z}) 不存在`);
                    break;
                }
            }
        } else {
            console.log(`[DeliverService] 找到多个容器包含 ${id}，请检查数据库`);
            console.log(containers);
        }
        return { quantity, usedSlots };
    }

    async DeliverItem(username, id, quantity) {
        this.bot.whisper(username, `正在为你交付 ${quantity} 个 ${id}，请稍等`);
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
        this.bot.chat(`/tellraw ${username} ["",{"text":"记得【"},{"text":"杀死假人","bold":true,"underlined":true,"color":"dark_red","clickEvent":{"action":"run_command","value":"/player ${fakePlayerName} kill"}},{"text":"】"}]`)
        this.delivers.push(fakePlayerName);
        await gotoNear(this.bot, this.config.center.x, this.config.center.y, this.config.center.z, 1);
    }

    async stocking(itemList, carrierName) {
        const containerService = this.bot.containerService;
        const sortableItems = itemList.map((item, index) => ({
            item,
            index,
            container: db.findContainersWithItem(item.id).find(container => container.count > 0) || null
        }));
        sortableItems.sort((a, b) =>
            containerService.compareContainerScanOrder(a.container, b.container) || a.index - b.index
        );
        itemList.splice(0, itemList.length, ...sortableItems.map(({ item }) => item));

        console.log(itemList);
        await this.bot.playerService.clearInventory();
        let lackList = [];
        this.full = false;
        let first = true;
        let carrierId = 1;
        while (itemList.length > 0) {
            const { id, count } = itemList[0];
            let { quantity, usedSlots } = await this.fetchItem(id, count, true);
            if (quantity <= 0) itemList.shift();
            else if (quantity == count && !this.full) {
                lackList.push({ id, count });
                itemList.shift();
            } else {
                itemList[0].count = quantity;
            }
            if (this.full) {
                if (await this.packing(carrierName + '_' + carrierId, first, false)) {
                    carrierId++;
                }
                first = false;
                this.full = false;
            }
        }
        if (await this.packing(carrierName + '_' + carrierId, first, true)) {
            carrierId++;
            await this.packing(carrierName + '_' + carrierId, first, true);
        }
        await gotoNear(this.bot, this.config.center.x, this.config.center.y, this.config.center.z, 1);
        return lackList;
    }

    async packing(carrierName, first = false, last = false) {
        await gotoNear(this.bot, this.config.packingStanding.x, this.config.packingStanding.y, this.config.packingStanding.z, 1);
        const boxBlock = this.bot.world.getBlock(new Vec3(this.config.packingBox.x, this.config.packingBox.y, this.config.packingBox.z));
        const switchBlock = this.bot.world.getBlock(new Vec3(this.config.packingSwitch.x, this.config.packingSwitch.y, this.config.packingSwitch.z));
        const chestBlock = this.bot.world.getBlock(new Vec3(this.config.packingChest.x, this.config.packingChest.y, this.config.packingChest.z));
        if (!boxBlock || !switchBlock || !chestBlock) {
            console.error(`[DeliverService] 打包点的箱子、开关或箱子不存在`);
            return false;
        }
        let chestUsedSlots = [];
        if (first) {
            const packingBox = await this.bot.openContainer(boxBlock);
            let hasItems = false;
            for (let i = 0; i < 27; i++) {
                if (packingBox.slots[i] != null) {
                    hasItems = true;
                    break;
                }
            }
            packingBox.close();
            if (hasItems) {
                await this.bot.activateBlock(switchBlock);
                await sleep(2000);
                const packingChest = await this.bot.openContainer(chestBlock);
                for (let i = 0; i < 27; i++) {
                    if (packingChest.slots[i] != null) {
                        chestUsedSlots.push(i);
                    }
                }
                packingChest.close();
            }
        }
        const packingBox = await this.bot.openContainer(boxBlock);
        let boxFull = false;
        let boxEmpty = true;
        for (let i = 0; i < 27; i++) {
            if (packingBox.slots[i] == null) {
                for (let j = 27; j < 54; j++) {
                    if (packingBox.slots[j] != null && !packingBox.slots[j].name.includes("shulker_box")) {
                        await this.bot.simpleClick.leftMouse(j);
                        await this.bot.simpleClick.leftMouse(i);
                        boxEmpty = false;
                        if (i == 26) {
                            boxFull = true;
                        }
                        break;
                    }
                }
            }
        }
        packingBox.close();
        if (boxFull || last) {
            await this.bot.activateBlock(switchBlock);
            await sleep(2000);
            const packingChest = await this.bot.openContainer(chestBlock);
            for (let i = 0; i < 27; i++) {
                if (packingChest.slots[i] != null && packingChest.slots[i].name.includes("shulker_box") && !chestUsedSlots.includes(i)) {
                    const emptySlot = packingChest.firstEmptySlotRange(packingChest.inventoryStart, packingChest.inventoryEnd - 9);
                    if (emptySlot != null) {
                        await this.bot.simpleClick.leftMouse(i);
                        await this.bot.simpleClick.leftMouse(emptySlot);
                    }
                }
            }
            packingChest.close();
        }
        const carrier = await this.bot.fakePlayerService.spawnFakePlayer(carrierName);
        await sleep(2000);
        const carrierContainer = await this.bot.openContainer(carrier.entity);
        let carrierFull = true;
        for (let i = 18; i < 18 + 27; i++) {
            if (carrierContainer.slots[i] == null) {
                carrierFull = false;
                for (let j = 54; j < 54 + 27; j++) {
                    if (carrierContainer.slots[j] != null && carrierContainer.slots[j].name.includes("shulker_box")) {
                        await this.bot.simpleClick.leftMouse(j);
                        await this.bot.simpleClick.leftMouse(i);
                        break;
                    }
                }
            }
        }
        carrierContainer.close();
        await this.bot.fakePlayerService.killFakePlayer(carrierName);
        if (carrierFull) {
            return true;
        }
        return false;
    }

    getStandPos(x, y, z) {
        // 判断点是否属于某个区域
        let matchedArea = null;
        for (const [areaName, bounds] of Object.entries(this.config.areas)) {
            const [p1, p2] = bounds;
            const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
            const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
            const minZ = Math.min(p1.z, p2.z), maxZ = Math.max(p1.z, p2.z);
            if (x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ) {
                matchedArea = areaName;
                break;
            }
        }

        // 不属于任何区域，直接返回原始坐标
        if (!matchedArea) {
            return { x, y, z };
        }

        // 寻找最近的 walkPath 点并补全缺失维度
        const walkPath = this.config.walkPath[matchedArea];
        if (!walkPath || walkPath.length === 0) {
            return { x, y, z };
        }

        let nearestDist = Infinity;
        let nearestPoint = null;

        for (const wp of walkPath) {
            const px = wp.x !== undefined ? wp.x : x;
            const py = wp.y !== undefined ? wp.y : y;
            const pz = wp.z !== undefined ? wp.z : z;
            const dist = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestPoint = { x: px, y: py, z: pz };
            }
        }

        return nearestPoint;
    }
    goto(x, y, z) {
        const standPos = this.getStandPos(x, y, z);
        return gotoNear(this.bot, standPos.x, standPos.y, standPos.z, 0);
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
