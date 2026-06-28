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
const { initPathfinder,gotoNear } = require('../../goto');
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
    }
    async initBot() {
        console.log(`[InventoryBot] 正在创建 Bot: ${this.username}`);
        this.bot = mineflayer.createBot({
            host: this.host,
            port: this.port,
            username: this.username,
            version: this.version
        });
        this.bot.version = this.version;
        this.bot.containerService = new ContainerService(this.bot, this.config);
        this.bot.deliverService = new DeliverService(this.bot, this.config);
        this.bot.keepAliveService = new KeepAliveService(this.bot, this.config);
        this.bot.playerService = new PlayerService(this.bot, this.config);
        this.bot.fakePlayerService = new FakePlayerService(this.bot, this.config);
        this.bot.taskQueueService = new TaskQueueService(this.bot);
        this.bot.litematicaService = new LitematicaService(this.bot, this.config);
        const buffer = new SharedArrayBuffer(16);
        const uint8 = new Uint8Array(buffer);
        Atomics.exchange(uint8, 0, 0);
        this.bot.setBusy = function () {
            return Atomics.exchange(uint8, 0, 1);
        }
        this.bot.unsetBusy = function (processQueue = true) {
            Atomics.exchange(uint8, 0, 0);
            if (processQueue) {
                void this.taskQueueService.processQueue();
            }
        };
        this.scheduleDailyScan();
        // ---------- 事件绑定 ----------

        this.bot.on('login', async () => {
            console.log(`[InventoryBot] ${this.bot.username} 已出生在游戏中`);
            await sleep(this.loginDelay);
            // 执行启动命令（如 /login 密码）
            for (const cmd of this.startupCommands) {
                console.log(`[InventoryBot] ${this.bot.username} 执行启动命令: ${cmd}`);
                this.bot.chat(cmd);
                await sleep(2000);
            }
            console.log(`[InventoryBot] ${this.bot.username} 初始化完成，开始工作`);
            initPathfinder(this.bot);

        });

        this.bot.on('end', (reason) => {
            console.log(`[InventoryBot] ${this.bot.username} 已断开: ${reason}`);
        });

        this.bot.on('error', (err) => {
            console.error(`[InventoryBot] ${this.bot.username} 错误:`, err);
        });

        this.bot.on('kicked', (reason) => {
            console.warn(`[InventoryBot] ${this.bot.username} 被踢出: ${reason}`);
        });
        // ---------- 返回 Promise，等待 spawn ----------
        return new Promise((resolve, reject) => {
            this.bot.once('spawn', () => resolve());
            this.bot.once('error', (err) => reject(err));
            // 超时处理
            const timeout = setTimeout(() => {
                reject(new Error(`${this.bot.username} 连接超时（30秒）`));
            }, 30000);
            this.bot.once('spawn', () => clearTimeout(timeout));
        });
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
