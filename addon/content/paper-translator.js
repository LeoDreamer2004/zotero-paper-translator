/* global Zotero, Services, ChromeUtils, IOUtils, PathUtils, Localization */

var { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");

const PREF_BRANCH = "extensions.paper-translator.";
// Must match PROTOCOL_PREFIX in python/runner.py
const PROTOCOL_PREFIX = "@@PT ";
const PYTHON_VERSION = "3.12";
const LOG_LINES_KEPT = 300;
// File names are cut to this many characters in status lines
const STATUS_NAME_LENGTH = 30;
const OUTPUT_LANGS = ["zh", "zh-TW", "ja", "ko", "en"];
// Recognizes our own output files so they are never offered for translation
const OUTPUT_FILE_RE = new RegExp(`\\.(${OUTPUT_LANGS.join("|")})(\\.dual)?\\.pdf$`, "i");

const STAGE_L10N = {
  "Parse PDF and Create Intermediate Representation": "pt-stage-parse",
  DetectScannedFile: "pt-stage-scan",
  "Parse Page Layout": "pt-stage-layout",
  "Parse Table": "pt-stage-table",
  "Parse Paragraphs": "pt-stage-paragraphs",
  "Parse Formulas and Styles": "pt-stage-formulas",
  "Automatic Term Extraction": "pt-stage-terms",
  "Translate Paragraphs": "pt-stage-translate",
  Typesetting: "pt-stage-typeset",
  "Add Fonts": "pt-stage-fonts",
  "Generate drawing instructions": "pt-stage-render",
  "Subset font": "pt-stage-subset",
  "Save PDF": "pt-stage-save",
};

const RUNNER_ERROR_L10N = {
  auth: "pt-error-auth",
  not_found: "pt-error-not-found",
  connection: "pt-error-connection",
  api: "pt-error-api",
  nothing_translated: "pt-error-nothing-translated",
};

/** An error whose message is already localized for the user. */
class UserError extends Error {}

PaperTranslator = {
  id: null,
  version: null,
  rootURI: null,
  l10n: null,
  menuIDs: [],
  prefPaneID: null,
  queue: [],
  current: null,
  setupPromise: null,

  init({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
  },

  async startup() {
    this.l10n = new Localization(["paper-translator.ftl"], true);
    // The preferences pane runs in its own scope and reaches the plugin here
    Zotero.PaperTranslator = this;
    this.registerMenus();
    this.prefPaneID = await Zotero.PreferencePanes.register({
      pluginID: this.id,
      src: this.rootURI + "content/preferences.xhtml",
      scripts: [this.rootURI + "content/preferences.js"],
    });
    for (let win of Zotero.getMainWindows()) {
      this.addToWindow(win);
    }
    // Leftovers from jobs interrupted by quitting Zotero
    IOUtils.remove(this.jobsDir, { recursive: true, ignoreAbsent: true }).catch((e) => Zotero.logError(e));
  },

  shutdown() {
    this.cancelAll();
    for (let menuID of this.menuIDs) {
      Zotero.MenuManager.unregisterMenu(menuID);
    }
    this.menuIDs = [];
    if (this.prefPaneID) {
      Zotero.PreferencePanes.unregister(this.prefPaneID);
    }
    for (let win of Zotero.getMainWindows()) {
      this.removeFromWindow(win);
    }
    delete Zotero.PaperTranslator;
  },

  addToWindow(win) {
    win.MozXULElement.insertFTLIfNeeded("paper-translator.ftl");
  },

  removeFromWindow(win) {
    win.document.querySelector('[href="paper-translator.ftl"]')?.remove();
  },

  registerMenus() {
    let itemMenuID = Zotero.MenuManager.registerMenu({
      menuID: "paper-translator-item",
      pluginID: this.id,
      target: "main/library/item",
      menus: [
        {
          menuType: "menuitem",
          l10nID: "paper-translator-menu-translate",
          icon: this.rootURI + "content/icon.svg",
          onShowing: (event, context) => {
            context.setVisible(this.getPDFAttachments(context.items).length > 0);
          },
          onCommand: (event, context) => {
            this.enqueue(context.items);
          },
        },
      ],
    });
    let toolsMenuID = Zotero.MenuManager.registerMenu({
      menuID: "paper-translator-tools",
      pluginID: this.id,
      target: "main/menubar/tools",
      menus: [
        {
          // Where to check on a job once its progress popup is out of sight
          menuType: "menuitem",
          l10nID: "paper-translator-menu-status",
          onShowing: (event, context) => {
            context.setVisible(!!this.current);
            context.setEnabled(false);
            if (this.current) {
              context.setL10nArgs(JSON.stringify(this.statusArgs()));
            }
          },
        },
        {
          menuType: "menuitem",
          l10nID: "paper-translator-menu-cancel",
          onShowing: (event, context) => {
            context.setEnabled(!!this.current);
          },
          onCommand: () => this.cancelAll(),
        },
      ],
    });
    this.menuIDs = [itemMenuID, toolsMenuID].filter(Boolean);
  },

  // Preferences

  getPref(name) {
    return Zotero.Prefs.get(PREF_BRANCH + name, true);
  },

  getSettings() {
    return {
      baseURL: (this.getPref("baseURL") || "").trim(),
      apiKey: (this.getPref("apiKey") || "").trim(),
      model: (this.getPref("model") || "").trim(),
      langOut: this.getPref("langOut") || "zh",
      reasoning: this.getPref("reasoning") || "",
      qps: parseInt(this.getPref("qps")) || 4,
      output: this.getPref("output") || "mono",
      customPrompt: (this.getPref("customPrompt") || "").trim(),
      openWhenDone: !!this.getPref("openWhenDone"),
      pages: (this.getPref("pages") || "").trim(),
    };
  },

  apiJob(settings) {
    return {
      base_url: settings.baseURL,
      api_key: settings.apiKey,
      model: settings.model,
      reasoning: settings.reasoning,
    };
  },

  t(id, args) {
    return this.l10n.formatValueSync(id, args) || id;
  },

  // Environment

  get dataDir() {
    return PathUtils.join(Zotero.DataDirectory.dir, "paper-translator");
  },

  get jobsDir() {
    return PathUtils.join(this.dataDir, "jobs");
  },

  get venvDir() {
    return PathUtils.join(this.dataDir, "venv");
  },

  get venvPython() {
    return Zotero.isWin
      ? PathUtils.join(this.venvDir, "Scripts", "python.exe")
      : PathUtils.join(this.venvDir, "bin", "python");
  },

  get runnerPath() {
    return PathUtils.join(this.dataDir, "runner.py");
  },

  get lockPath() {
    return PathUtils.join(this.dataDir, "requirements.lock");
  },

  // Copy of the lock file the venv was built from; a mismatch means the plugin
  // was updated with new dependencies and the venv must be synced again
  get installedLockPath() {
    return PathUtils.join(this.venvDir, "paper-translator.lock");
  },

  /**
   * Read a file shipped in the plugin's python/ folder.
   * Installed from an .xpi, rootURI is a jar: URL whose path contains the
   * plugin ID's '@', which getContentsFromURLAsync() misreads as a username.
   */
  readBundledPythonFile(name) {
    return Zotero.File.getResourceAsync(this.rootURI + "python/" + name);
  },

  async installPythonFiles() {
    await IOUtils.makeDirectory(this.dataDir, { ignoreExisting: true });
    for (let name of ["runner.py", "requirements.lock"]) {
      let text = await this.readBundledPythonFile(name);
      await IOUtils.writeUTF8(PathUtils.join(this.dataDir, name), text);
    }
  },

  async isEnvironmentReady() {
    if (!(await IOUtils.exists(this.venvPython)) || !(await IOUtils.exists(this.installedLockPath))) {
      return false;
    }
    let installed = await IOUtils.readUTF8(this.installedLockPath);
    let wanted = await this.readBundledPythonFile("requirements.lock");
    return installed === wanted;
  },

  async findUV() {
    let custom = (this.getPref("uvPath") || "").trim();
    if (custom) {
      return (await IOUtils.exists(custom)) ? custom : null;
    }
    // GUI apps on macOS don't inherit the shell's PATH, so check the usual
    // install locations before searching PATH
    let home = Services.dirsvc.get("Home", Ci.nsIFile).path;
    let candidates = Zotero.isWin
      ? [PathUtils.join(home, ".local", "bin", "uv.exe"), PathUtils.join(home, ".cargo", "bin", "uv.exe")]
      : [
          "/opt/homebrew/bin/uv",
          "/usr/local/bin/uv",
          PathUtils.join(home, ".local", "bin", "uv"),
          PathUtils.join(home, ".cargo", "bin", "uv"),
        ];
    for (let path of candidates) {
      if (await IOUtils.exists(path)) {
        return path;
      }
    }
    try {
      return await Subprocess.pathSearch(Zotero.isWin ? "uv.exe" : "uv");
    }
    catch (e) {
      return null;
    }
  },

  /**
   * Make sure the venv exists and matches the bundled lock file.
   * Concurrent callers share one setup run.
   */
  ensureEnvironment(onStatus = () => {}) {
    if (!this.setupPromise) {
      this.setupPromise = this._setUpEnvironment(onStatus).finally(() => {
        this.setupPromise = null;
      });
    }
    return this.setupPromise;
  },

  async _setUpEnvironment(onStatus) {
    await this.installPythonFiles();
    if (await this.isEnvironmentReady()) {
      return;
    }
    let uv = await this.findUV();
    if (!uv) {
      throw new UserError(this.t("pt-error-uv-not-found"));
    }
    let steps = [
      ["pt-setup-venv", uv, ["venv", "--python", PYTHON_VERSION, "--allow-existing", this.venvDir]],
      ["pt-setup-install", uv, ["pip", "sync", "--python", this.venvPython, this.lockPath]],
      ["pt-setup-warmup", this.venvPython, [this.runnerPath, "warmup"]],
    ];
    for (let [l10nID, command, args] of steps) {
      onStatus(this.t(l10nID));
      let { exitCode, result, log } = await this.run(command, args);
      if (exitCode !== 0 || result?.type === "error") {
        let logPath = await this.saveLog("setup", log);
        throw new UserError(this.t("pt-error-setup-failed", { log: logPath }));
      }
    }
    await IOUtils.copy(this.lockPath, this.installedLockPath);
  },

  async checkEnvironment() {
    if (!(await this.isEnvironmentReady())) {
      return null;
    }
    await this.installPythonFiles();
    let { result } = await this.run(this.venvPython, [this.runnerPath, "check"]);
    return result?.type === "check" ? result : null;
  },

  async testConnection(settings) {
    await this.ensureEnvironment();
    let { result, log } = await this.run(this.venvPython, [this.runnerPath, "ping"], {
      input: JSON.stringify(this.apiJob(settings)),
    });
    if (result?.type !== "done") {
      throw new UserError(await this.describeRunnerError(result, log));
    }
  },

  // Subprocesses

  /**
   * Run a command, collecting runner protocol messages and log lines.
   * @param {Object} [options]
   * @param {string} [options.input] - Written to stdin
   * @param {Function} [options.onMessage] - Called with each protocol message
   * @param {Function} [options.onSpawn] - Called with the process handle
   */
  async run(command, args, { input, onMessage, onSpawn } = {}) {
    let proc = await Subprocess.call({
      command,
      arguments: args,
      workdir: this.dataDir,
      stderr: "stdout",
      environment: { PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8", NO_COLOR: "1", COLUMNS: "200" },
      environmentAppend: true,
    });
    onSpawn?.(proc);
    if (input !== undefined) {
      await proc.stdin.write(input);
    }
    await proc.stdin.close();

    let log = [];
    let result = null;
    let handleLine = (line) => {
      if (line.startsWith(PROTOCOL_PREFIX)) {
        let message = JSON.parse(line.slice(PROTOCOL_PREFIX.length));
        if (message.type !== "progress") {
          result = message;
        }
        onMessage?.(message);
      }
      else if (line.trim()) {
        log.push(line);
        if (log.length > LOG_LINES_KEPT) {
          log.shift();
        }
      }
    };
    let buffer = "";
    let chunk;
    while ((chunk = await proc.stdout.readString())) {
      buffer += chunk;
      // Progress bars redraw with bare \r
      let lines = buffer.split(/\r\n|\r|\n/);
      buffer = lines.pop();
      lines.forEach(handleLine);
    }
    if (buffer) {
      handleLine(buffer);
    }
    let { exitCode } = await proc.wait();
    return { exitCode, result, log };
  },

  async saveLog(name, lines) {
    let path = PathUtils.join(this.dataDir, `${name}-error.log`);
    await IOUtils.writeUTF8(path, lines.join("\n"));
    return path;
  },

  async describeRunnerError(result, log) {
    let l10nID = RUNNER_ERROR_L10N[result?.code];
    if (l10nID) {
      return this.t(l10nID, { detail: result.message });
    }
    let logPath = await this.saveLog("translate", log);
    return this.t("pt-error-unknown", { detail: result?.message || "?", log: logPath });
  },

  // Translation queue

  isTranslationOutput(attachment) {
    return OUTPUT_FILE_RE.test(attachment.attachmentFilename || "");
  },

  /** The PDF attachments to translate for the selected items: the first PDF of each regular item. */
  getPDFAttachments(items) {
    let attachments = [];
    let seen = new Set();
    for (let item of items || []) {
      let candidates = item.isRegularItem() ? Zotero.Items.get(item.getAttachments()) : [item];
      for (let attachment of candidates) {
        if (
          !attachment.isPDFAttachment?.()
          || attachment.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL
          || this.isTranslationOutput(attachment)
          || seen.has(attachment.id)
        ) {
          continue;
        }
        seen.add(attachment.id);
        attachments.push(attachment);
        break;
      }
    }
    return attachments;
  },

  enqueue(items) {
    let settings = this.getSettings();
    if (!settings.baseURL || !settings.apiKey || !settings.model) {
      Zotero.alert(null, this.t("pt-progress-headline"), this.t("pt-error-missing-settings"));
      Zotero.Utilities.Internal.openPreferences(this.prefPaneID);
      return;
    }
    let pending = new Set([this.current?.attachment.id, ...this.queue.map((job) => job.attachment.id)]);
    for (let attachment of this.getPDFAttachments(items)) {
      if (pending.has(attachment.id)) {
        continue;
      }
      let job = { attachment, proc: null, cancelled: false, status: "", percent: 0, startedAt: null };
      job.progress = this.createProgress(job);
      this.queue.push(job);
    }
    this.refreshQueuedStatus();
    this.processQueue();
  },

  async processQueue() {
    if (this.current) {
      return;
    }
    while (this.queue.length) {
      let job = this.current = this.queue.shift();
      job.startedAt = Date.now();
      this.setStatus(job, this.t("pt-progress-starting"));
      this.refreshQueuedStatus();
      this.tickElapsed(job);
      try {
        await this.translate(job);
      }
      catch (e) {
        Zotero.logError(e);
        job.progress.fail(e instanceof UserError ? e.message : String(e));
      }
      finally {
        this.current = null;
      }
    }
  },

  cancelAll() {
    for (let job of this.queue) {
      job.progress.finish(this.t("pt-progress-cancelled"));
    }
    this.queue = [];
    if (this.current) {
      this.current.cancelled = true;
      this.current.proc?.kill();
    }
  },

  // Job status

  setStatus(job, status, percent) {
    job.status = status;
    if (percent !== undefined) {
      job.percent = percent;
    }
    job.progress.render();
  },

  refreshQueuedStatus() {
    this.queue.forEach((job, index) => {
      this.setStatus(job, this.t("pt-progress-queued", { ahead: index + (this.current ? 1 : 0) }));
    });
  },

  /** Redraw the running job every second so the elapsed time shows it is alive during long silent steps. */
  async tickElapsed(job) {
    while (this.current === job) {
      job.progress.render();
      await Zotero.Promise.delay(1000);
    }
  },

  statusText(job) {
    if (!job.startedAt) {
      return job.status;
    }
    let seconds = Math.floor((Date.now() - job.startedAt) / 1000);
    let elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    return this.t("pt-progress-status", { status: job.status, elapsed });
  },

  /** Arguments for the Tools menu status line. */
  statusArgs() {
    return {
      name: this.shortName(this.current.attachment),
      status: this.statusText(this.current),
      queued: this.queue.length,
    };
  },

  shortName(attachment) {
    let name = attachment.attachmentFilename.replace(/\.pdf$/i, "");
    return name.length > STATUS_NAME_LENGTH ? name.slice(0, STATUS_NAME_LENGTH) + "…" : name;
  },

  /**
   * One progress popup per job: the file name on the first line, the status on
   * a second line of its own so a long file name can never push it out of view.
   */
  createProgress(job) {
    let win = new Zotero.ProgressWindow({ closeOnClick: false });
    win.changeHeadline(this.t("pt-progress-headline"));
    let fileLine = new win.ItemProgress(job.attachment.getItemTypeIconName(), this.shortName(job.attachment));
    let statusLine = new win.ItemProgress(null, "", fileLine);
    // Lines are drawn faded until marked complete; the status should be readable throughout
    statusLine.setProgress(100);
    win.show();
    let ended = false;
    return {
      render: () => {
        if (!ended) {
          fileLine.setProgress(job.percent);
          statusLine.setText(this.statusText(job));
        }
      },
      finish: (status) => {
        job.status = status;
        statusLine.setText(this.statusText(job));
        fileLine.setProgress(100);
        ended = true;
        win.startCloseTimer(8000);
      },
      fail: (message) => {
        ended = true;
        fileLine.setProgress(100);
        statusLine.setError();
        statusLine.setText(this.t("pt-progress-failed"));
        win.startCloseTimer(15000);
        // The progress popup is too narrow for error details
        Zotero.alert(null, `${this.t("pt-progress-headline")}: ${job.attachment.attachmentFilename}`, message);
      },
    };
  },

  async translate(job) {
    let { attachment, progress } = job;
    let settings = this.getSettings();
    await this.ensureEnvironment((status) => this.setStatus(job, status));
    let inputPath = await attachment.getFilePathAsync();
    if (!inputPath) {
      throw new UserError(this.t("pt-error-no-file"));
    }

    let jobDir = PathUtils.join(this.jobsDir, Zotero.Utilities.randomString(8));
    await IOUtils.makeDirectory(jobDir, { createAncestors: true });
    try {
      let { result, log } = await this.run(this.venvPython, [this.runnerPath, "translate"], {
        input: JSON.stringify({
          ...this.apiJob(settings),
          input: inputPath,
          output_dir: jobDir,
          lang_out: settings.langOut,
          qps: settings.qps,
          output: settings.output,
          custom_prompt: settings.customPrompt,
          pages: settings.pages,
        }),
        onSpawn: (proc) => {
          job.proc = proc;
        },
        onMessage: (message) => {
          if (message.type === "progress") {
            let stage = STAGE_L10N[message.stage] ? this.t(STAGE_L10N[message.stage]) : message.stage;
            this.setStatus(job, this.t("pt-progress-stage", { stage, percent: Math.round(message.overall) }), message.overall);
          }
        },
      });
      if (job.cancelled) {
        progress.finish(this.t("pt-progress-cancelled"));
        return;
      }
      if (result?.type !== "done") {
        throw new UserError(await this.describeRunnerError(result, log));
      }

      let added = [];
      for (let [path, dual] of [[result.mono, false], [result.dual, true]]) {
        if (path) {
          added.push(await this.attachOutput(attachment, path, settings.langOut, dual));
        }
      }
      progress.finish(
        result.failed_requests
          ? this.t("pt-progress-done-partial", { count: result.failed_requests })
          : this.t("pt-progress-done")
      );
      if (settings.openWhenDone && added.length) {
        // Don't hold up the queue on the reader tab
        Zotero.Reader.open(added[0].id).catch((e) => Zotero.logError(e));
      }
    }
    finally {
      await IOUtils.remove(jobDir, { recursive: true, ignoreAbsent: true });
    }
  },

  /** Import a translated PDF next to the original attachment. */
  async attachOutput(original, path, lang, dual) {
    let parentItemID = original.parentItemID || undefined;
    let langName = this.t(`pt-lang-${lang}`);
    // Firefox trims file names to keep the whole path under ~255 bytes, which
    // would cut off the suffix OUTPUT_FILE_RE looks for, so shorten the base first
    let baseName = Zotero.File.truncateFileName(original.attachmentFilename.replace(/\.pdf$/i, ""), 80);
    return Zotero.Attachments.importFromFile({
      file: path,
      libraryID: original.libraryID,
      parentItemID,
      collections: parentItemID ? undefined : original.getCollections(),
      fileBaseName: `${baseName}.${lang}${dual ? ".dual" : ""}`,
      title: this.t(dual ? "pt-attachment-dual" : "pt-attachment-mono", { lang: langName }),
    });
  },
};
