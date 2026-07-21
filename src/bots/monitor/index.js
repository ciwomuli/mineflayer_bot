const fs = require('fs');
const path = require('path');
const util = require('util');
const mineflayer = require('mineflayer');
const { sleep, attachProtocolDiagnostics } = require('../../utils');
const { ServerService } = require('../../service/ServerService');

const DEFAULT_SAMPLE_INTERVAL_MS = 1000;
const DEFAULT_INFO_INTERVAL_MS = 60 * 1000;

function textOf(value) {
    if (value == null) return '';
    return typeof value.toString === 'function' ? value.toString() : String(value);
}

function formatReason(reason) {
    if (typeof reason === 'string') return reason;
    return util.inspect(reason, {
        depth: null,
        colors: false,
        compact: false,
        maxArrayLength: null,
        maxStringLength: null
    });
}

function parseNumber(value) {
    if (!value) return null;
    const number = Number(String(value).replace(',', '.'));
    return Number.isFinite(number) ? number : null;
}

/**
 * Extract the common "used / total MB" form used by server information plugins.
 * The raw message is also written to CSV so a new server-specific format is not lost.
 */
function parseMemory(message) {
    const normalized = String(message).replace(/,/g, '.');
    const pair = normalized.match(/(\d+(?:\.\d+)?)\s*(Ki?B|Mi?B|Gi?B|KB|MB|GB)\s*\/\s*(\d+(?:\.\d+)?)\s*(Ki?B|Mi?B|Gi?B|KB|MB|GB)\s*(?:\(\s*(\d+(?:\.\d+)?)\s*%\s*\))?/i);
    if (!pair) return { usedMb: null, totalMb: null, percent: null };

    const toMb = (value, unit) => {
        const number = parseNumber(value);
        if (number == null) return null;
        const normalizedUnit = unit.toLowerCase();
        if (normalizedUnit.startsWith('g')) return number * 1024;
        if (normalizedUnit.startsWith('k')) return number / 1024;
        return number;
    };
    const usedMb = toMb(pair[1], pair[2]);
    const totalMb = toMb(pair[3], pair[4]);
    return {
        usedMb,
        totalMb,
        // The optional fifth capture is the percentage immediately following
        // the memory pair, not an earlier CPU-usage percentage in !!info.
        percent: pair[5] ? parseNumber(pair[5]) : (usedMb != null && totalMb ? Number((usedMb / totalMb * 100).toFixed(2)) : null)
    };
}

function parseLightQueue(message) {
    const normalized = String(message).replace(/,/g, '.');
    // Carpet's lightQueue logger renders this tablist line after /log lightQueue:
    // LQ(O) +0.0/gt S: 0 T: 0.0gt
    const tablistMatch = normalized.match(/(?:^|\n)\s*LQ\(([^)]+)\)\s*([+-]?\d+(?:\.\d+)?)\/gt\s+S:\s*(-?\d+(?:\.\d+)?)\s+T:\s*([+-]?\d+(?:\.\d+)?)gt\s*(?:$|\n)/im);
    if (tablistMatch) {
        return {
            value: parseNumber(tablistMatch[2]),
            pending: parseNumber(tablistMatch[3]),
            mode: tablistMatch[1],
            timePerTick: parseNumber(tablistMatch[4]),
            subscribed: true
        };
    }
    const queue = normalized.match(/(?:light\s*queue|lightqueue|光照队列)[^\d-]*(-?\d+(?:\.\d+)?)/i);
    const pending = normalized.match(/(?:pending|queued|队列中|待处理)[^\d-]*(-?\d+(?:\.\d+)?)/i);
    return {
        value: queue ? parseNumber(queue[1]) : null,
        pending: pending ? parseNumber(pending[1]) : null
    };
}

function parseTablistMetrics(message) {
    const normalized = String(message).replace(/,/g, '.');
    const tps = normalized.match(/\bTPS:\s*([+-]?\d+(?:\.\d+)?)\s+MSPT:\s*([+-]?\d+(?:\.\d+)?)/i);
    const lightIo = normalized.match(/\bLight\s+I\/O:\s*([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)/i);
    const lightQueue = parseLightQueue(normalized);
    return {
        tps: tps ? parseNumber(tps[1]) : null,
        mspt: tps ? parseNumber(tps[2]) : null,
        lightQueueRateGt: lightQueue.value,
        lightQueueSize: lightQueue.pending,
        lightQueueTimeGt: lightQueue.timePerTick ?? null,
        lightIoCurrent: lightIo ? parseNumber(lightIo[1]) : null,
        lightIoAverage: lightIo ? parseNumber(lightIo[2]) : null
    };
}

class MonitorBot {
    constructor(options) {
        this.options = options;
        this.username = options.username;
        this.host = options.host;
        this.port = options.port;
        this.version = options.version || '1.21.4';
        this.loginCommand = options.loginCommand || '';
        this.targetServer = options.targetServer || 'mirror';
        this.availableServers = options.availableServers || [];
        this.startupCommands = options.startupCommands || [];
        this.loginDelay = options.loginDelay || 1000;
        this.subscribeDelay = options.config?.subscribeDelayMs || 3000;
        this.sampleIntervalMs = options.config?.sampleIntervalMs || DEFAULT_SAMPLE_INTERVAL_MS;
        this.infoIntervalMs = options.config?.infoIntervalMs || DEFAULT_INFO_INTERVAL_MS;
        this.infoWindowMs = options.config?.infoWindowMs || 15000;
        this.csvPath = path.resolve(process.cwd(), options.config?.csvPath || 'data/light-queue-monitor.csv');
        this.bot = null;
        this.sampleTimer = null;
        this.infoTimer = null;
        this.subscribeTimer = null;
        this.latestLightQueue = { raw: '', value: null, pending: null };
        this.latestMemory = { raw: '', usedMb: null, totalMb: null, percent: null, requestedAt: null };
        this.infoWindowEndsAt = 0;
        this.subscribed = false;
        this.reconnectTimer = null;
        this.reconnectDelay = 30 * 1000;
    }

    async initBot() {
        return this.connect();
    }

    async connect() {
        console.log(`[MonitorBot] connecting ${this.username} to ${this.host}:${this.port}`);
        const bot = mineflayer.createBot({
            host: this.host,
            port: this.port,
            username: this.username,
            version: this.version
        });
        attachProtocolDiagnostics(bot);
        this.bot = bot;
        this.subscribed = false;
        let disconnected = false;

        bot.serverService = new ServerService(bot, {
            targetServer: this.targetServer,
            availableServers: this.availableServers,
            loginCommand: this.loginCommand
        });
        bot.on('message', (message) => this.handleMessage(message));
        bot.on('login', async () => {
            await sleep(this.loginDelay);
            if (disconnected || this.bot !== bot) return;
            for (const command of this.startupCommands) {
                if (disconnected || this.bot !== bot) return;
                bot.chat(command);
                await sleep(2000);
            }
            if (!disconnected && this.bot === bot) bot.serverService.start();
        });

        bot.once('spawn', () => {
            if (this.bot !== bot) return;
            this.reconnectDelay = 30 * 1000;
            console.log('[MonitorBot] spawned; waiting for lightQueue subscription');
        });

        bot.on('end', (reason) => {
            disconnected = true;
            if (this.bot !== bot) return;
            this.stopSampling();
            console.warn(`[MonitorBot] disconnected: ${reason}`);
            this.scheduleReconnect(reason);
        });
        bot.on('error', (error) => console.error('[MonitorBot] error:', error.message));
        bot.on('kicked', (reason) => console.warn(`[MonitorBot] kicked:\n${formatReason(reason)}`));

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('monitor connection timed out after 30 seconds')), 30000);
            bot.once('spawn', () => {
                clearTimeout(timeout);
                resolve();
            });
            bot.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            bot.once('end', (reason) => {
                clearTimeout(timeout);
                reject(new Error(`monitor disconnected before spawn: ${reason}`));
            });
        });
    }

    startSampling() {
        this.stopSampling();
        this.ensureCsvHeader();
        this.sample();
        this.requestInfo();
        this.sampleTimer = setInterval(() => this.sample(), this.sampleIntervalMs);
        this.infoTimer = setInterval(() => this.requestInfo(), this.infoIntervalMs);
    }

    stopSampling() {
        clearInterval(this.sampleTimer);
        clearInterval(this.infoTimer);
        clearTimeout(this.subscribeTimer);
        this.sampleTimer = null;
        this.infoTimer = null;
        this.subscribeTimer = null;
    }

    requestInfo() {
        if (!this.bot) return;
        this.latestMemory.requestedAt = new Date().toISOString();
        this.infoWindowEndsAt = Date.now() + this.infoWindowMs;
        this.bot.chat('!!info');
    }

    handleMessage(message) {
        const raw = textOf(message).trim();
        if (!raw) return;
        const currentServer = ServerService.parseCurrentServer(raw);
        if (currentServer && currentServer.toLowerCase() === this.targetServer.toLowerCase()) {
            this.subscribeToLightQueue();
        }
        if (/(?:light\s*queue|lightqueue|光照队列)/i.test(raw)) {
            this.latestLightQueue = { raw, ...parseLightQueue(raw) };
        }
        if (Date.now() <= this.infoWindowEndsAt || /(?:memory|mem(?:ory)?|内存)/i.test(raw)) {
            const memory = parseMemory(raw);
            if (memory.usedMb != null || /(?:memory|mem(?:ory)?|内存)/i.test(raw)) {
                this.latestMemory = { raw, ...memory, requestedAt: this.latestMemory.requestedAt };
            }
        }
    }

    subscribeToLightQueue() {
        if (this.subscribed || this.subscribeTimer || !this.bot) return;
        const tablistText = `${textOf(this.bot.tablist?.header)}\n${textOf(this.bot.tablist?.footer)}`;
        const existingSubscription = parseLightQueue(tablistText);
        if (existingSubscription.subscribed) {
            this.latestLightQueue = { raw: tablistText, ...existingSubscription };
            this.subscribed = true;
            this.startSampling();
            console.log('[MonitorBot] lightQueue is already subscribed; tablist sampling started');
            return;
        }
        this.subscribeTimer = setTimeout(() => {
            this.subscribeTimer = null;
            if (!this.bot || this.subscribed) return;
            const tablistText = `${textOf(this.bot.tablist?.header)}\n${textOf(this.bot.tablist?.footer)}`;
            const existingSubscription = parseLightQueue(tablistText);
            if (existingSubscription.subscribed) {
                this.latestLightQueue = { raw: tablistText, ...existingSubscription };
                this.subscribed = true;
                this.startSampling();
                console.log('[MonitorBot] lightQueue is already subscribed; tablist sampling started');
                return;
            }
            this.bot.chat('/log lightQueue');
            this.subscribed = true;
            this.startSampling();
            console.log('[MonitorBot] subscribed to lightQueue; tablist sampling started');
        }, this.subscribeDelay);
    }

    sample() {
        if (!this.bot) return;
        const tablistHeader = textOf(this.bot.tablist?.header);
        const tablistFooter = textOf(this.bot.tablist?.footer);
        // /log lightQueue updates the tab list.  Parse the latest tab list at
        // sampling time instead of relying on a chat response from /log.
        const tablistLightQueue = parseLightQueue(`${tablistHeader}\n${tablistFooter}`);
        if (tablistLightQueue.value != null || tablistLightQueue.pending != null) {
            this.latestLightQueue = {
                raw: `${tablistHeader}\n${tablistFooter}`,
                ...tablistLightQueue
            };
        }
        const metrics = parseTablistMetrics(`${tablistHeader}\n${tablistFooter}`);
        const row = [
            Date.now(),
            metrics.tps,
            metrics.mspt,
            metrics.lightQueueRateGt,
            metrics.lightQueueSize,
            metrics.lightQueueTimeGt,
            metrics.lightIoCurrent,
            metrics.lightIoAverage,
            this.latestMemory.usedMb,
            this.latestMemory.totalMb,
            this.latestMemory.percent
        ];
        fs.appendFileSync(this.csvPath, `${row.join(',')}\n`, 'utf8');
    }

    ensureCsvHeader() {
        fs.mkdirSync(path.dirname(this.csvPath), { recursive: true });
        if (fs.existsSync(this.csvPath) && fs.statSync(this.csvPath).size > 0) return;
        const header = ['timestamp_ms', 'tps', 'mspt', 'light_queue_rate_gt', 'light_queue_size', 'light_queue_time_gt', 'light_io_current', 'light_io_average', 'memory_used_mb', 'memory_total_mb', 'memory_percent'];
        fs.writeFileSync(this.csvPath, `${header.join(',')}\n`, 'utf8');
    }

    scheduleReconnect(reason) {
        if (this.reconnectTimer) return;
        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(delay * 2, 30 * 60 * 1000);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.initBot().catch(error => {
                console.error('[MonitorBot] reconnect failed:', error.message);
                this.scheduleReconnect(error.message);
            });
        }, delay);
        console.log(`[MonitorBot] reconnecting in ${delay / 1000}s (${reason})`);
    }
}

module.exports = { MonitorBot, parseLightQueue, parseMemory, parseTablistMetrics };
