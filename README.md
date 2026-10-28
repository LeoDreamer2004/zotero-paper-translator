# Paper Translator

Zotero 插件：把整篇论文 PDF 翻译成一个版式对齐的新 PDF（公式、图表、双栏原样保留），用你自己的 OpenAI 兼容 API。翻译引擎是 [BabelDOC](https://github.com/funstory-ai/BabelDOC)，插件在需要时临时启动它，不需要常驻后台服务。

支持 Zotero 7 – 10（在 Zotero 10.0.6 / macOS 上测试）。

## 安装

1. 安装 [uv](https://github.com/astral-sh/uv)（插件用它管理 Python 环境，会自动下载 Python 3.12）：

   ```bash
   brew install uv
   ```

2. 从 [Releases](https://github.com/daniel5u/zotero-paper-translator/releases/latest) 下载 `paper-translator-<版本>.xpi`。

3. Zotero → 工具 → 插件 → 齿轮菜单 → 从文件安装插件，选择这个 xpi。之后有新版本时 Zotero 会自动更新。

4. Zotero → 设置 → Paper Translator（[截图](docs/preferences.png)）：填好 API 地址、API Key、模型，点「测试连接」。然后点「初始化 / 修复环境」（首次需要下载约 1 GB，几分钟；不点也行，第一次翻译时会自动初始化）。

## 使用

在条目或 PDF 附件上右键 →「翻译 PDF 全文」。可以多选，任务会排队依次执行。译文作为附件挂在原条目下，文件名是 `原文件名.zh.pdf`（双语对照版是 `.zh.dual.pdf`）。

查看状态：每个任务有一个右下角进度窗口，第二行是当前步骤、百分比和已用时间（[截图](docs/progress.png)），时间每秒走动，说明还在处理。进度窗口被挡住时，工具菜单顶部也有一行当前任务的状态。失败时进度窗口变红，并弹出提示框说明原因。

取消：工具 →「取消 PDF 翻译」。

## 设置说明

| 设置 | 说明 |
|---|---|
| 思考强度 | 默认「最低」。BabelDOC 每次请求最多输出 2048 个 token，思考型模型（如 Gemini）默认的思考会占满额度导致译文被截断。模型不认这个参数时选「不发送」 |
| 并发请求数 | 同时发出的翻译请求数，受你的 API 限速约束 |
| 系统提示词 | 只替换 BabelDOC 提示词开头的角色说明，格式规则保留。默认要求不翻译人名、引用、网址 |
| 隐藏设置 `extensions.paper-translator.pages` | 只翻译指定页，如 `1-3,5`（在 设置 → 高级 → 配置编辑器 里改） |

## 工作原理

```
右键菜单 → 插件(JS) ──启动子进程──▶ venv/bin/python runner.py translate
                     ◀── stdout 上一行一条 "@@PT {json}" 进度消息 ──
           进程退出 → 把生成的 PDF 导入为附件
```

- 环境放在 `<Zotero 数据目录>/paper-translator/venv`，按插件自带的 `addon/python/requirements.lock` 精确安装。插件更新带来新的依赖清单时会自动重新同步。
- 开始翻译前，`runner.py` 先用一个小请求检查 API。原因是 BabelDOC 遇到 API 错误时不报错，而是悄悄保留原文输出。

## 开发

```
addon/                 插件本体（打包进 xpi）
  bootstrap.js         Zotero 插件入口
  content/             主逻辑、设置页
  locale/              中英文文案（Fluent）
  python/runner.py     插件与 BabelDOC 之间的桥
  python/requirements.lock
python/requirements.in 依赖清单的来源
scripts/build.sh       打包成 build/paper-translator-<版本>.xpi
update.json            Zotero 自动更新清单
```

发布新版本：改 `addon/manifest.json` 的版本号，运行 `./scripts/build.sh`，在 `update.json` 里加上新版本和下载链接，然后建一个 `v<版本>` 的 release 并上传 xpi。

更新依赖：改 `python/requirements.in`，然后

```bash
uv pip compile python/requirements.in --python-version 3.12 --universal --no-header -o addon/python/requirements.lock
```

注意：BabelDOC 0.6.4 和 bitstring 5.0 不兼容，必须保留 `bitstring<5`。

开发时可以在 Zotero 配置目录的 `extensions/` 里放一个以插件 ID（`paper-translator@danielsu.local`）命名的文件，内容是 `addon/` 目录的绝对路径，Zotero 就会直接从源码加载插件。发布前务必再用打包好的 xpi 安装测试一次：两种方式下插件读取自身文件的地址不同（`file://` 和 `jar:`）。

## 协议

[AGPL-3.0](LICENSE)，与 BabelDOC 和 Zotero 一致。
