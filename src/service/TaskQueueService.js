class TaskQueueService {
    constructor(bot) {
        this.bot = bot;
        this.queue = [];
    }

    async addTask(task, type, allowDuplicate = false) {
        if (!allowDuplicate && this.queue.some(t => t.type === type)) {
            console.log(`Task of type ${type} is already in the queue. Skipping.`);
            return;
        }
        this.queue.push({ task, type });
        await this.processQueue();
    }

    async processQueue() {
        if (this.bot.setBusy()) { return }
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            try {
                await task.task();
            } catch (error) {
                console.error("TaskQueueService error:", error);
            }
        }
        this.bot.unsetBusy(false);
    }
}

module.exports = { TaskQueueService };