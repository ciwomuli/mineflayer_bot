const test = require('node:test');
const assert = require('node:assert/strict');
const { initPathfinder } = require('../src/goto');

function createMovements(config) {
    const registry = require('minecraft-data')('1.21.4');
    const Block = require('prismarine-block')(registry);
    let movements;
    const bot = {
        version: '1.21.4',
        registry,
        loadPlugin() {},
        pathfinder: {
            setMovements(value) {
                movements = value;
            }
        },
        blockAt(position) {
            const blockType = position.y < 64 ? 'stone' : 'air';
            const block = Block.fromStateId(registry.blocksByName[blockType].minStateId, 0);
            block.position = position;
            return block;
        }
    };
    initPathfinder(bot, config);
    return movements;
}

function forwardNeighbors(movements, direction) {
    const neighbors = [];
    movements.getMoveForward({ x: 0, y: 64, z: 0, remainingBlocks: 0 }, direction, neighbors);
    return neighbors;
}

test('pathfinder still allows walking when avoidance is omitted or empty', () => {
    for (const config of [undefined, {}, { avoidPositions: [] }]) {
        const movements = createMovements(config);
        assert.equal(movements.canDig, false);
        assert.equal(forwardNeighbors(movements, { x: 1, z: 0 }).length, 1);
    }
});

test('pathfinder rejects configured coordinates and allows an adjacent route', () => {
    const movements = createMovements({
        avoidPositions: [
            { x: 1, y: 64, z: 0 },
            { x: -1, y: 64, z: 0 }
        ]
    });
    assert.equal(forwardNeighbors(movements, { x: 1, z: 0 }).length, 0);
    assert.equal(forwardNeighbors(movements, { x: -1, z: 0 }).length, 0);
    assert.equal(forwardNeighbors(movements, { x: 0, z: 1 }).length, 1);
});

test('avoidance does not block a coordinate below the walking space', () => {
    const movements = createMovements({
        avoidPositions: [{ x: 1, y: 63, z: 0 }]
    });
    assert.equal(forwardNeighbors(movements, { x: 1, z: 0 }).length, 1);
});
