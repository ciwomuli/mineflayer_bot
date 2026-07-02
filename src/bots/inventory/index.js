/**
 * 库存管理 Bot 模块
 * 
 * @module inventory
 * @description 负责物品库存管理、物品扫描、物品存取等操作
 */
const mineflayer = require('mineflayer');
const { ContainerService } = require('../../service/ContainerService');
const { DeliverService } = require('../../service/DeliverService');
const { KeepAliveService } = require('../../service/KeepAliveService');
const { PlayerService } = require('../../service/PlayerService');
const { FakePlayerService } = require('../../service/FakePlayerService');
const { TaskQueueService } = require('../../service/TaskQueueService');
const { LitematicaService } = require('../../service/LitematicaService');
const { sleep } = require('../../utils');
const { initPathfinder, gotoNear } = require('../../goto');
class InventoryBot {
    constructor(options) {
        this.username = options.username;
        this.host = options.host;
        this.port = options.port;
        this.loginDelay = options.loginDelay || 1000;
        this.startupCommands = options.startupCommands || [];
        this.config = options.config || {};
        this.version = options.version || '1.21.4';
        this.bot = null;
        this.dailyScanTimer = null;
        this.initialReconnectDelay = 30 * 1000;
        this.maxReconnectDelay = 30 * 60 * 1000;
        this.reconnectDelay = this.initialReconnectDelay;
        this.reconnectTimer = null;
        this.connectionPromise = null;
    }
    async initBot() {
        if (this.connectionPromise) return this.connectionPromise;

        this.connectionPromise = this.connect();
        try {
            await this.connectionPromise;
        } catch (err) {
            this.scheduleReconnect(err.message);
            throw err;
        } finally {
            this.connectionPromise = null;
        }
    }

    async connect() {
        console.log(`[InventoryBot] 正在创建 Bot: ${this.username}`);
        const bot = mineflayer.createBot({
            host: this.host,
            port: this.port,
            username: this.username,
            version: this.version
        });
        let disconnected = false;
        this.bot = bot;
        bot.version = this.version;
        bot.containerService = new ContainerService(bot, this.config);
        bot.deliverService = new DeliverService(bot, this.config);
        bot.keepAliveService = new KeepAliveService(bot, this.config);
        bot.playerService = new PlayerService(bot, this.config);
        bot.fakePlayerService = new FakePlayerService(bot, this.config);
        bot.taskQueueService = new TaskQueueService(bot);
        bot.litematicaService = new LitematicaService(bot, this.config);
        const buffer = new SharedArrayBuffer(16);
        const uint8 = new Uint8Array(buffer);
        Atomics.exchange(uint8, 0, 0);
        bot.setBusy = function () {
            return Atomics.exchange(uint8, 0, 1);
        }
        bot.unsetBusy = function (processQueue = true) {
            Atomics.exchange(uint8, 0, 0);
            if (processQueue) {
                void this.taskQueueService.processQueue();
            }
        };
        // ---------- 事件绑定 ----------

        bot.on('login', async () => {
            console.log(`[InventoryBot] ${bot.username} 已出生在游戏中`);
            await sleep(this.loginDelay);
            // 执行启动命令（如 /login 密码）
            for (const cmd of this.startupCommands) {
                if (disconnected || bot !== this.bot) return;
                console.log(`[InventoryBot] ${bot.username} 执行启动命令: ${cmd}`);
                bot.chat(cmd);
                await sleep(2000);
            }
            if (disconnected || bot !== this.bot) return;
            console.log(`[InventoryBot] ${bot.username} 初始化完成，开始工作`);
            initPathfinder(bot);
            bot.playerService.startTrackingJoins();

        });

        bot.on('spawn', () => {
            this.bot.inventory.on('updateSlot', (slot, oldItem, newItem) => { });
            console.log(`[InventoryBot] ${bot.username} 已出生，开始监听物品栏更新`);
            if (bot !== this.bot) return;
            this.reconnectDelay = this.initialReconnectDelay;
            this.clearReconnectTimer();
            this.scheduleDailyScan();
        });

        bot.on('end', (reason) => {
            disconnected = true;
            if (bot !== this.bot) return;
            console.log(`[InventoryBot] ${bot.username} 已断开: ${reason}`);
            if (this.dailyScanTimer) {
                clearTimeout(this.dailyScanTimer);
                this.dailyScanTimer = null;
            }
            this.scheduleReconnect(reason);
        });

        bot.on('error', (err) => {
            console.error(`[InventoryBot] ${bot.username} 错误:`, err);
        });

        bot.on('kicked', (reason) => {
            console.warn(`[InventoryBot] ${bot.username} 被踢出: ${reason}`);
        });
        // ---------- 返回 Promise，等待 spawn ----------
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                callback(value);
            };

            bot.once('spawn', () => finish(resolve));
            bot.once('error', (err) => finish(reject, err));
            bot.once('end', (reason) => {
                finish(reject, new Error(`${bot.username} 连接已断开: ${reason}`));
            });
            // 超时处理
            const timeout = setTimeout(() => {
                finish(reject, new Error(`${bot.username} 连接超时（30秒）`));
                bot.end('connectTimeout');
            }, 30000);
        });
    }

    scheduleReconnect(reason) {
        if (this.reconnectTimer) return;

        const delay = this.reconnectDelay;
        console.log(`[InventoryBot] ${this.username} 将在 ${delay / 1000} 秒后重连（原因: ${reason}）`);
        this.reconnectDelay = Math.min(delay * 2, this.maxReconnectDelay);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.initBot().catch(err => {
                console.error(`[InventoryBot] ${this.username} 重连失败:`, err);
                this.scheduleReconnect(err.message);
            });
        }, delay);
    }

    clearReconnectTimer() {
        if (!this.reconnectTimer) return;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }

    getNextDailyScanTime(now = new Date()) {
        const next = new Date(now);
        next.setHours(4, 0, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        return next;
    }

    scheduleDailyScan() {
        if (this.dailyScanTimer) clearTimeout(this.dailyScanTimer);

        const now = new Date();
        const nextScan = this.getNextDailyScanTime(now);
        console.log(`[InventoryBot] ${this.username} 下一次定时扫描: ${nextScan.toLocaleString()}`);

        this.dailyScanTimer = setTimeout(() => {
            this.dailyScanTimer = null;
            this.bot.taskQueueService.addTask(async () => {
                try {
                    await this.bot.containerService.startScanning();
                } catch (err) {
                    console.error(`[InventoryBot] ${this.bot.username} 定时扫描失败:`, err);
                }
            }, 'scan').catch(err => {
                console.error(`[InventoryBot] ${this.bot.username} 添加定时扫描任务失败:`, err);
            }).finally(() => {
                this.scheduleDailyScan();
            });
        }, nextScan.getTime() - now.getTime());
    }

    // async commandScan(args) {
    //     if (this.busy) {
    //         this.bot.say(`[InventoryBot] ${this.bot.username} 正在忙碌，无法执行扫描命令`);
    //         console.log(`[InventoryBot] ${this.bot.username} 正在忙碌，无法执行扫描命令`);
    //         return;
    //     }
    //     this.busy = true;
    //     await this.bot.containerService.startScanning().catch(err => {
    //         console.error(`[InventoryBot] ${this.bot.username} 扫描失败:`, err);
    //     }).finally(() => {
    //         this.busy = false;
    //     });
    // }
    // async commandDeliver(requester, args) {
    //     if (this.busy) {
    //         this.bot.say(`[InventoryBot] ${this.bot.username} 正在忙碌，无法执行交付命令`);
    //         console.log(`[InventoryBot] ${this.bot.username} 正在忙碌，无法执行交付命令`);
    //         return;
    //     }
    //     this.busy = true;
    //     this.busy = false;
    // }
}



module.exports = { InventoryBot };
