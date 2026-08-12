import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const PROJECT_ROOT = path.resolve(__dirname);
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'letsgo');
const IGNORE = new Set([
  'node_modules', 'dist', '.git', '.DS_Store', '.hermes',
  '.vscode', 'assets', 'public',
  '已参考', '参考', 'versions', 'preview', 'diffs', 'logs', 'current', 'archive', 'letsgo', 'docs',
]);

function listDir(dir: string, base: string = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries: string[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (IGNORE.has(item.name)) continue;
    const rel = base ? `${base}/${item.name}` : item.name;
    if (item.isDirectory()) {
      entries.push(`${rel}/`);
      entries.push(...listDir(path.join(dir, item.name), rel));
    } else {
      entries.push(rel);
    }
  }
  return entries.sort();
}

function fileType(name: string): string {
  if (name.endsWith('/')) return 'folder';
  const ext = path.extname(name);
  const map: Record<string, string> = {
    '.md': 'md', '.json': 'json', '.log': 'log', '.diff': 'diff',
    '.ts': 'ts', '.tsx': 'tsx', '.css': 'css', '.html': 'html',
    '.js': 'js', '.jsx': 'jsx', '.yaml': 'yaml', '.yml': 'yaml',
  };
  return map[ext] ?? ext.slice(1);
}

function filesPlugin(): Plugin {
  return {
    name: 'alittlebit-files',
    configureServer(server) {
      // ── /api/versions/copy ──
      server.middlewares.use('/api/versions/copy', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { fromVersion, toVersion } = JSON.parse(body);
            const srcDir = path.join(OUTPUT_DIR, 'versions', fromVersion);
            const dstDir = path.join(OUTPUT_DIR, 'versions', toVersion);
            if (!fs.existsSync(srcDir)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'source not found' })); return; }
            fs.mkdirSync(dstDir, { recursive: true });
            // Recursively copy all files and subdirs
            function copyDir(src: string, dst: string) {
              fs.mkdirSync(dst, { recursive: true });
              const items = fs.readdirSync(src, { withFileTypes: true });
              for (const item of items) {
                if (item.isDirectory()) copyDir(path.join(src, item.name), path.join(dst, item.name));
                else fs.copyFileSync(path.join(src, item.name), path.join(dst, item.name));
              }
            }
            copyDir(srcDir, dstDir);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

      // ── /api/versions ──
      server.middlewares.use('/api/versions', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
        if (req.method !== 'DELETE') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { versionId } = JSON.parse(body);
            if (!versionId) { res.statusCode = 400; res.end(JSON.stringify({ error: 'versionId required' })); return; }
            const verDir = path.join(OUTPUT_DIR, 'versions', versionId);
            if (!fs.existsSync(verDir)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not found' })); return; }
            fs.rmSync(verDir, { recursive: true, force: true });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

      // ── /api/files/generate ──
      server.middlewares.use('/api/files/generate', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { versionId, title, messages, lines } = JSON.parse(body);
            if (!versionId || !title) { res.statusCode = 400; res.end(JSON.stringify({ error: 'versionId and title required' })); return; }
            const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

            // Directories
            const verDir = path.join(OUTPUT_DIR, 'versions', versionId);
            const bDir = path.join(verDir, 'b');
            const aDir = path.join(verDir, 'a');
            const cDir = path.join(verDir, 'c');
            const diffsDir = path.join(OUTPUT_DIR, 'diffs');
            const logsDir = path.join(OUTPUT_DIR, 'logs');
            const currentDir = path.join(OUTPUT_DIR, 'current');
            const archiveDir = path.join(OUTPUT_DIR, 'archive');
            for (const d of [verDir, aDir, bDir, cDir, diffsDir, logsDir, currentDir, archiveDir]) fs.mkdirSync(d, { recursive: true });

            const msgs = messages || [];
            const userMsgs = msgs.filter((m: any) => m.role === 'user');
            const aiMsgs = msgs.filter((m: any) => m.role === 'assistant');

            const existingVersions = fs.readdirSync(path.join(OUTPUT_DIR, 'versions')).filter((d: string) => d !== versionId && !d.startsWith('.'));
            const prevVersion = existingVersions.sort().pop();

            // ── 11.7 问答记录模板 ──
            const qlog = [
              '# Question Log',
              '',
              '## 基本信息',
              '- 版本: ' + versionId,
              '- 生成时间: ' + now,
              '- 轮次: ' + Math.ceil(msgs.length / 2),
              '',
            ];
            let round = 1;
            for (let i = 0; i < userMsgs.length; i++) {
              const q = userMsgs[i]?.content || '';
              const a = aiMsgs[i]?.content || '';
              qlog.push(
                '## 第 ' + round + ' 轮',
                '- 时间: ' + now,
                '- 主题: ' + (q.slice(0, 40) + '...'),
                '',
                '### 问题列表',
                q.split('\n').map((l: string) => '1. ' + l).join('\n'),
                '',
                '### 用户回答',
                a ? a : '待补充',
                '',
                '### 系统总结',
                '已确认事项: (见确认记录)',
                '未确认事项: 待补充',
                '系统推断项: 无',
                '暂存项: 无',
                '',
                '### 本轮结论',
                '第 ' + round + ' 轮完成',
                '',
              );
              round++;
            }
            if (userMsgs.length === 0) {
              qlog.push('## 第 1 轮', '', '待首次对话后补充。', '');
            }
            const qlogText = qlog.join('\n');

            // ── 11.6 确认记录模板 ──
            const clog = [
              '# Confirmation Log',
              '',
              '## 基本信息',
              '- 版本: ' + versionId,
              '- 生成时间: ' + now,
              '',
            ];
            for (let i = 0; i < userMsgs.length; i++) {
              clog.push(
                '## 第 ' + (i + 1) + ' 轮',
                '- 时间: ' + now,
                '- 主题: ' + (userMsgs[i]?.content?.slice(0, 40) || '未命名'),
                '',
                '### 待确认事项',
                '1. (从对话中提取)',
                '2.',
                '3.',
                '',
                '### 用户确认结果',
                '1.',
                '2.',
                '3.',
                '',
                '### 系统处理结果',
                '- 已确认: ',
                '- 已拒绝: ',
                '- 保留为暂存项: ',
                '',
                '### 本轮判断',
                '- 是否影响冻结: 否',
                '- 是否可进入下一阶段: 待判断',
                '',
              );
            }
            if (userMsgs.length === 0) {
              clog.push('## 第 1 轮', '', '确认记录将在对话收敛后补充。', '');
            }
            const clogText = clog.join('\n');

            // ── 11.3 版本摘要模板 ──
            const summary = [
              '# Version Summary',
              '',
              '## 基本信息',
              '- 版本号: ' + versionId,
              '- 状态: confirmed',
              '- 创建时间: ' + now,
              '- 当前阶段: 结构/生成',
              '- 当前轮次: ' + Math.max(1, userMsgs.length),
              '',
              '## 当前理解',
              '- 当前目标: ' + (userMsgs[0]?.content?.slice(0, 80) || '待补充'),
              '- 当前结论: 已完成 ' + userMsgs.length + ' 轮对话，版本内容已生成',
              '',
              '## 事项分层',
              '- 已确认事项: (见确认记录)',
              '- 未确认事项: 待补充',
              '- 系统推断项: 无',
              '- 暂存项: 无',
              '- 已冻结项: 无',
              '',
              '## 文件指向',
              '- 主文件: b/version_summary.md',
              '- 差异文件: c/' + (prevVersion ? 'diff_' + prevVersion + '_to_' + versionId + '.md' : 'diff_v0_to_' + versionId + '.md'),
              '- 日志文件: b/changes.md',
              '- 锁定摘要: b/lock_summary.md',
              '- 归档位置: 尚未归档',
              '',
              '## 状态判断',
              '- 是否锁定: 否',
              '- 是否归档: 否',
              '- 是否允许继续推进: 是',
              '',
              '---',
              '模板类型: 版本摘要模板 (11.3)',
            ].join('\n');

            // ── 11.4 变更日志模板 ──
            const changeLog = [
              '# Change Log',
              '',
              '## 变更元信息',
              '- 变更编号: CHG-' + versionId + '-001',
              '- 来源版本: ' + (prevVersion ?? 'v0'),
              '- 目标版本: ' + versionId,
              '- 记录时间: ' + now,
              '',
              '## 变更详情',
              '- 变更类型: 新增',
              '- 变更对象: 全版本',
              '- 变更前: 无',
              '- 变更后: 新建版本目录及配套文件',
              '- 变更原因: 用户对话收敛完成，生成正式版本',
              '',
              '## 影响分析',
              '- 影响范围: 版本目录 / 差异目录 / 日志目录 / 索引',
              '- 是否联动更新其他文档: 是 (摘要/日志/差异/索引已同步)',
              '- 是否影响冻结条件: 否',
              '- 是否影响主入口索引: 是 (已更新)',
              '',
              '## 同步结果',
              '- 已更新文件: version_summary.md, changes.md, questions.md, confirms.md, ' + (prevVersion ? 'diff_' + prevVersion + '_to_' + versionId + '.md' : 'diff_v0_to_' + versionId + '.md') + ', current/latest_plan.md',
              '- 未完成项: 无',
              '',
              '---',
              '模板类型: 变更日志模板 (11.4)',
            ].join('\n');

            // ── 锁定摘要 (append-only, filled on locklock) ──
            const freezeStub = [
              '# Freeze Summary',
              '',
              '## 模板类型',
              '- 锁定摘要模板（11.5）',
            ].join('\n');

            // Write in spec order: summary → log → index → diff
            const files: string[] = [];

            fs.writeFileSync(path.join(bDir, 'version_summary.md'), summary);
            files.push('b/version_summary.md');

            fs.writeFileSync(path.join(bDir, 'changes.md'), changeLog);
            files.push('b/changes.md');

            fs.writeFileSync(path.join(bDir, 'questions.md'), qlogText);
            files.push('b/questions.md');

            fs.writeFileSync(path.join(bDir, 'confirms.md'), clogText);
            files.push('b/confirms.md');

            fs.writeFileSync(path.join(bDir, 'lock_summary.md'), freezeStub);
            files.push('b/lock_summary.md');

            // diff
            const diffName = prevVersion ? 'diff_' + prevVersion + '_to_' + versionId + '.md' : 'diff_v0_to_' + versionId + '.md';
            const diffContent = [
              '# Diff：' + (prevVersion ?? 'v0') + ' → ' + versionId,
              '',
              '## 1. 文档信息',
              '- Diff 编号：DIFF-' + versionId,
              '- 来源版本：' + (prevVersion ?? 'v0'),
              '- 目标版本：' + versionId,
              '- 变更对象：b/ 目录下全部治理文档 + current/latest_plan.md + diffs/',
              '- 关联文档：b/version_summary / b/changes / b/questions / b/confirms / b/lock_summary',
              '- 生成时间：' + now,
              '- 状态：confirmed',
              '',
              '## 2. 变更摘要',
              '- 变更类型总览：新增',
              '- 变更数量：6',
              '- 是否影响主流程：否',
              '- 是否影响锁定条件：否',
              '- 是否影响历史版本引用关系：否',
              '- 是否影响索引：是',
              '- 是否需要生成新差异文件：否（本文件即为差异文件）',
              '',
              '## 3. 详细变更项',
              '',
              '### 3.1 新增',
              '- 变更对象：b/ 目录',
              '- 变更前：无',
              '- 变更后：新建版本目录 versions/' + versionId + '/b/',
              '- 新建文件：version_summary.md',
              '- 新建文件：changes.md',
              '- 新建文件：questions.md',
              '- 新建文件：confirms.md',
              '- 新建文件：lock_summary.md',
              '',
              '### 3.2 修改',
              '- 无',
              '',
              '### 3.3 删除',
              '- 无',
              '',
              '### 3.4 重构',
              '- 无',
              '',
              '### 3.5 澄清',
              '- 无',
              '',
              '## 4. 变更原因',
              '- 用户对话收敛完成，生成正式版本治理文档',
              '',
              '## 5. 影响分析',
              '### 5.1 对正文的影响',
              '- 正文已生成至 b/version_summary.md',
              '',
              '### 5.2 对摘要的影响',
              '- 版本摘要已生成至 b/version_summary.md，指向当前版本',
              '',
              '### 5.3 对日志的影响',
              '- 变更日志已记录至 b/changes.md',
              '- 问答日志已记录至 b/questions.md',
              '- 确认日志已记录至 b/confirms.md',
              '',
              '### 5.4 对索引的影响',
              '- 主入口索引 current/latest_plan.md 已更新为当前版本',
              '',
              '### 5.5 对历史版本的影响',
              '- 是否影响历史版本引用关系：否（首次生成，无历史引用）',
              '',
              '### 5.6 对锁定 / lock 的影响',
              '- 是否允许锁定：是（满足硬门槛后）',
              '- 是否需要延期锁定：否',
              '- 是否需要重新确认：否',
              '',
              '## 6. 同步更新结果',
              '- 正文：已更新',
              '- 摘要：已更新',
              '- 日志：已更新',
              '- 索引：已更新',
              '- 差异文件：本文件',
              '',
              '## 7. 决策记录',
              '- 决策 1：用户触发生成版本文件，所有 B 类治理文档已产出至 b/',
              '',
              '## 8. 后续动作',
              '- 确认版本内容无误后可执行 locklock 锁定',
              '- 锁定后自动归档至 archive/',
              '- 可基于锁定版本派生新版本继续迭代',
            ].join('\n');
            fs.writeFileSync(path.join(cDir, diffName), diffContent);
            fs.writeFileSync(path.join(diffsDir, diffName), diffContent);
            files.push('c/' + diffName);

            // latest_plan.md
            const index = [
              '# 当前版本索引',
              '',
              '- 项目名称: alittlebit',
              '- 当前版本号: ' + versionId,
              '- 当前状态: confirmed',
              '- 当前阶段: 结构/生成',
              '- 当前摘要入口: versions/' + versionId + '/version_summary.md',
              '- 版本目录入口: versions/' + versionId + '/',
              '- 差异文件入口: diffs/' + diffName,
              '- 历史版本入口: versions/',
              '- 锁定版本入口: 无',
              '- 最后更新: ' + now,
              '- 是否允许继续推进: 是',
            ].join('\n');
            fs.writeFileSync(path.join(currentDir, 'latest_plan.md'), index);
            files.push('current/latest_plan.md');

            // logs
            fs.writeFileSync(path.join(logsDir, 'questions.md'), qlogText);
            fs.writeFileSync(path.join(logsDir, 'changes.md'), changeLog);
            fs.writeFileSync(path.join(logsDir, 'confirms.md'), clogText);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, dir: 'versions/' + versionId + '/', files }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

      // ── /api/files/locklock ──
      server.middlewares.use('/api/files/locklock', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { versionId, action } = JSON.parse(body);
            const verDir = path.join(OUTPUT_DIR, 'versions', versionId);
            const bDir = path.join(verDir, 'b');
            const lockPath = path.join(bDir, 'lock_summary.md');
            const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

            if (action === 'unlock') {
              const entry = '\n## 解锁: ' + versionId + ' @ ' + now + '\n- 解锁原因: 用户取消锁定\n';
              const current = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf-8') : '';
              fs.writeFileSync(lockPath, current + entry);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            // action === 'lock': check prerequisites
            const required = ['version_summary.md', 'changes.md', 'questions.md', 'confirms.md'];
            const missing = required.filter((f) => !fs.existsSync(path.join(bDir, f)));
            if (missing.length > 0) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, missing, error: '硬门槛未满足：缺少文件 ' + missing.join(', ') }));
              return;
            }

            // Append lock record
            const entry = '\n## 锁定: ' + versionId + ' @ ' + now + '\n- 锁定前检查: 全部通过\n- 锁定原因: 用户确认锁定\n';
            const current = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf-8') : '';
            fs.writeFileSync(lockPath, current + entry);

            // Archive
            const archiveDir = path.join(OUTPUT_DIR, 'archive', versionId);
            fs.mkdirSync(archiveDir, { recursive: true });
            function copyDir(src: string, dst: string) {
              fs.mkdirSync(dst, { recursive: true });
              const items = fs.readdirSync(src, { withFileTypes: true });
              for (const item of items) {
                if (item.isDirectory()) copyDir(path.join(src, item.name), path.join(dst, item.name));
                else fs.copyFileSync(path.join(src, item.name), path.join(dst, item.name));
              }
            }
            copyDir(verDir, archiveDir);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

      // ── /api/files/write ──  overwrite existing file
      server.middlewares.use('/api/files/write', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { filePath, content } = JSON.parse(body);
            if (!filePath || content === undefined) { res.statusCode = 400; res.end(JSON.stringify({ error: 'filePath and content required' })); return; }
            const safePath = path.resolve(PROJECT_ROOT, path.normalize(filePath));
            if (!safePath.startsWith(PROJECT_ROOT)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'forbidden' })); return; }
            fs.writeFileSync(safePath, content);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

      // ── /api/files/rename ──
      server.middlewares.use('/api/files/rename', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { oldPath, newPath } = JSON.parse(body);
            const safeOld = path.resolve(PROJECT_ROOT, path.normalize(oldPath));
            const safeNew = path.resolve(PROJECT_ROOT, path.normalize(newPath));
            if (!safeOld.startsWith(PROJECT_ROOT) || !safeNew.startsWith(PROJECT_ROOT)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'forbidden' })); return; }
            if (!fs.existsSync(safeOld)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not found' })); return; }
            fs.renameSync(safeOld, safeNew);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

      // ── /api/files ──
      server.middlewares.use('/api/files', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const url = new URL(req.url!, `http://localhost`);
        const filePath = url.searchParams.get('path');

        if (req.method === 'GET' && filePath) {
          try {
            const safePath = path.resolve(PROJECT_ROOT, path.normalize(filePath));
            if (!safePath.startsWith(PROJECT_ROOT)) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'forbidden' }));
              return;
            }
            const content = fs.readFileSync(safePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            const lines = content.split('\n').map((text, i) => ({
              id: `fL${i + 1}`,
              lineNumber: i + 1,
              text,
              type: text.startsWith('#') ? 'heading' : text.startsWith('-') ? 'list' : text.startsWith('>') ? 'quote' : text.startsWith('---') ? 'meta' : 'paragraph',
            }));
            res.end(JSON.stringify({ lines }));
          } catch {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'not found' }));
          }
          return;
        }

        if (req.method === 'GET') {
          const url = new URL(req.url!, 'http://localhost');
          const listDir2 = url.searchParams.get('dir');
          const targetDir = listDir2
            ? path.resolve(PROJECT_ROOT, listDir2)
            : PROJECT_ROOT;
          const raw = listDir(targetDir);
          const files = raw.map((name) => ({
            id: name,
            name: name,
            type: fileType(name),
          }));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(files));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', () => {
            try {
              const { name, content, dir } = JSON.parse(body);
              if (!name || typeof name !== 'string') {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'name required' }));
                return;
              }
              const safeName = path.basename(name);
              const baseDir = dir ? path.resolve(PROJECT_ROOT, dir) : PROJECT_ROOT;
              const filePath = path.join(baseDir, safeName);
              if (fs.existsSync(filePath)) {
                res.statusCode = 409;
                res.end(JSON.stringify({ error: 'file exists' }));
                return;
              }
              fs.mkdirSync(baseDir, { recursive: true });
              fs.writeFileSync(filePath, content || '');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, name: safeName, type: fileType(safeName) }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        if (req.method === 'DELETE') {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', () => {
            try {
              const { filePath } = JSON.parse(body);
              if (!filePath) { res.statusCode = 400; res.end(JSON.stringify({ error: 'filePath required' })); return; }
              const safePath = path.resolve(PROJECT_ROOT, path.normalize(filePath));
              if (!safePath.startsWith(PROJECT_ROOT)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'forbidden' })); return; }
              if (!fs.existsSync(safePath)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not found' })); return; }
              fs.unlinkSync(safePath);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        res.statusCode = 405;
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), filesPlugin()],
});
