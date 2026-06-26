const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNear } = goals;
const Vec3 = require('vec3');

const DEFAULT_TIMEOUT_MS = 30000;

function initPathfinder(bot) {
    bot.loadPlugin(pathfinder);
    const defaultMove = new Movements(bot);
    defaultMove.canDig = false;
    bot.pathfinder.setMovements(defaultMove);
}

/**
 * 前往指定坐标，挂起直到到达或超时
 * @param {import('mineflayer').Bot} bot
 * @param {{x: number, y: number, z: number}} p - 目标坐标
 * @param {number} [timeout=DEFAULT_TIMEOUT_MS] - 超时时间（毫秒）
 * @returns {Promise<boolean>} true=到达目标, false=超时
 */
async function gotoNear(bot, x, y, z, range, timeout = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const currentPos = bot.entity && bot.entity.position ? bot.entity.position : null;
        const target = new Vec3(x, y, z);
        if (currentPos && currentPos.distanceTo(target) <= range) {
            resolve(true);
            return;
        }
        console.log(`[gotoNear] 前往坐标 (${x}, ${y}, ${z})，范围 ${range}，超时 ${timeout}ms`);
        const goal = new GoalNear(x, y, z, range);

        const onReached = (reachedGoal) => {
            if (reachedGoal === goal) {
                bot.removeListener('goal_reached', onReached);
                clearTimeout(timer);
                resolve(true);
            }
        };

        const timer = setTimeout(() => {
            bot.removeListener('goal_reached', onReached);
            try {
                bot.pathfinder.stop();
            } catch (_) {
                // 忽略停止时的错误
            }
            resolve(false);
        }, timeout);

        bot.on('goal_reached', onReached);
        bot.pathfinder.setGoal(goal);
    });
}

module.exports = { initPathfinder, gotoNear };

