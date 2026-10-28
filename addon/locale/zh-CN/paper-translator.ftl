paper-translator-menu-translate =
    .label = 翻译 PDF 全文
paper-translator-menu-status =
    .label = { $queued ->
        [0] { $name }：{ $status }
       *[other] { $name }：{ $status }（另有 { $queued } 篇排队）
    }
paper-translator-menu-cancel =
    .label = 取消 PDF 翻译

pt-pref-api-heading = API 设置
pt-pref-base-url = API 地址
pt-pref-api-key = API Key
pt-pref-model = 模型
pt-pref-reasoning = 思考强度
pt-pref-reasoning-none = 不发送（模型不支持时选这个）
pt-pref-reasoning-minimal = 最低（推荐）
pt-pref-reasoning-low = 低
pt-pref-reasoning-medium = 中
pt-pref-reasoning-high = 高
pt-pref-test = 测试连接
pt-pref-translate-heading = 翻译设置
pt-pref-lang-out = 目标语言
pt-pref-output = 生成文件
pt-pref-output-mono = 仅译文
pt-pref-output-dual = 双语对照
pt-pref-output-both = 两者都要
pt-pref-qps = 并发请求数
pt-pref-prompt = 系统提示词
pt-pref-open = 翻译完成后自动打开
pt-pref-env-heading = 运行环境
pt-pref-uv-path = uv 路径（留空则自动查找）
pt-pref-env-setup = 初始化 / 修复环境
pt-pref-env-open = 打开环境目录

pt-lang-zh = 简体中文
pt-lang-zh-TW = 繁體中文
pt-lang-ja = 日本語
pt-lang-ko = 한국어
pt-lang-en = English

pt-status-checking = 正在检查…
pt-status-ready = 环境已就绪（Python { $python }，BabelDOC { $babeldoc }）
pt-status-not-ready = 尚未初始化。首次初始化需要下载约 1 GB，耗时几分钟。
pt-setup-venv = 正在创建 Python 环境…
pt-setup-install = 正在安装依赖（首次需要几分钟）…
pt-setup-warmup = 正在下载版面模型和字体…
pt-test-running = 正在测试…
pt-test-ok = 连接成功

pt-progress-headline = PDF 全文翻译
pt-progress-queued = { $ahead ->
        [0] 排队中
       *[other] 排队中，前面还有 { $ahead } 篇
    }
pt-progress-starting = 正在启动翻译引擎…
pt-progress-status = { $status } · 已用时 { $elapsed }
pt-progress-stage = { $stage } { $percent }%
pt-progress-done = 完成
pt-progress-done-partial = 完成，但有 { $count } 个翻译请求失败，部分段落保留了原文
pt-progress-cancelled = 已取消
pt-progress-failed = 失败，详情见弹出的提示

pt-stage-parse = 解析 PDF
pt-stage-scan = 检测扫描件
pt-stage-layout = 分析版面
pt-stage-table = 识别表格
pt-stage-paragraphs = 识别段落
pt-stage-formulas = 识别公式
pt-stage-terms = 提取术语
pt-stage-translate = 翻译
pt-stage-typeset = 排版
pt-stage-fonts = 嵌入字体
pt-stage-render = 生成页面
pt-stage-subset = 精简字体
pt-stage-save = 保存 PDF

pt-error-missing-settings = 请先在设置中填写 API 地址、API Key 和模型。
pt-error-uv-not-found = 找不到 uv。请先安装 uv（例如 brew install uv），或在设置中填写 uv 的路径。
pt-error-setup-failed = 初始化运行环境失败。日志：{ $log }
pt-error-auth = API Key 无效：{ $detail }
pt-error-not-found = API 地址或模型不存在：{ $detail }
pt-error-connection = 无法连接 API 地址：{ $detail }
pt-error-api = API 返回错误：{ $detail }。如果模型不支持“思考强度”参数，请在设置中改为“不发送”。
pt-error-nothing-translated = 所有翻译请求都失败了（{ $detail }），请检查 API 设置。
pt-error-no-file = 找不到 PDF 文件
pt-error-unknown = 翻译失败：{ $detail }。日志：{ $log }

pt-attachment-mono = 译文（{ $lang }）
pt-attachment-dual = 双语对照（{ $lang }）
