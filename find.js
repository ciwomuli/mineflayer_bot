const Files = java.nio.file.Files;
const Paths = java.nio.file.Paths;
const StandardCharsets = java.nio.charset.StandardCharsets;

function pos(x, y, z) {
    return PositionCommon.createBlockPos(x, y, z);
}
function pos2str(p) {
    return `${p.getX()},${p.getY()},${p.getZ()}`;
}

/**
 * 扫描配置，支持四个方向（East / West / North / South）
 *
 * axis    : 行走轴，'x' 或 'z'
 * wall    : 终止坐标（含）
 * step    : 步进方向，+1 或 -1
 * rows    : 每行扫描数据
 *   startPos   : 起始坐标
 *   faceOffset : 用于 getsome 开箱的容器坐标 {y, z}（EW）或 {y, x}（NS）
 *   faceVec    : 相对当前行走坐标的展示框/方块面偏移 {dx, dy, dz}
 *                floor 1（地面）→ {0, +1, 0}
 *                floor 4（天花板）→ {0, -1, 0}
 *                floor 2/3（墙面）EW → {0, 0, ±1}，NS → {±1, 0, 0}
 */
const scanConfigs = [
    // ===== East（向 X+ 扫描，x: 790 → 853） =====
    {
        axis: "x",
        wall: -234,
        step: 1,
        rows: [
            {
                startPos: pos(-283, 76, 1172),
                faceOffset: { y: 76, z: 1171 },
                faceVec: { dx: 0, dy: 1, dz: 0 },
                standPos: { y: 78, z: 1173 }
            },
            {
                startPos: pos(-283, 77, 1169),
                faceOffset: { y: 78, z: 1169 },
                faceVec: { dx: 0, dy: 0, dz: 1 },
                standPos: { y: 78, z: 1173 }
            },
            {
                startPos: pos(-283, 79, 1169),
                faceOffset: { y: 80, z: 1169 },
                faceVec: { dx: 0, dy: 0, dz: 1 },
                standPos: { y: 78, z: 1173 }
            },
            {
                startPos: pos(-283, 81, 1170),
                faceOffset: { y: 82, z: 1170 },
                faceVec: { dx: 0, dy: 0, dz: 1 },
                standPos: { y: 78, z: 1173 }
            },
            {
                startPos: pos(-283, 83, 1171),
                faceOffset: { y: 83, z: 1172 },
                faceVec: { dx: 0, dy: -1, dz: 0 },
                standPos: { y: 78, z: 1173 }
            },
            {
                startPos: pos(-283, 76, 1176),
                faceOffset: { y: 76, z: 1177 },
                faceVec: { dx: 0, dy: 1, dz: 0 },
                standPos: { y: 78, z: 1175 }
            },
            {
                startPos: pos(-283, 77, 1179),
                faceOffset: { y: 78, z: 1179 },
                faceVec: { dx: 0, dy: 0, dz: -1 },
                standPos: { y: 78, z: 1175 }
            },
            {
                startPos: pos(-283, 79, 1179),
                faceOffset: { y: 80, z: 1179 },
                faceVec: { dx: 0, dy: 0, dz: -1 },
                standPos: { y: 78, z: 1175 }
            },
            {
                startPos: pos(-283, 81, 1178),
                faceOffset: { y: 82, z: 1178 },
                faceVec: { dx: 0, dy: 0, dz: -1 },
                standPos: { y: 78, z: 1175 }
            },
            {
                startPos: pos(-283, 83, 1177),
                faceOffset: { y: 83, z: 1176 },
                faceVec: { dx: 0, dy: -1, dz: 0 },
                standPos: { y: 78, z: 1175 }
            },
        ],
    },
    // ===== West（向 X- 扫描，x: 764 → 701） =====
    {
        axis: "x",
        wall: -360,
        step: -1,
        rows: [
            {
                startPos: pos(-311, 76, 1172),
                faceOffset: { y: 76, z: 1171 },
                faceVec: { dx: 0, dy: 1, dz: 0 },
                standPos: { y: 78, z: 1173 }
            },
            {
                startPos: pos(-311, 77, 1169),
                faceOffset: { y: 78, z: 1169 },
                faceVec: { dx: 0, dy: 0, dz: 1 },
                standPos: { y: 78, z: 1173 }
            },
            {
                startPos: pos(-311, 79, 1169),
                faceOffset: { y: 80, z: 1169 },
                faceVec: { dx: 0, dy: 0, dz: 1 },
                standPos: { y: 78, z: 1173 }
            },
            {
                startPos: pos(-311, 81, 1170),
                faceOffset: { y: 82, z: 1170 },
                faceVec: { dx: 0, dy: 0, dz: 1 },
                standPos: { y: 78, z: 1173 }
            },
            {
                startPos: pos(-311, 83, 1171),
                faceOffset: { y: 83, z: 1172 },
                faceVec: { dx: 0, dy: -1, dz: 0 },
                standPos: { y: 78, z: 1173 }
            },
            {
                startPos: pos(-311, 76, 1176),
                faceOffset: { y: 76, z: 1177 },
                faceVec: { dx: 0, dy: 1, dz: 0 },
                standPos: { y: 78, z: 1175 }
            },
            {
                startPos: pos(-311, 77, 1179),
                faceOffset: { y: 78, z: 1179 },
                faceVec: { dx: 0, dy: 0, dz: -1 },
                standPos: { y: 78, z: 1175 }
            },
            {
                startPos: pos(-311, 79, 1179),
                faceOffset: { y: 80, z: 1179 },
                faceVec: { dx: 0, dy: 0, dz: -1 },
                standPos: { y: 78, z: 1175 }
            },
            {
                startPos: pos(-311, 81, 1178),
                faceOffset: { y: 82, z: 1178 },
                faceVec: { dx: 0, dy: 0, dz: -1 },
                standPos: { y: 78, z: 1175 }
            },
            {
                startPos: pos(-311, 83, 1177),
                faceOffset: { y: 83, z: 1176 },
                faceVec: { dx: 0, dy: -1, dz: 0 },
                standPos: { y: 78, z: 1175 }
            },
        ],
    },
    // ===== North（向 Z- 扫描）=====  按需填入 rows，faceVec 墙面用 {±1, 0, 0}
    {
        axis: 'z', wall: 1111, step: -1, rows: [
            {
                startPos: pos(-302, 79, 1160),
                faceOffset: { x: -302, y: 77 },
                faceVec: { dx: 1, dy: 0, dz: 0 },
                standPos: { x: -297, y: 77 }
            },
            {
                startPos: pos(-292, 79, 1169),
                faceOffset: { x: -292, y: 77 },
                faceVec: { dx: -1, dy: 0, dz: 0 },
                standPos: { x: -297, y: 77 }
            },
        ]
    },
    // ===== South（向 Z+ 扫描）=====  按需填入 rows，faceVec 墙面用 {±1, 0, 0}
    // { axis: 'z', wall: 1111, step:  -1, rows: [] },
];

blocks = new Map();
itemFrameMap = new Map();

// 预缓存所有展示框实体
World.getEntities("minecraft:item_frame").forEach((entity) => {
    itemFrameMap.set(pos2str(entity.getBlockPos()), entity.getItem());
});

/** 将方块名称归一化 */
function normalizeName(name) {
    if (name.includes("墙上的失活"))
        return "失活的" + name.replace("墙上的失活", "");
    if (name === "红石线") return "红石粉";
    return name.replace("盆栽", "");
}

/** 扫描单行，将找到的方块/展示框写入 blocks */
function scanRow(row, config) {
    let x = row.startPos.getX();
    let y = row.startPos.getY();
    let z = row.startPos.getZ();
    const isX = config.axis === "x";
    const cond =
        config.step > 0
            ? () => (isX ? x : z) <= config.wall
            : () => (isX ? x : z) >= config.wall;

    while (cond()) {
        const facePos = pos(
            x + row.faceVec.dx,
            y + row.faceVec.dy,
            z + row.faceVec.dz,
        );
        const data = config.axis === "x" ?
            { chestPos: { x: x, y: row.faceOffset.y, z: row.faceOffset.z }, standPos: { x: x, y: row.standPos.y, z: row.standPos.z } } :
            { chestPos: { x: row.faceOffset.x, y: row.faceOffset.y, z: z }, standPos: { x: row.standPos.x, y: row.standPos.y, z: z } };

        if (itemFrameMap.has(pos2str(facePos))) {
            // 优先：展示框中的物品
            const itemName = itemFrameMap.get(pos2str(facePos)).getName().getString();
            if (itemName !== "空气") blocks.set(itemName, data);
        } else {
            const faceName = World.getBlock(facePos).getName().getString();
            if (faceName !== "空气") {
                const normed = normalizeName(faceName);
                if (!blocks.has(normed)) blocks.set(normed, data);
            } else {
                const selfName = World.getBlock(x, y, z).getName().getString();
                if ((selfName !== "白色染色玻璃" || (x == -292 && y == 79 && z == 1154)) && selfName !== "空气" && !blocks.has(selfName))
                    blocks.set(selfName.replace("盆栽", ""), data);
            }
        }

        if (isX) x += config.step;
        else z += config.step;
    }
}

// 执行所有方向的扫描
Chat.log("开始扫描...");
scanConfigs.forEach((config) =>
    config.rows.forEach((row) => scanRow(row, config)),
);

//将扫描结果写入文件
let output = "";
blocks.forEach((value, key) => {
    output += `${key} - Chest: (${value.chestPos.x}, ${value.chestPos.y}, ${value.chestPos.z}), Stand: (${value.standPos.x}, ${value.standPos.y}, ${value.standPos.z})\n`;
});
try {
    let filePath = "config/jsMacros/Macros/全物品/scan_result.txt";
    let path = Paths.get(filePath);
    Files.writeString(path, output, StandardCharsets.UTF_8);
    Chat.log("扫描结果已写入：" + filePath);
} catch (e) {
    Chat.log("写入文件失败：" + e);
}


//查找&取货
// Chat.log(blocks.get("铁粒"))
function Goto1(dx, dz) {
    //dx dy dz坐标xx yy zz偏移量
    const xx = 0.5;
    const zz = 0.5;
    gb_tt = Player.getPlayer().getPos();
    Chat.log(`goto ${dx} ${dz}`);
    Chat.say(
        "#goto " + (dx.toString() + " " + dz.toString())
    );
    while (
        Math.abs(gb_tt.getX() - dx) > 1 ||
        Math.abs(gb_tt.getZ() - dz) > 1
    ) {
        Time.sleep(350);
        gb_tt = Player.getPlayer().getPos();
    }
    Time.sleep(350);
    Chat.say("#stop");
    Time.sleep(350);
}
let empty = [];
let clearly = [];
function getsome(standpos, chestPos, count, Id) {
    // Time.sleep(100)
    Chat.log(Id);
    Goto1(standpos.x, standpos.z);
    Player.interactions()
        .setTarget(chestPos.x, chestPos.y, chestPos.z)
        .interactBlock(chestPos.x, chestPos.y, chestPos.z, "down", false);
    JsMacros.waitForEvent("OpenContainer");
    Chat.log("open");
    let slot = 0;
    let sum = 0;
    let slotiteminfo = [];
    let slotshulkerinfo = [];
    itemsum = 0;
    hasshulker = 0;
    while (slot < 54) {
        if (
            Player.openInventory()
                .getSlot(slot)
                .getItemId()
                .includes("shulker_box") &&
            Player.openInventory().getSlot(slot).getNBT() != null
        ) {
            hasshulker = 1;
            slotshulkerinfo.push({
                first: Player.openInventory().getSlot(slot),
                second: slot,
            });
            // Chat.log(Player.openInventory().getSlot(slot).getNBT());
        } else if (
            Player.openInventory().getSlot(slot).getItemId() != "minecraft:air" &&
            !Player.openInventory().getSlot(slot).getItemId().includes("shulker_box")
        ) {
            slotiteminfo.push({
                first: Player.openInventory().getSlot(slot),
                second: slot,
            });
            itemsum += Player.openInventory().getSlot(slot).getCount();
        }
        slot++;
    }
    slotiteminfo.sort((x, y) => {
        return y.first.getCount() - x.first.getCount();
    });
    if (hasshulker) {
        slotshulkerinfo.sort((x, y) => {
            if (y.first.getNBT() != null && x.first.getNBT() != null)
                return (
                    x.first
                        .getNBT()
                        .get("minecraft:container").length() -
                    y.first
                        .getNBT()
                        .get("minecraft:container").length()
                );
            return x.second - y.second;
        });
    }
    if ((count > 1280 || itemsum < count) && hasshulker) {
        let j = 0;
        while (
            sum < count &&
            j < slotshulkerinfo.length &&
            Player.openInventory().findFreeInventorySlot() != -1
        ) {
            var shulkerItemCount = 0;
            for (
                let i = 0;
                i <
                slotshulkerinfo[j].first
                    .getNBT()
                    .get("minecraft:container").length();
                i++
            ) {
                shulkerItemCount += slotshulkerinfo[j].first
                    .getNBT()
                    .get("minecraft:container")
                    .asListHelper()
                    .get(i)
                    .asCompoundHelper()
                    .get("item")
                    .get("count")
                    .asNumberHelper()
                    .asInt();
            }
            if (sum + shulkerItemCount <= count) {
                sum += shulkerItemCount;
                Player.openInventory().quick(slotshulkerinfo[j].second);
                Time.sleep(30);
            } else {
                Player.openInventory().click(slotshulkerinfo[j].second, 0);
                Chat.log(slotshulkerinfo[j].second);
                Time.sleep(30);
                while (sum < count && Player.openInventory().findFreeInventorySlot() != -1) {
                    let freeSlot = Player.openInventory().findFreeInventorySlot();
                    Player.openInventory().click(freeSlot, 1)
                    Time.sleep(30);
                    sum += Player.openInventory().getSlot(freeSlot).getCount();
                }
                Player.openInventory().click(slotshulkerinfo[j].second, 0);
                Time.sleep(30);
            }
            j++;
        }
    }
    let j = 0;
    while (
        sum < count &&
        j < slotiteminfo.length &&
        Player.openInventory().findFreeInventorySlot() != -1
    ) {
        sum += slotiteminfo[j].first.getCount();
        Player.openInventory().quick(slotiteminfo[j].second);
        j++;
    }
    if (sum < count && Player.openInventory().findFreeInventorySlot() == -1) {
        empty.push({ id: Id, num: count - sum });
    } else if (sum < count) {
        clearly.push({ id: Id, num: count - sum });
    }
    Player.openInventory().close();
    return;
}
flag = 0;
let shulkerslot = 0;
let sm = 0;
let all = new Map();

function backing() {
    Goto1(-303,1223);
    if (!flag) {
        flag = 1;
        Player.interactions()
            .setTarget(-305, 78, 1222)
            .interactBlock(-305, 78, 1222, "up", false);
        Time.sleep(2000);
    }
    if (shulkerslot == 27) {
        shulkerslot = 0;
        sm = 0;
    }
    Player.interactions()
        .setTarget(-306, 79, 1223)
        .interactBlock(-306, 79, 1223, "up", false);
    JsMacros.waitForEvent("OpenContainer");
    Time.sleep(100);
    for (
        let slot = 27;
        slot <= 62 && shulkerslot <= 26;
        slot++ //0~26 27~62
    ) {
        if (
            all.has(Player.openInventory().getSlot(slot).getName().getString()) &&
            !Player.openInventory()
                .getSlot(slot)
                .getItemId()
                .includes("shulker_box")
        ) {
            sm += Player.openInventory().getSlot(slot).getCount();
            Player.openInventory().quick(slot);
            Time.sleep(30);
            shulkerslot++;
        }
    }
    Player.openInventory().close();
    Player.interactions()
        .setTarget(-305, 78, 1222)
        .interactBlock(-305, 78, 1222, "east", false);
    Time.sleep(2000);
    Player.interactions().
        setTarget(-304, 77, 1223)
        .interactBlock(-304, 77, 1223, "up", false);
    JsMacros.waitForEvent("OpenContainer");
    for (let slot = 0; slot <= 26; slot++) {
        if (
            Player.openInventory().getSlot(slot).getItemId().includes("shulker_box") &&
            Player.openInventory().getSlot(slot).getNBT() != null
        ) {
            Player.openInventory().quick(slot);
            Time.sleep(30);
        }
    }
    Player.openInventory().close();
    Chat.log(shulkerslot);
    Goto1(-297, 1197);
    Player.interactions()
        .setTarget(-297, 78, 1198)
        .interactBlock(-297, 78, 1198, "up", false);
    JsMacros.waitForEvent("OpenContainer");
    for (let slot = 54; slot <= 89; slot++) {
        if (
            Player.openInventory().getSlot(slot).getItemId().includes("shulker_box")
        ) {
            Player.openInventory().quick(slot);
            Time.sleep(30);
        }
    }
    Player.openInventory().close();
    let nw = [];
    for (let i = 0; i < empty.length; i++) {
        nw.push({ id: empty[i].id, num: empty[i].num });
    }
    Chat.log(nw);
    empty = [];
    for (let i = 0; i < nw.length; i++) {
        if (Player.openInventory().findFreeInventorySlot() != -1) {
            getsome(blocks.get(nw[i].id).standPos, blocks.get(nw[i].id).chestPos, nw[i].num, nw[i].id);
        } else {
            empty.push({ id: nw[i].id, num: nw[i].num });
        }
    }
}

Player.interactions().clearTargetOverride();
function stock(name) {
    empty = [];
    clearly = [];
    let lines = [];
    try {
        // 设置文件路径 (相对路径通常相对于 JsMacros 根目录)
        let filePath = "config/jsMacros/Macros/全物品/" + name + ".txt";
        let path = Paths.get(filePath);
        // 读取文件内容为字符串
        let content = Files.readString(path, StandardCharsets.UTF_8);
        Chat.log("文件读取成功：" + filePath);
        lines = content.trim().split(/\r?\n/);
        Chat.log("§a[解析] 总行数：" + lines.length);
    } catch (e) {
        // 输出错误信息
        Chat.log("读取文件失败：" + e);
    }
    let nofind = [];
    getthings = [];
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line === "") continue;
        let parts = line.split(/\s+/);
        if (parts.length >= 2) {
            let first = parts[0];
            let second = parts[1];
            if (blocks.has(first)) {
                // getsome(blocks.get(first),second,first)
                getthings.push({ fs: first, sd: second, standPos: blocks.get(first).standPos, chestPos: blocks.get(first).chestPos });
                all.set(first, second);
            } else {
                nofind.push(first);
            }
        }
    }
    getthings.sort((a, b) => {
        if (Math.abs(a.standPos.z - b.standPos.z) <= 4) {
            return a.standPos.x - b.standPos.x;
        }
        return a.standPos.z - b.standPos.z;
    });
    getthings.forEach((gt) => {
        if (Player.openInventory().findFreeInventorySlot() != -1) {
            getsome(gt.standPos, gt.chestPos, gt.sd, gt.fs);
        } else {
            empty.push({ id: gt.fs, num: gt.sd });
        }
    });

    while (empty.length) {
        Chat.log("refinding");
        backing();
    }
    backing();
    Chat.log("done");
    let filePath = "config/jsMacros/Macros/全物品/" + name + "_result.txt";
    let path = Paths.get(filePath);
    for (let i = 0; i < clearly.length; i++) {
        Chat.logColor("§c" + clearly[i].id + "不足，缺" + clearly[i].num);
        Files.writeString(path, clearly[i].id + " - 缺少 " + clearly[i].num + "\n", StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
    }
    for (let i = 0; i < nofind.length; i++) {
        Chat.logColor(
            "§a" + nofind[i] + "未从物品列表中找到，可能是实体形式或全物品中不存在"
        );
        Files.writeString(path, nofind[i] + " - 未找到\n", StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
    }
    return all;
}

function main() {
    var keyEvent = JsMacros.on("Key", JavaWrapper.methodToJava((e) => {
        if (e.key == "key.keyboard.c" && e.action == 1) {//绑定按键“c”，且只有在按下c时触发（若不加action判断 则脚本在正常启动后 此处会立即检测到释放了“c”键 从而导致脚本启动即关闭）
            Chat.log('脚本 关闭了。');
            JavaWrapper.stop();//使用此命令等同于在GUI强制停止脚本中的所有线程
        };
    }));
    var chatEvent = JsMacros.on("SendMessage", JavaWrapper.methodToJava((e) => {
        var msg = e.message;
        if (msg.startsWith("@stock ")) {
            e.cancel();
            var name = msg.substring(7).trim();
            if (name === "") {
                Chat.log("请输入物品清单名称，例如：@stock mylist");
                return;
            }
            Chat.log("正在处理清单: " + name);
            stock(name);
        } else if (msg.startsWith("@get ")) {
            e.cancel();
            //输入包括一个名字和需要获取的数量，例如：@get 铁粒 32
            var parts = msg.substring(5).trim().split(/\s+/);
            if (parts.length < 2) {
                Chat.log("请输入物品名称和数量，例如：@get 铁粒 32");
                return;
            }
            var name = parts[0];
            var count = parseInt(parts[1]);
            if (isNaN(count) || count <= 0) {
                Chat.log("请输入有效的数量，例如：@get 铁粒 32");
                return;
            }
            if (name === "") {
                Chat.log("请输入物品名称，例如：@get 铁粒");
                return;
            }
            if (!blocks.has(name)) {
                Chat.log("物品未找到: " + name);
                return;
            }
            Chat.log(`正在获取 ${name} x${count}...`);
            getsome(blocks.get(name).standPos, blocks.get(name).chestPos, count, name);
        } else if (msg === "@backing") {
            e.cancel();
            backing();
        }
    }));
}

main();
