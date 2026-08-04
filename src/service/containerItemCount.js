/**
 * Count one item type in a container, including items stored in shulker boxes.
 *
 * @param {object} container Mineflayer container window
 * @param {string} minecraftId Item id, with or without the `minecraft:` prefix
 * @param {Record<number, {name: string}>} [itemsById] Item registry indexed by numeric id
 * @returns {number}
 */
function countContainerItem(container, minecraftId, itemsById = {}) {
    return getContainerItemCounts(container, itemsById).get(normalizeItemName(minecraftId)) || 0;
}

/**
 * Return the count of every item stored in a container. Shulker-box contents
 * are counted as their stored items rather than as shulker boxes.
 *
 * @param {object} container Mineflayer container window
 * @param {Record<number, {name: string}>} [itemsById] Item registry indexed by numeric id
 * @returns {Map<string, number>}
 */
function getContainerItemCounts(container, itemsById = {}) {
    const containerSlots = typeof container.itemsRange === 'function'
        ? container.itemsRange(0, container.inventoryStart)
        : (container.slots || []).slice(0, container.inventoryStart);
    const itemCounts = new Map();

    for (const slot of containerSlots) {
        for (const [name, count] of getItemStackCounts(slot, itemsById)) {
            itemCounts.set(name, (itemCounts.get(name) || 0) + count);
        }
    }
    return itemCounts;
}

/**
 * Count one item type in a single container slot.
 * @param {object} slot Mineflayer item stack
 * @param {string} minecraftId Item id, with or without the `minecraft:` prefix
 * @param {Record<number, {name: string}>} [itemsById] Item registry indexed by numeric id
 * @returns {number}
 */
function countItemStack(slot, minecraftId, itemsById = {}) {
    return getItemStackCounts(slot, itemsById).get(normalizeItemName(minecraftId)) || 0;
}

function getItemStackCounts(slot, itemsById = {}) {
    const itemCounts = new Map();
    if (!slot) return itemCounts;

    const contents = slot.components?.[0]?.data?.contents;
    if (!Array.isArray(contents)) {
        addItemCount(itemCounts, slot.name, slot.count);
        return itemCounts;
    }

    for (const item of contents) {
        const name = item.name || item.id || itemsById[item.itemId]?.name;
        addItemCount(itemCounts, name, item.itemCount || item.count);
    }
    return itemCounts;
}

function addItemCount(itemCounts, itemId, count) {
    const name = normalizeItemName(itemId);
    if (!name || !count) return;
    itemCounts.set(name, (itemCounts.get(name) || 0) + count);
}

function normalizeItemName(itemId) {
    return String(itemId || '').replace(/^minecraft:/, '');
}

module.exports = { countContainerItem, countItemStack, getContainerItemCounts };
