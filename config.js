const config = {
    bots: [
        {
            type: "inventory",
            username: "",
            host: "",
            port: 25565,
            loginDelay: 1000,
            startupCommands: [
                "/server survival"
            ],
            config: {
                restockGoldenCarrots: true,
                shulkerBoxThereHold: 512,
                center: { x: -301, y: 78, z: 1174 },
                centerFacing: { yaw: -90, pitch: 0 },
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
                gotoPathTimeoutMs: 30000,
                deliverNum: 5
            }
        }
    ]
}

module.exports = config;