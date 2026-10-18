const test = require('node:test');
const assert = require('node:assert/strict');
const { countContainerItem } = require('../src/service/containerItemCount');
const { LitematicaService } = require('../src/service/LitematicaService');

test('counts direct items and matching shulker contents only', () => {
    const container = {
        inventoryStart: 3,
        itemsRange: () => [
            { name: 'stone', count: 12 },
            {
                name: 'white_shulker_box',
                count: 1,
                components: [{
                    data: {
                        contents: [
                            { itemId: 1, itemCount: 20 },
                            { itemId: 2, itemCount: 64 }
                        ]
                    }
                }]
            },
            { name: 'dirt', count: 8 }
        ]
    };

    const itemsById = { 1: { name: 'stone' }, 2: { name: 'dirt' } };
    assert.equal(countContainerItem(container, 'minecraft:stone', itemsById), 32);
    assert.equal(countContainerItem(container, 'minecraft:dirt', itemsById), 72);
});

test('parses an optional litematica region after the placement number', () => {
    assert.deepEqual(LitematicaService.parsePlacementSelector('3'), {
        indexText: '3',
        regionName: null
    });
    assert.deepEqual(LitematicaService.parsePlacementSelector('3:主区域'), {
        indexText: '3',
        regionName: '主区域'
    });
    assert.equal(LitematicaService.parsePlacementSelector('3:'), null);
    assert.equal(LitematicaService.parsePlacementSelector(':主区域'), null);
    assert.equal(LitematicaService.parsePlacementSelector('three:主区域'), null);
});

test('returns every item required by a multi-item block', () => {
    assert.deepEqual(
        LitematicaService.getPaletteRequirements({ Name: 'minecraft:potted_dandelion' }),
        [
            { itemName: 'minecraft:flower_pot', countPerBlock: 1 },
            { itemName: 'minecraft:dandelion', countPerBlock: 1 }
        ]
    );
    assert.deepEqual(
        LitematicaService.getPaletteRequirements({ Name: 'minecraft:white_candle_cake' }),
        [
            { itemName: 'minecraft:cake', countPerBlock: 1 },
            { itemName: 'minecraft:white_candle', countPerBlock: 1 }
        ]
    );
});
