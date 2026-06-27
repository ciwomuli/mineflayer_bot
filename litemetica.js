const fs = require('fs');
const nbt = require('prismarine-nbt');

async function parseLitematica(filePath) {
    try {
        // 读取文件
        const fileBuffer = fs.readFileSync(filePath);

        // 解析 NBT（Litematica 使用 Gzip 压缩）
        const { parsed } = await nbt.parse(fileBuffer);
        const data = nbt.simplify(parsed);
        console.log(data);
    } catch (error) {
        console.error('Error parsing Litematica file:', error);
    }
}

parseLitematica('传送站.litematic');