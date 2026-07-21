/**
 * 通用工具函数
 */

/**
 * 延时等待
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const CONFIGURATION_PACKETS = new Set([
    'settings',
    'cookie_response',
    'custom_payload',
    'finish_configuration',
    'keep_alive',
    'pong',
    'resource_pack_receive',
    'select_known_packs',
    'accept_code_of_conduct'
]);

/**
 * Keeps Mineflayer from leaking Play packets into Minecraft's Configuration state.
 *
 * Velocity can ask a connected client to re-enter Configuration. minecraft-protocol
 * changes its serializer immediately, while Mineflayer's physics loop may still try
 * to write a movement packet. For 1.21.4, an unknown `position` packet is encoded
 * as the single byte 0x00, which Velocity decodes as an empty settings packet.
 *
 * MC_PROTOCOL_DEBUG=1 additionally logs state changes and outgoing packets.
 *
 * @param {import('mineflayer').Bot} bot
 */
function attachProtocolDiagnostics(bot) {
    const client = bot._client;
    if (!client || client.__protocolDiagnosticsAttached) return;
    client.__protocolDiagnosticsAttached = true;

    const debugEnabled = process.env.MC_PROTOCOL_DEBUG === '1';
    const suppressedPackets = new Set();
    const originalWrite = client.write.bind(client);
    client.write = (name, params) => {
        if (client.state === 'configuration' && !CONFIGURATION_PACKETS.has(name)) {
            if (debugEnabled && !suppressedPackets.has(name)) {
                suppressedPackets.add(name);
                console.warn('[MC BLOCKED]', {
                    state: client.state,
                    packet: name,
                    reason: 'Play packet is invalid during Configuration'
                });
            }
            return;
        }

        if (!debugEnabled) return originalWrite(name, params);

        const entry = {
            state: client.state,
            packet: name,
            fields: params && typeof params === 'object' ? Object.keys(params) : []
        };

        // Client settings are the packet Velocity reports as malformed. Its values
        // contain no credentials and are useful for verifying its encoded shape.
        if (name === 'settings') entry.params = params;

        console.log('[MC OUT]', entry);
        return originalWrite(name, params);
    };

    client.on('state', (nextState, previousState) => {
        if (nextState === 'configuration') {
            suppressedPackets.clear();

            // On a re-entry from Play, Velocity expects a configuration-phase
            // settings packet before it can accept the remaining responses.
            if (previousState === 'play' && typeof bot.setSettings === 'function') {
                bot.setSettings({});
            }
        }

        if (debugEnabled) {
            console.log('[MC STATE]', `${previousState} -> ${nextState}`);
        }
    });
}

module.exports = { sleep, attachProtocolDiagnostics };
