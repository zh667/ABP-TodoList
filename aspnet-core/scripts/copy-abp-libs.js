/**
 * ABP 前端资源复制脚本
 * 
 * 替代 `abp install-libs`，不需要安装 ABP CLI。
 * 读取 node_modules 中每个 @abp 包的 abp.resourcemapping.js，
 * 将前端资源复制到 wwwroot/libs 目录。
 * 
 * 用法: cd src/TodoList.HttpApi.Host && npm install && node ../../scripts/copy-abp-libs.js
 */

const fs = require('fs');
const path = require('path');

const projectDir = process.cwd();
const nmDir = path.join(projectDir, 'node_modules');
const libsDir = path.join(projectDir, 'wwwroot', 'libs');

function copyGlob(pattern, destDir) {
    const src = pattern.replace(/@node_modules\//g, nmDir + '/');
    const dest = destDir.replace(/@libs\//g, libsDir + '/');
    const isGlob = pattern.includes('*');

    if (isGlob) {
        // 处理通配符模式，如 "somefile.*" 或 "somefile*"
        const baseDir = path.dirname(src.replace(/\*/g, ''));
        const prefix = path.basename(src.replace(/\*/g, ''));

        if (!fs.existsSync(baseDir)) return;

        fs.readdirSync(baseDir)
            .filter(f => f.startsWith(prefix))
            .forEach(f => {
                const srcPath = path.join(baseDir, f);
                const destPath = path.join(dest, f);
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.cpSync(srcPath, destPath, { recursive: true });
            });
    } else {
        if (!fs.existsSync(src)) return;
        fs.mkdirSync(dest, { recursive: true });

        if (fs.statSync(src).isDirectory()) {
            fs.cpSync(src, dest, { recursive: true });
        } else {
            const target = path.join(dest, path.basename(src));
            fs.cpSync(src, target, { recursive: true });
        }
    }
}

function scanDir(dir) {
    if (!fs.existsSync(dir)) return;

    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // 检查包里是否有 abp.resourcemapping.js
            const mapFile = path.join(full, 'abp.resourcemapping.js');
            if (fs.existsSync(mapFile)) {
                const config = require(mapFile);
                if (config.mappings) {
                    console.log(`  -> ${entry.name}`);
                    Object.entries(config.mappings).forEach(([pattern, dest]) => {
                        copyGlob(pattern, dest);
                    });
                }
            }
            // 递归扫描带 @ 前缀的 scope 目录（如 @abp）
            if (entry.name.startsWith('@')) {
                scanDir(full);
            }
        }
    });
}

console.log('Installing ABP frontend libs to wwwroot/libs...');
fs.mkdirSync(libsDir, { recursive: true });
scanDir(nmDir);
console.log('Done! ABP libs installed to wwwroot/libs');
