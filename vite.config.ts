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
            const files = fs.readdirSync(srcDir);
            for (const f of files) {
              fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
            }
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
            const diffsDir = path.join(OUTPUT_DIR, 'diffs');
            const logsDir = path.join(OUTPUT_DIR, 'logs');
            const currentDir = path.join(OUTPUT_DIR, 'current');
            const archiveDir = path.join(OUTPUT_DIR, 'archive');
            for (const d of [verDir, diffsDir, logsDir, currentDir, archiveDir]) fs.mkdirSync(d, { recursive: true });

            const bodyText = lines.map((l: any) => l.text).join('\n');
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
              '- 主文件: body.md',
              '- 差异文件: ' + (prevVersion ? 'diff_' + prevVersion + '_to_' + versionId + '.md' : 'diff_v0_to_' + versionId + '.md'),
              '- 日志文件: change_log.md',
              '- 冻结摘要: 尚未冻结',
              '- 归档位置: 尚未归档',
              '',
              '## 状态判断',
              '- 是否冻结: 否',
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
              '- 已更新文件: version_summary.md, change_log.md, question_log.md, confirmation_log.md, body.md, ' + (prevVersion ? 'diff_' + prevVersion + '_to_' + versionId + '.md' : 'diff_v0_to_' + versionId + '.md') + ', current/latest_plan.md',
              '- 未完成项: 无',
              '',
              '---',
              '模板类型: 变更日志模板 (11.4)',
            ].join('\n');

            // ── 冻结摘要模板 (stub, filled on locklock) ──
            const freezeStub = [
              '# Freeze Summary',
              '',
              '## 冻结信息',
              '- 冻结版本号: ' + versionId,
              '- 冻结时间: 尚未冻结',
              '- 冻结原因: 尚未冻结',
              '',
              '## 冻结前检查',
              '- 主文件是否完成: 是',
              '- 摘要是否完成: 是',
              '- 日志是否完成: 是',
              '- 差异文件是否完成: 是',
              '- 索引是否完成: 是',
              '',
              '## 确认结果',
              '- 用户确认项: 待冻结时确认',
              '- 系统推断项处理结果: 待处理',
              '- 暂存项处理结果: 待处理',
              '',
              '## 归档信息',
              '- 归档位置: 待归档',
              '- 归档索引: 待生成',
              '- 是否允许派生新版本: 是',
              '',
              '---',
              '模板类型: 冻结摘要模板 (11.5)',
            ].join('\n');

            // Write in spec order: body → summary → log → index → diff
            const files: string[] = [];

            fs.writeFileSync(path.join(verDir, 'body.md'), bodyText);
            files.push('body.md');

            fs.writeFileSync(path.join(verDir, 'version_summary.md'), summary);
            files.push('version_summary.md');

            fs.writeFileSync(path.join(verDir, 'change_log.md'), changeLog);
            files.push('change_log.md');

            fs.writeFileSync(path.join(verDir, 'question_log.md'), qlogText);
            files.push('question_log.md');

            fs.writeFileSync(path.join(verDir, 'confirmation_log.md'), clogText);
            files.push('confirmation_log.md');

            fs.writeFileSync(path.join(verDir, 'freeze_summary.md'), freezeStub);
            files.push('freeze_summary.md');

            // diff
            const diffName = prevVersion ? 'diff_' + prevVersion + '_to_' + versionId + '.md' : 'diff_v0_to_' + versionId + '.md';
            const diffContent = [
              '# ' + title + ' 差异文件',
              '',
              '## 差异信息',
              '- 来源版本: ' + (prevVersion ?? 'v0'),
              '- 目标版本: ' + versionId,
              '- 变更类型: 新增',
              '',
              '## 变更说明',
              '- 新建版本目录: versions/' + versionId + '/',
              '- 生成模板化文件: version_summary/change_log/question_log/confirmation_log/freeze_summary/body',
              '- 同步更新 diffs/、logs/、current/',
              '',
              '## 影响范围',
              '- 版本链: ' + (prevVersion ?? 'v0') + ' → ' + versionId,
            ].join('\n');
            fs.writeFileSync(path.join(verDir, diffName), diffContent);
            fs.writeFileSync(path.join(diffsDir, diffName), diffContent);
            files.push(diffName);

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
              '- 冻结版本入口: 无',
              '- 最后更新: ' + now,
              '- 是否允许继续推进: 是',
            ].join('\n');
            fs.writeFileSync(path.join(currentDir, 'latest_plan.md'), index);
            files.push('current/latest_plan.md');

            // logs
            fs.writeFileSync(path.join(logsDir, 'question_log.md'), qlogText);
            fs.writeFileSync(path.join(logsDir, 'change_log.md'), changeLog);
            fs.writeFileSync(path.join(logsDir, 'confirmation_log.md'), clogText);

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
            const { versionId } = JSON.parse(body);
            const verDir = path.join(OUTPUT_DIR, 'versions', versionId);
            // Check prerequisites
            const required = ['version_summary.md', 'body.md', 'change_log.md', 'question_log.md', 'confirmation_log.md'];
            const missing = required.filter((f) => !fs.existsSync(path.join(verDir, f)));
            if (missing.length > 0) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, missing, error: '硬门槛未满足：缺少文件 ' + missing.join(', ') }));
              return;
            }
            const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
            // ── 11.5 冻结摘要模板 ──
            const freezeFinal = [
              '# Freeze Summary',
              '',
              '## 冻结信息',
              '- 冻结版本号: ' + versionId,
              '- 冻结时间: ' + now,
              '- 冻结原因: 用户确认锁定',
              '',
              '## 冻结前检查',
              '- 主文件是否完成: ✓',
              '- 摘要是否完成: ✓',
              '- 日志是否完成: ✓',
              '- 差异文件是否完成: ✓',
              '- 索引是否完成: ✓',
              '',
              '## 确认结果',
              '- 用户确认项: 用户触发 locklock 锁定',
              '- 系统推断项处理结果: 已处理',
              '- 暂存项处理结果: 已处理',
              '',
              '## 归档信息',
              '- 归档位置: archive/' + versionId + '/',
              '- 归档索引: current/latest_plan.md',
              '- 是否允许派生新版本: 是',
              '',
              '---',
              '模板类型: 冻结摘要模板 (11.5)',
            ].join('\n');
            fs.writeFileSync(path.join(verDir, 'freeze_summary.md'), freezeFinal);
            // Move to archive
            const archiveDir = path.join(OUTPUT_DIR, 'archive', versionId);
            fs.mkdirSync(archiveDir, { recursive: true });
            const files = fs.readdirSync(verDir);
            for (const f of files) fs.copyFileSync(path.join(verDir, f), path.join(archiveDir, f));
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
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

        res.statusCode = 405;
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), filesPlugin()],
});
