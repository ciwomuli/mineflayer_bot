const config = {
    bots: [
        {
            type: "inventory",
            username: "Elysia",
            host: "frp.uestc.world",
            port: 25565,
            loginDelay: 1000,
            version: "1.21.4",
            startupCommands: [
                "/login 123456",
                "/server survival",
            ],
            config: {
                restockGoldenCarrots: true,
                shulkerBoxThereHold: 512,
                center: { x: -301, y: 78, z: 1174 },
                centerFacing: { yaw: -90, pitch: 30 },
                dropPoint: { x: -297, y: 77, z: 1174 },
                areas: {
                    west: [
                        { x: -311, y: 76, z: 1180 },
                        { x: -360, y: 83, z: 1168 },
                    ],
                    east: [
                        { x: -283, y: 76, z: 1168 },
                        { x: -234, y: 83, z: 1180 },
                    ],
                    north: [
                        { x: -303, y: 75, z: 1160 },
                        { x: -291, y: 77, z: 1111 },
                    ],
                },
                walkPath: {
                    west: [
                        { y: 78, z: 1173 },
                        { y: 78, z: 1175 },
                    ],
                    east: [
                        { y: 78, z: 1173 },
                        { y: 78, z: 1175 },
                    ],
                    north: [
                        { x: -299, y: 77, },
                        { x: -295, y: 77, }
                    ],
                },
                gotoPathTimeoutMs: 30000,
                deliverNum: 5,
                packingBox: { x: -306, y: 79, z: 1223 },
                packingSwitch: { x: -305, y: 78, z: 1222 },
                packingChest: { x: -304, y: 77, z: 1223 },
                packingStanding: { x: -303, y: 77, z: 1223 },
                syncMaticaPath: './syncmatica/',
                syncMaticaJsonPath: './placements.json'
            }
        }
    ]
}

module.exports = config;
