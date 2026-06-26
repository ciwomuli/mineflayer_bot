const { Vec3 } = require('vec3');
const Storage = require('./storage');

async function commandGo(bot, command) {
    const count = await Storage.countContainerItems(bot, new Vec3(-4, -60, 103), 846);
    console.log(`Count: ${count.count}, Pure: ${count.pure}`);
}

module.exports = { commandGo };