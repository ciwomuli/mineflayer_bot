# Mineflayer 多机器人框架

在 `config.js` 中对应库存机器人的 `config.avoidPositions` 配置寻路需要避开的方块整数坐标，例如：

```js
avoidPositions: [
    { x: 100, y: 64, z: 200 },
    { x: 101, y: 64, z: 200 },
],
```

默认值为 `[]`，不额外限制寻路。修改后重启机器人生效，所有使用该机器人寻路的操作都会应用此配置。普通行走时，`y` 填写脚部所在方块的高度，而非脚下地面的高度；规避规则也可能排除身体空间涉及这些方块的移动。此设置约束路径规划，不能阻止水流或击退等外力将机器人推入指定位置。

运行 `npm start` 启动 `config/global.json` 中启用的机器人；`npm run start:inventory` 只启动库存机器人。每个机器人都放在 `bots/<id>/`，导出 `create(context)`，可返回 `start`、`stop` 和 `onReconnect`，无需修改框架核心。

库存机器人首次运行时使用 `!inventory refresh` 依照 `find.js` 的货架布局扫描标签并写入 `data/inventory/storage-map.json`。重启后自动使用缓存。先将 `bots/inventory/config.json` 的 `deliveryContainer` 改为真实交付容器坐标。

聊天命令：`!inventory status`、`!inventory refresh`、`!inventory cancel`、`!get <物品> <数量>`、`!stock <文件名>`。清单位于 `data/requests/<文件名>.txt`，每行格式为 `物品 数量`，可使用 `#` 注释。

运行 `npm test` 执行离线单元测试；测试和启动均不会自动连接以外的服务，实际启动才会连接 `config/global.json` 中的 Minecraft 服务器。
