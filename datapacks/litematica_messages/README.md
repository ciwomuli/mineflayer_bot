# litematica_messages

适用于 Minecraft Java 1.21.4。这个数据包保存 `sendPlacement` 和
`sendPagination` 的长 `tellraw`，机器人只发送较短的 `/function` 命令。

## 安装

将整个 `litematica_messages` 文件夹复制到服务器世界目录：

```text
<世界目录>/datapacks/litematica_messages
```

然后在服务器控制台执行：

```mcfunction
reload
datapack list enabled
```

列表中应出现 `file/litematica_messages`。机器人需要拥有执行 `function`
和函数内 `tellraw` 的权限。

Node 端会自动调用以下函数：

- `litematica_messages:send_placement`
- `litematica_messages:pagination_both`
- `litematica_messages:pagination_next`
- `litematica_messages:pagination_previous`
- `litematica_messages:pagination_single`
