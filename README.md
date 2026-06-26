# Mineflayer 多机器人框架

运行 `npm start` 启动 `config/global.json` 中启用的机器人；`npm run start:inventory` 只启动库存机器人。每个机器人都放在 `bots/<id>/`，导出 `create(context)`，可返回 `start`、`stop` 和 `onReconnect`，无需修改框架核心。

库存机器人首次运行时使用 `!inventory refresh` 依照 `find.js` 的货架布局扫描标签并写入 `data/inventory/storage-map.json`。重启后自动使用缓存。先将 `bots/inventory/config.json` 的 `deliveryContainer` 改为真实交付容器坐标。

聊天命令：`!inventory status`、`!inventory refresh`、`!inventory cancel`、`!get <物品> <数量>`、`!stock <文件名>`。清单位于 `data/requests/<文件名>.txt`，每行格式为 `物品 数量`，可使用 `#` 注释。

运行 `npm test` 执行离线单元测试；测试和启动均不会自动连接以外的服务，实际启动才会连接 `config/global.json` 中的 Minecraft 服务器。
