const fs = require('fs');
const path = require('path');
const nbt = require('prismarine-nbt');
const db = require('../db');
const { sleep } = require('../utils');

class LitematicaService {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config || {};

        if (this.bot) {
            const handler = (username, message) => {
                console.log(username, message);
                this.commandLitematica(username, message).catch(async err => {
                    console.error('[Litematica] 命令执行失败:', err);
                    await this.sendText(username, `命令执行失败: ${err.message}`, 'red');
                });
            };
            this.bot.on('chat', handler);
            this.bot.on('whisper', handler);
        }
    }
    static SPECIAL_BLOCK_RULES = {
        impossible: [
            'minecraft:piston_head',
            'minecraft:moving_piston',
            'minecraft:nether_portal',
            'minecraft:end_portal',
            'minecraft:end_gateway'
        ],

        mappings: {
            'minecraft:farmland': 'minecraft:dirt',
            'minecraft:brown_mushroom_block': 'minecraft:brown_mushroom_block',
            'minecraft:red_mushroom_block': 'minecraft:red_mushroom_block',
            'minecraft:redstone_wall_torch': 'minecraft:redstone_torch',
            'minecraft:wall_torch': 'minecraft:torch',
            'minecraft:bubble_column': 'minecraft:ice',
        },

        fluid_buckets: {
            'minecraft:lava': 'minecraft:lava_bucket',
            'minecraft:water': 'minecraft:ice'
        },

        upper_half_invalid: [
            'minecraft:oak_door',
            'minecraft:spruce_door',
            'minecraft:birch_door',
            'minecraft:jungle_door',
            'minecraft:acacia_door',
            'minecraft:dark_oak_door',
            'minecraft:crimson_door',
            'minecraft:warped_door',
            'minecraft:oak_bed',
            'minecraft:spruce_bed',
            'minecraft:birch_bed',
            'minecraft:jungle_bed',
            'minecraft:acacia_bed',
            'minecraft:dark_oak_bed',
            'minecraft:red_bed',
            'minecraft:black_bed',
            'minecraft:blue_bed',
            'minecraft:brown_bed',
            'minecraft:cyan_bed',
            'minecraft:gray_bed',
            'minecraft:green_bed',
            'minecraft:light_blue_bed',
            'minecraft:light_gray_bed',
            'minecraft:lime_bed',
            'minecraft:magenta_bed',
            'minecraft:orange_bed',
            'minecraft:pink_bed',
            'minecraft:purple_bed',
            'minecraft:white_bed',
            'minecraft:yellow_bed',
            'minecraft:tall_grass',
            'minecraft:large_fern',
            'minecraft:sunflower',
            'minecraft:lilac',
            'minecraft:rose_bush',
            'minecraft:peony',
            'minecraft:tall_seagrass'
        ]
    };

    static processBlockState(blockState, properties = {}) {
        if (!blockState) return null;

        if (LitematicaService.SPECIAL_BLOCK_RULES.impossible.includes(blockState)) {
            return null;
        }

        if (LitematicaService.SPECIAL_BLOCK_RULES.upper_half_invalid.includes(blockState) &&
            (properties.half === 'upper' || properties.part === 'head')) {
            return null;
        }

        const fluidItem = LitematicaService.SPECIAL_BLOCK_RULES.fluid_buckets[blockState];
        if (fluidItem) {
            return Number(properties.level || 0) === 0 ? fluidItem : null;
        }

        const namespaceEnd = blockState.indexOf(':') + 1;
        const namespace = namespaceEnd > 0 ? blockState.slice(0, namespaceEnd) : '';
        let blockPath = namespaceEnd > 0 ? blockState.slice(namespaceEnd) : blockState;

        if (blockPath.endsWith('_wall_fan')) {
            blockPath = blockPath.replace(/_wall_fan$/, '_fan');
            if (blockPath.startsWith('dead_')) blockPath = blockPath.slice('dead_'.length);
            return namespace + blockPath;
        }

        if (blockPath.endsWith('_wall_sign')) {
            blockPath = blockPath.replace(/_wall_sign$/, '_sign');
            return namespace + blockPath;
        }

        return LitematicaService.SPECIAL_BLOCK_RULES.mappings[blockState] || blockState;
    }

    static getStackSizeForBlock(blockName, properties = {}) {
        if (blockName === 'minecraft:double_slab' ||
            blockName.includes('double_slab') ||
            properties.type === 'double') {
            return 2;
        }

        if (blockName === 'minecraft:snow') {
            return Math.min(Number(properties.layers || 1), 8);
        }

        if (blockName === 'minecraft:turtle_egg') {
            return Math.min(Number(properties.eggs || 1), 4);
        }

        if (blockName === 'minecraft:sea_pickle') {
            return Math.min(Number(properties.pickles || 1), 4);
        }

        if (blockName.includes('candle')) {
            return Math.min(Number(properties.candles || 1), 4);
        }

        if (blockName.includes('sculk_vein') ||
            blockName.includes('cave_vines') ||
            blockName.includes('protocol') ||
            blockName.includes('weeping_vines') ||
            blockName.includes('twisting_vines')) {
            const directions = ['north', 'south', 'east', 'west', 'up', 'down'];
            const directionCount = directions.reduce(
                (count, direction) => count + (properties[direction] === true || properties[direction] === 'true' ? 1 : 0),
                0
            );
            return Math.max(1, directionCount);
        }

        return 1;
    }

    /**
     * 将一个调色板状态预计算为实际物品及每个方块所需数量。
     * null 表示空气或无法通过物品获取的状态。
     */
    static getPaletteRequirement(blockState) {
        let blockName = blockState;
        let properties = {};

        if (typeof blockState === 'object' && blockState !== null && blockState.Name) {
            blockName = blockState.Name;
            properties = blockState.Properties || {};
        }

        if (typeof blockName !== 'string') return null;
        if (blockName === 'minecraft:air' ||
            blockName === 'minecraft:cave_air' ||
            blockName === 'minecraft:void_air') {
            return null;
        }

        const itemName = LitematicaService.processBlockState(blockName, properties);
        if (!itemName) return null;

        return {
            itemName,
            countPerBlock: LitematicaService.getStackSizeForBlock(itemName, properties)
        };
    }

    static getPaletteIndex(blockStates, entryIndex, bitsPerEntry, mask) {
        const bitIndex = entryIndex * bitsPerEntry;
        const longIndex = Math.floor(bitIndex / 64);
        const bitOffset = bitIndex % 64;
        const firstLong = BigInt.asUintN(64, BigInt(blockStates[longIndex]));
        let value = firstLong >> BigInt(bitOffset);

        // palette 索引可以横跨两个 64 位整数。
        if (bitOffset + bitsPerEntry > 64) {
            const secondLong = BigInt.asUintN(64, BigInt(blockStates[longIndex + 1]));
            value |= secondLong << BigInt(64 - bitOffset);
        }

        return Number(value & mask);
    }

    static countPaletteUsage(blockStates, volume, paletteLength) {
        const bitsPerEntry = Math.max(2, Math.ceil(Math.log2(paletteLength)));
        const requiredLongs = Math.ceil(volume * bitsPerEntry / 64);

        if (blockStates.length < requiredLongs) {
            throw new Error(`BlockStates 数据不完整：需要 ${requiredLongs} 个 long，实际只有 ${blockStates.length} 个`);
        }

        const mask = (1n << BigInt(bitsPerEntry)) - 1n;
        const usage = new Float64Array(paletteLength);

        for (let blockIndex = 0; blockIndex < volume; blockIndex++) {
            const paletteIndex = LitematicaService.getPaletteIndex(
                blockStates,
                blockIndex,
                bitsPerEntry,
                mask
            );

            if (paletteIndex >= paletteLength) {
                throw new Error(`BlockStates 包含无效的调色板索引 ${paletteIndex}`);
            }
            usage[paletteIndex]++;
        }

        return usage;
    }

    async parseLitematica(filePath) {
        try {
            const fileBuffer = fs.readFileSync(filePath);
            const { parsed } = await nbt.parse(fileBuffer);
            const data = nbt.simplify(parsed);

            if (!data) {
                throw new Error('无法解析 NBT 数据');
            }

            const metadata = data.Metadata || {};
            const projectName = metadata.Name || '未命名项目';
            const regions = data.Regions || {};
            const materials = new Map();

            console.log(`\x1b[36m%s\x1b[0m`, `[Litematica] 项目名称: ${projectName}`);

            if (Object.keys(regions).length === 0) {
                throw new Error('投影文件中未找到任何区域');
            }

            for (const [regionName, region] of Object.entries(regions)) {
                const size = region.Size || {};
                const palette = region.BlockStatePalette || [];
                const blockStates = region.BlockStates || [];
                const volume = Math.abs(Number(size.x)) *
                    Math.abs(Number(size.y)) *
                    Math.abs(Number(size.z));

                console.log(
                    `\x1b[33m%s\x1b[0m`,
                    `[区域] 名称: ${regionName}, 尺寸: ${size.x || '?'}x${size.y || '?'}x${size.z || '?'}`
                );

                if (palette.length === 0) {
                    throw new Error(`区域 ${regionName} 的方块调色板为空`);
                }
                if (!Number.isSafeInteger(volume) || volume <= 0) {
                    throw new Error(`区域 ${regionName} 的尺寸无效`);
                }

                // 1. 遍历调色板，预计算每个 palette 索引对应的物品需求。
                const paletteRequirements = palette.map(blockState =>
                    LitematicaService.getPaletteRequirement(blockState)
                );

                // 2. 遍历 BlockStates，统计每个 palette 索引实际出现的次数。
                const paletteUsage = LitematicaService.countPaletteUsage(
                    blockStates,
                    volume,
                    palette.length
                );

                // 将方块出现次数乘以单方块需求量，合并到最终材料表。
                for (let paletteIndex = 0; paletteIndex < palette.length; paletteIndex++) {
                    const requirement = paletteRequirements[paletteIndex];
                    if (!requirement || paletteUsage[paletteIndex] === 0) continue;

                    const requiredCount = paletteUsage[paletteIndex] * requirement.countPerBlock;
                    materials.set(
                        requirement.itemName,
                        (materials.get(requirement.itemName) || 0) + requiredCount
                    );
                }
            }

            if (materials.size === 0) {
                throw new Error('未找到任何可获取的方块数据');
            }

            console.log(`\x1b[36m%s\x1b[0m`, `[Litematica] 已解析可获取材料 ${materials.size} 种`);
            // 对材料进行排序，按数量从大到小输出
            const sortedMaterials = Array.from(materials.entries()).sort((a, b) => b[1] - a[1]);
            return { materials: new Map(sortedMaterials), metadata };
        } catch (err) {
            console.error('[Litematica解析错误]', err.message);
            return {
                error: `解析失败: ${err.message}`,
                materials: new Map(),
                metadata: {}
            };
        }
    }

    async commandLitematica(username, message) {
        if (!/^!litematica(?:\s|$)/i.test(message)) return;

        const commandLine = message.replace(/^!litematica\s*/i, '').trim();
        const firstSpace = commandLine.indexOf(' ');
        const command = (firstSpace === -1 ? commandLine : commandLine.slice(0, firstSpace)).toLowerCase();
        const args = firstSpace === -1 ? '' : commandLine.slice(firstSpace + 1).trim();
        console.log(command, args);
        switch (command) {
            case 'list':
                await this.commandList(username, args);
                break;
            case 'stock':
                await this.commandStock(username, args);
                break;
            case 'check':
                await this.commandCheck(username, args);
                break;
            default:
                await this.sendText(username, '用法: !litematica <list|stock|check>', 'yellow');
        }
    }

    loadPlacements() {
        const jsonPath = this.config.syncMaticaJsonPath;
        if (!jsonPath) throw new Error('未配置 syncMaticaJsonPath');

        const data = JSON.parse(fs.readFileSync(path.resolve(jsonPath), 'utf8'));
        if (!Array.isArray(data.placements)) {
            throw new Error('原理图 JSON 中缺少 placements 数组');
        }
        return data.placements;
    }

    getPlacement(indexText) {
        if (!/^\d+$/.test(indexText)) return null;
        const index = Number(indexText);
        const placements = this.loadPlacements();
        if (!Number.isSafeInteger(index) || index < 1 || index > placements.length) return null;
        return { placement: placements[index - 1], index };
    }

    getSchematicPath(placement) {
        if (!this.config.syncMaticaPath) throw new Error('未配置 syncMaticaPath');
        if (!placement || typeof placement.id !== 'string' || !placement.id) {
            throw new Error('原理图缺少 id');
        }
        return path.resolve(this.config.syncMaticaPath, `${placement.hash}.litematic`);
    }

    async loadMaterials(placement) {
        const filePath = this.getSchematicPath(placement);
        const result = await this.parseLitematica(filePath);
        if (result.error) throw new Error(result.error);
        return Array.from(result.materials, ([id, count]) => ({ id, count }));
    }

    async commandList(username, input) {
        const placements = this.loadPlacements();
        const query = input || '1';
        let entries;
        let pagination = null;

        if (/^\d+$/.test(query)) {
            const page = Number(query);
            const pageCount = Math.max(1, Math.ceil(placements.length / 5));
            if (!Number.isSafeInteger(page) || page < 1 || page > pageCount) {
                await this.sendText(username, `页码无效，可用页码: 1-${pageCount}`, 'red');
                return;
            }
            const start = (page - 1) * 5;
            entries = placements.slice(start, start + 5).map((placement, offset) => ({
                placement,
                index: start + offset + 1
            }));
            pagination = { page, pageCount };
            await this.sendText(username, `原理图列表 (${page}/${pageCount})`, 'gold');
        } else {
            const normalizedQuery = query.toLocaleLowerCase();
            entries = placements
                .map((placement, index) => ({ placement, index: index + 1 }))
                .filter(({ placement }) => String(placement.file_name || '').toLocaleLowerCase().includes(normalizedQuery));
            await this.sendText(username, `搜索“${query}”: ${entries.length} 个结果`, 'gold');
        }

        if (entries.length === 0) {
            await this.sendText(username, '没有找到匹配的原理图。', 'yellow');
            return;
        }
        for (const entry of entries) await this.sendPlacement(username, entry);
        if (pagination) await this.sendPagination(username, pagination.page, pagination.pageCount);
    }

    async commandStock(username, args) {
        const parts = args.split(/\s+/).filter(Boolean);
        if (parts.length < 1 || parts.length > 2) {
            await this.sendText(username, '用法: !litematica stock <编号> [carrier名字]', 'yellow');
            return;
        }
        const selected = this.getPlacement(parts[0]);
        if (!selected) {
            await this.sendText(username, '原理图编号无效。', 'red');
            return;
        }
        const carrierName = parts[1] || this.config.litematicaCarrierName || 'carrier';
        if (!/^[A-Za-z0-9_]{1,12}$/.test(carrierName)) {
            await this.sendText(username, 'carrier 名字只能包含字母、数字和下划线，且最长 12 个字符。', 'red');
            return;
        }

        const itemList = await this.loadMaterials(selected.placement);
        const task = async () => {
            try {
                const lackList = await this.bot.deliverService.stocking(itemList, carrierName);
                await this.sendLackList(username, selected, lackList);
            } catch (err) {
                console.error('[Litematica] 备货失败:', err);
                await this.sendText(username, `备货失败: ${err.message}`, 'red');
            }
        };

        await this.sendText(username, `已提交原理图 #${selected.index} 的备货任务。`, 'green');
        if (this.bot.taskQueueService) {
            void this.bot.taskQueueService
                .addTask(task, `litematica_stock_${username}`, true)
                .catch(async err => {
                    console.error('[Litematica] 提交备货任务失败:', err);
                    await this.sendText(username, `提交备货任务失败: ${err.message}`, 'red');
                });
        } else {
            void task();
        }
    }

    async commandCheck(username, args) {
        const selected = this.getPlacement(args);
        if (!selected) {
            await this.sendText(username, '用法: !litematica check <编号>', 'yellow');
            return;
        }
        const itemList = await this.loadMaterials(selected.placement);
        console.log(itemList);
        const lackList = itemList
            .map(({ id, count }) => {
                const available = Math.max(0, db.getItemTotal(id));
                return { id, count: Math.max(0, count - available) };
            })
            .filter(({ count }) => count > 0);
        await this.sendLackList(username, selected, lackList);
    }

    async sendPlacement(username, { placement, index }) {
        const fileName = String(placement.file_name || '(未命名)').replace(/\.litematic$/i, '');
        const fileNameCharacters = Array.from(fileName);
        const displayName = fileNameCharacters.length > 20
            ? fileNameCharacters.slice(-20).join('')
            : fileName;
        const target = this.functionTarget(username);
        const botName = this.functionTarget(this.bot.username);
        const safeIndex = this.functionInteger(index, 'index');
        const name = this.functionJsonString(displayName);
        this.bot.chat(`/function litematica_messages:send_placement {target:${target},botName:${botName},index:${safeIndex},name:${name}}`);
    }

    async sendPagination(username, page, pageCount) {
        const target = this.functionTarget(username);
        const botName = this.functionTarget(this.bot.username);
        const safePage = this.functionInteger(page, 'page');
        const safePageCount = this.functionInteger(pageCount, 'pageCount');
        const hasPrevious = safePage > 1;
        const hasNext = safePage < safePageCount;
        const functionName = hasPrevious && hasNext
            ? 'pagination_both'
            : hasPrevious
                ? 'pagination_previous'
                : hasNext
                    ? 'pagination_next'
                    : 'pagination_single';
        const args = `{target:${target},botName:${botName},page:${safePage},pageCount:${safePageCount},previousPage:${safePage - 1},nextPage:${safePage + 1}}`;
        this.bot.chat(`/function litematica_messages:${functionName} ${args}`);
    }

    functionTarget(username) {
        const target = String(username);
        if (!/^[A-Za-z0-9_]{1,16}$/.test(target)) {
            throw new Error(`无效的玩家名: ${target}`);
        }
        return target;
    }

    functionInteger(value, name) {
        const number = Number(value);
        if (!Number.isSafeInteger(number)) throw new Error(`${name} 必须是安全整数`);
        return number;
    }

    functionJsonString(value) {
        const escapedForJsonComponent = JSON.stringify(String(value)).slice(1, -1);
        return JSON.stringify(escapedForJsonComponent);
    }

    async sendLackList(username, selected, lackList) {
        const name = selected.placement.file_name || '(未命名)';
        await this.sendText(username, `原理图 #${selected.index} ${name} 缺货名单:`, 'gold');
        if (!lackList || lackList.length === 0) {
            await this.sendText(username, '无缺货。', 'green');
            return;
        }
        for (let { id, count } of lackList) {
            if (id.startsWith('minecraft:')) {
                id = id.slice('minecraft:'.length);
            }
            const translation = db.getTranslation(id);
            const displayName = translation && translation.name_zh ? `${translation.name_zh} (${id})` : id;
            await this.sendText(username, `${displayName} × ${count}`, 'red');
        }
    }

    async sendText(username, text, color = 'white') {
        console.log(`[Litematica] 发送给 ${username}: ${text}`);
        await this.sendTellraw(username, { text, color });
        await sleep(20);
    }

    async sendTellraw(username, component) {
        console.log(`[Litematica] 发送 tellraw 给 ${username}:`, JSON.stringify(component));
        this.bot.chat(`/tellraw ${username} ${JSON.stringify(component)}`);
        await sleep(20);
    }
}
module.exports = { LitematicaService };
