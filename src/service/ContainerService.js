const nbt = require('prismarine-nbt');
const varint = require('varint');
const db = require('../db');
const Vec3 = require('vec3');
const { sleep } = require('../utils');
const { gotoNear } = require('../goto');
class ContainerService {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.areas = config.areas;
        this.tid = 0;
        this.pendingQueries = new Map();
        this.responseQueue = [];
        this.isProcessingResponses = false;
        this.containerList = [];
        this.processed = 0;
        this.bot._client.on('nbt_query_response', (packet) => {
            const { chest, latency } = this.resolvePendingChest(packet);
            if (!chest || !packet.nbt) return;
            this.responseQueue.push({
                transactionId: packet.transactionId,
                chest,
                latency,
                nbt: packet.nbt,
                queuedAt: Date.now()
            });
            void this.processResponseQueue();
        });

        this.bot.on('chat', (username, message) => {
            if (message !== '!scan') {
                return;
            }
            if (this.busy) {
                this.bot.whisper(username, `[InventoryBot] ${this.bot.username} 正在忙碌，无法执行扫描命令`);
                console.log(`[InventoryBot] ${this.bot.username} 正在忙碌，无法执行扫描命令`);
                return;
            }
            this.busy = true;
            this.bot.containerService.startScanning().catch(err => {
                console.error(`[InventoryBot] ${this.bot.username} 扫描失败:`, err);
            }).finally(() => {
                this.busy = false;
            });
        });
    }
    sendPacket(x, y, z) {
        if (!this.bot || !this.bot._client || this.bot._client.socket.destroyed) {
            throw new Error('客户端连接已断开');
        }
        let transactionId = null;
        try {
            transactionId = this.tid++;
            const xBI = BigInt(x) & 0x3FFFFFFn;
            const yBI = BigInt(y) & 0xFFFn;
            const zBI = BigInt(z) & 0x3FFFFFFn;
            const posLong = (xBI << 38n) | (zBI << 12n) | yBI;
            const sentTime = Date.now();
            this.pendingQueries.set(transactionId, { x, y, z, sentTime });
            const packet = Buffer.concat([
                Buffer.from(varint.encode(0x01)),
                Buffer.from(varint.encode(transactionId)),
                Buffer.alloc(8)
            ]);
            packet.writeBigUInt64BE(posLong, packet.length - 8);
            this.bot._client.writeRaw(packet);
        } catch (e) {
            if (transactionId !== null) {
                this.pendingQueries.delete(transactionId);
            }
            throw new Error(`写入包失败: ${e.message}`);
        }
    }

    resolvePendingChest(packet) {
        const transactionId = packet?.transactionId;
        if (typeof transactionId !== 'number') {
            console.warn('[扫描] 收到缺少 transactionId 的 NBT 响应，已忽略');
            return { chest: null, latency: 0 };
        }

        const chestData = this.pendingQueries.get(transactionId);
        this.pendingQueries.delete(transactionId);

        if (!chestData) {
            console.warn(`[扫描] 未找到 transactionId=${transactionId} 对应的箱子坐标，响应已忽略`);
            return { chest: null, latency: 0 };
        }

        // 计算延迟（往返时间）
        const now = Date.now();
        const latency = now - chestData.sentTime;
        const chest = { x: chestData.x, y: chestData.y, z: chestData.z };

        return { chest, latency };
    }

    updateInventory(x, y, z, minecraftId, count) {
        const containerItems = db.getContainerItems(x, y, z);
        const oldCount = containerItems.length > 0 ? containerItems[0].count : 0;
        const itemTotal = db.getItemTotal(minecraftId);
        const newTotal = itemTotal - oldCount + count;
        db.setItemTotal(minecraftId, newTotal);
        db.upsertContainerItem(x, y, z, minecraftId, count);
    }

    async processResponseQueue() {
        if (this.isProcessingResponses) {
            return;
        }

        this.isProcessingResponses = true;

        try {
            while (this.responseQueue.length > 0) {
                const entry = this.responseQueue.shift();
                const queueDelay = Date.now() - entry.queuedAt;

                try {
                    const parseStart = Date.now();
                    const data = nbt.simplify(entry.nbt);
                    const parseCost = Date.now() - parseStart;
                    const items = data.Items || [];
                    let itemMap = new Map();
                    for (const item of items) {
                        if (item?.components?.['minecraft:container']) {
                            for (const component of item.components['minecraft:container']) {
                                const subItems = component.item;
                                if (subItems) {
                                    itemMap.set(subItems.id, (itemMap.get(subItems.id) || 0) + subItems.count);
                                }
                            }
                        } else {
                            itemMap.set(item.id, (itemMap.get(item.id) || 0) + item.count);
                        }
                    }
                    if (itemMap.size > 1) {
                        console.log(`[NBT解析] 存在杂箱, size=${itemMap.size}, items = ${JSON.stringify([...itemMap])},pos = (${entry.chest.x},${entry.chest.y},${entry.chest.z})`);
                    }
                    if (itemMap.size === 0) continue;
                    const [maxKey, maxCount] = [...itemMap].reduce(
                        (max, entry) => entry[1] > max[1] ? entry : max,
                        [null, 0]
                    );
                    db.upsertContainerItem(entry.chest.x, entry.chest.y, entry.chest.z, maxKey, maxCount);
                } catch (err) {

                    console.error(`[NBT解析失败] tid=${entry.transactionId} pos=(${entry.chest.x},${entry.chest.y},${entry.chest.z})`, err.stack);
                }
                this.processed++;
            }
        } finally {
            this.isProcessingResponses = false;
            if (this.responseQueue.length > 0) {
                void this.processResponseQueue();
            }
        }
    }
    buildContainerListArea(areaName) {
        const area = this.areas[areaName];
        if (!area || area.length !== 2) {
            console.error(`[扫描] 未找到区域: ${areaName}`);
            return;
        }
        const [start, end] = area;
        console.log(start, end);
        for (let x = Math.min(start.x, end.x); x <= Math.max(start.x, end.x); x++) {
            for (let y = Math.min(start.y, end.y); y <= Math.max(start.y, end.y); y++) {
                for (let z = Math.min(start.z, end.z); z <= Math.max(start.z, end.z); z++) {
                    const block = this.bot.world.getBlock(new Vec3(x, y, z));
                    if (block && block.name && this.getContainerTypes().has(block.name)) {
                        this.containerList.push({ x, y, z });
                    }
                }
            }
        }
    }
    buildContainerList() {
        this.containerList = [];
        console.log(this.areas);
        for (const areaName in this.areas) {
            this.buildContainerListArea(areaName);
        }
    }
    async scanLoop() {
        while (this.containerList.length > 0) {
            const container = this.containerList.shift();
            if (!container) continue;
            try {
                this.sendPacket(container.x, container.y, container.z);
                await sleep(10);
            } catch (err) {
                console.error(`[扫描] 扫描容器失败: (${container.x}, ${container.y}, ${container.z})`, err);
            }
        }
    }

    async startScanning() {
        this.processed = 0;
        this.buildContainerList();
        console.log(`[扫描] 待扫描容器数量: ${this.containerList.length}`);
        await this.scanLoop();
        db.recalculateItemTotals(this.config.center.x, this.config.center.z, true);
        console.log('[扫描] 扫描完成');
    }

    getContainerTypes() {
        return new Set([
            'chest', 'shulker_box', 'white_shulker_box', 'orange_shulker_box', 'magenta_shulker_box',
            'light_blue_shulker_box', 'yellow_shulker_box', 'lime_shulker_box', 'pink_shulker_box',
            'gray_shulker_box', 'light_gray_shulker_box', 'cyan_shulker_box', 'purple_shulker_box',
            'blue_shulker_box', 'brown_shulker_box', 'green_shulker_box', 'red_shulker_box', 'black_shulker_box'
        ]);
    }

    async clearInventory() {
        //   const result = await gotoNear(this.bot, new Vec3(config.center.x, config.center.y, config.center.z), 1);
        //     if (!result) console.log(`[清理] 无法到达中心点 (${config.center.x}, ${config.center.y}, ${config.center.z})`);
        //     const inventory = this.bot.inventory;
    }
}

module.exports = { ContainerService };
