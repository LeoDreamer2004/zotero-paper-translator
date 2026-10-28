paper-translator-menu-translate =
    .label = Translate Full PDF
paper-translator-menu-status =
    .label = { $queued ->
        [0] { $name }: { $status }
       *[other] { $name }: { $status } (+{ $queued } queued)
    }
paper-translator-menu-cancel =
    .label = Cancel PDF Translation

pt-pref-api-heading = API
pt-pref-base-url = Base URL
pt-pref-api-key = API Key
pt-pref-model = Model
pt-pref-reasoning = Reasoning effort
pt-pref-reasoning-none = Don't send (if the model rejects it)
pt-pref-reasoning-minimal = Minimal (recommended)
pt-pref-reasoning-low = Low
pt-pref-reasoning-medium = Medium
pt-pref-reasoning-high = High
pt-pref-test = Test Connection
pt-pref-translate-heading = Translation
pt-pref-lang-out = Target language
pt-pref-output = Output
pt-pref-output-mono = Translation only
pt-pref-output-dual = Side-by-side bilingual
pt-pref-output-both = Both
pt-pref-qps = Concurrent requests
pt-pref-prompt = System prompt
pt-pref-open = Open the translation when done
pt-pref-env-heading = Environment
pt-pref-uv-path = Path to uv (leave empty to detect)
pt-pref-env-setup = Set Up / Repair Environment
pt-pref-env-open = Show Environment Folder

pt-lang-zh = 简体中文
pt-lang-zh-TW = 繁體中文
pt-lang-ja = 日本語
pt-lang-ko = 한국어
pt-lang-en = English

pt-status-checking = Checking…
pt-status-ready = Ready (Python { $python }, BabelDOC { $babeldoc })
pt-status-not-ready = Not set up yet. The first setup downloads about 1 GB and takes a few minutes.
pt-setup-venv = Creating Python environment…
pt-setup-install = Installing dependencies (a few minutes the first time)…
pt-setup-warmup = Downloading layout model and fonts…
pt-test-running = Testing…
pt-test-ok = Connection works

pt-progress-headline = PDF Translation
pt-progress-queued = { $ahead ->
        [0] Queued
        [one] Queued, 1 paper ahead
       *[other] Queued, { $ahead } papers ahead
    }
pt-progress-starting = Starting the translation engine…
pt-progress-status = { $status } · { $elapsed } elapsed
pt-progress-stage = { $stage } { $percent }%
pt-progress-done = Done
pt-progress-done-partial = Done, but { $count } translation requests failed and some paragraphs kept the source text
pt-progress-cancelled = Cancelled
pt-progress-failed = Failed, see the error dialog

pt-stage-parse = Parsing PDF
pt-stage-scan = Checking for scans
pt-stage-layout = Analyzing layout
pt-stage-table = Detecting tables
pt-stage-paragraphs = Finding paragraphs
pt-stage-formulas = Finding formulas
pt-stage-terms = Extracting terms
pt-stage-translate = Translating
pt-stage-typeset = Typesetting
pt-stage-fonts = Embedding fonts
pt-stage-render = Rendering pages
pt-stage-subset = Subsetting fonts
pt-stage-save = Saving PDF

pt-error-missing-settings = Enter the base URL, API key and model in the settings first.
pt-error-uv-not-found = uv was not found. Install uv (e.g. brew install uv) or set its path in the settings.
pt-error-setup-failed = Environment setup failed. Log: { $log }
pt-error-auth = Invalid API key: { $detail }
pt-error-not-found = Base URL or model not found: { $detail }
pt-error-connection = Cannot reach the base URL: { $detail }
pt-error-api = The API returned an error: { $detail }. If the model rejects the reasoning parameter, set reasoning effort to "Don't send".
pt-error-nothing-translated = Every translation request failed ({ $detail }). Check the API settings.
pt-error-no-file = The PDF file is missing
pt-error-unknown = Translation failed: { $detail }. Log: { $log }

pt-attachment-mono = Translation ({ $lang })
pt-attachment-dual = Bilingual ({ $lang })
