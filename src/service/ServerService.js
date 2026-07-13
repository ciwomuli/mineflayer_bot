class ServerService {
    static LOGIN_PROMPT = 'Use /login, /l to authenticate!';

    constructor(bot, options = {}) {
        this.bot = bot;
        this.targetServer = options.targetServer || options.server || '';
        this.availableServers = new Set(
            (options.availableServers || []).map(server => server.toLowerCase())
        );
        this.loginCommand = options.loginCommand || '';
        this.checkIntervalMs = options.checkIntervalMs || 60 * 1000;
        this.checkTimer = null;
        this.authenticated = false;

        if (this.targetServer) this.validateServerName(this.targetServer);

        this.handleMessage = this.handleMessage.bind(this);
        this.handleServerCommand = this.handleServerCommand.bind(this);
        this.bot.on('login', () => { this.authenticated = false; });
        this.bot.on('message', this.handleMessage);
        this.bot.on('chat', this.handleServerCommand);
        this.bot.on('whisper', this.handleServerCommand);
        this.bot.once('end', () => this.stop());
    }

    start() {
        if (this.checkTimer) return;
        this.checkServer();
        this.checkTimer = setInterval(() => this.checkServer(), this.checkIntervalMs);
    }

    stop() {
        if (!this.checkTimer) return;
        clearInterval(this.checkTimer);
        this.checkTimer = null;
    }

    checkServer() {
        if (this.targetServer) this.bot.chat('/server');
    }

    switchServer(serverName) {
        this.validateServerName(serverName);
        const normalizedServerName = serverName.toLowerCase();
        this.targetServer = normalizedServerName;
        this.bot.chat(`/server ${normalizedServerName}`);
        console.log(`[ServerService] 正在切换到服务器 ${normalizedServerName}`);
    }

    validateServerName(serverName) {
        if (!ServerService.isValidServerName(serverName)) {
            throw new Error('服务器名只能包含字母、数字、下划线、点和连字符');
        }
        if (this.availableServers.size > 0 && !this.availableServers.has(serverName.toLowerCase())) {
            throw new Error(`服务器 ${serverName} 不可用，可用服务器: ${[...this.availableServers].join(', ')}`);
        }
    }

    handleMessage(jsonMsg) {
        const message = jsonMsg.toString().trim();
        if (!this.authenticated && message.includes(ServerService.LOGIN_PROMPT)) {
            if (!this.loginCommand) {
                console.warn('[ServerService] 收到登录提示，但未配置 loginCommand');
            } else {
                this.authenticated = true;
                this.bot.chat(this.loginCommand);
                console.log('[ServerService] 收到认证提示，已发送登录指令');
            }
            return;
        }

        const currentServer = ServerService.parseCurrentServer(message);
        if (!currentServer || !this.targetServer) return;
        console.log(`[ServerService] 当前服务器: ${currentServer}，目标服务器: ${this.targetServer}`);
        if (currentServer.toLowerCase() !== this.targetServer.toLowerCase()) {
            this.bot.chat(`/server ${this.targetServer}`);
            console.log(`[ServerService] 当前服务器不匹配，正在切换到 ${this.targetServer}`);
        }
    }

    handleServerCommand(username, message) {
        if (username === this.bot.username || !/^!server(?:\s|$)/i.test(message)) return;
        const serverName = message.replace(/^!server\s*/i, '').trim();
        if (!serverName) {
            if (!this.targetServer) {
                this.bot.whisper(username, '[ServerService] 尚未设置目标服务器。用法: !server <服务器名>');
                return;
            }
            this.switchServer(this.targetServer);
            this.bot.whisper(username, `[ServerService] 正在切换到目标服务器 ${this.targetServer}`);
            return;
        }
        try {
            this.switchServer(serverName);
            this.bot.whisper(username, `[ServerService] 目标服务器已切换为 ${serverName}`);
        } catch (err) {
            this.bot.whisper(username, `[ServerService] ${err.message}`);
        }
    }

    static isValidServerName(serverName) {
        return /^[A-Za-z0-9_.-]+$/.test(serverName);
    }

    static parseCurrentServer(message) {
        const patterns = [
            /currently connected to (?:the )?server\s*[:：]?\s*([A-Za-z0-9_.-]+)/i,
            /currently connected to\s*[:：]?\s*([A-Za-z0-9_.-]+)/i,
            /当前(?:已)?连接(?:到|至)(?:服务器)?\s*[:：]?\s*([A-Za-z0-9_.-]+)/,
            /当前(?:所在)?服务器\s*[:：]\s*([A-Za-z0-9_.-]+)/
        ];
        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) return match[1].replace(/[.,。]$/, '');
        }
        return null;
    }
}

module.exports = { ServerService };
