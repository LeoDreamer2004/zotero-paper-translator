/* global Zotero, IOUtils, window, document */

// Runs before the pane's markup is inserted
window.MozXULElement.insertFTLIfNeeded("paper-translator.ftl");

var PaperTranslatorPrefs = {
  get plugin() {
    return Zotero.PaperTranslator;
  },

  init() {
    document.getElementById("pt-test").addEventListener("click", () => this.testConnection());
    document.getElementById("pt-env-setup").addEventListener("click", () => this.setUpEnvironment());
    document.getElementById("pt-env-open").addEventListener("click", () => this.openEnvironmentFolder());
    this.refreshEnvironmentStatus();
  },

  setStatus(id, text, isError = false) {
    let elem = document.getElementById(id);
    elem.textContent = text;
    elem.classList.toggle("error", isError);
  },

  async refreshEnvironmentStatus() {
    this.setStatus("pt-env-status", this.plugin.t("pt-status-checking"));
    try {
      let info = await this.plugin.checkEnvironment();
      this.setStatus(
        "pt-env-status",
        info ? this.plugin.t("pt-status-ready", info) : this.plugin.t("pt-status-not-ready")
      );
    }
    catch (e) {
      this.setStatus("pt-env-status", String(e.message || e), true);
    }
  },

  async setUpEnvironment() {
    let button = document.getElementById("pt-env-setup");
    button.disabled = true;
    try {
      await this.plugin.ensureEnvironment((status) => this.setStatus("pt-env-status", status));
      await this.refreshEnvironmentStatus();
    }
    catch (e) {
      this.setStatus("pt-env-status", String(e.message || e), true);
    }
    finally {
      button.disabled = false;
    }
  },

  async testConnection() {
    let button = document.getElementById("pt-test");
    button.disabled = true;
    this.setStatus("pt-test-status", this.plugin.t("pt-test-running"));
    try {
      let settings = this.plugin.getSettings();
      if (!settings.baseURL || !settings.apiKey || !settings.model) {
        throw new Error(this.plugin.t("pt-error-missing-settings"));
      }
      await this.plugin.testConnection(settings);
      this.setStatus("pt-test-status", this.plugin.t("pt-test-ok"));
    }
    catch (e) {
      this.setStatus("pt-test-status", String(e.message || e), true);
    }
    finally {
      button.disabled = false;
    }
  },

  async openEnvironmentFolder() {
    await IOUtils.makeDirectory(this.plugin.dataDir, { ignoreExisting: true });
    Zotero.File.reveal(this.plugin.dataDir);
  },
};

// The pane dispatches a non-bubbling 'load' event at its top-level element.
// Inline onload handlers would run in the window scope, not this sandbox, and
// load events never reach the window, so capture it on the document.
document.addEventListener(
  "load",
  function onPaneLoad(event) {
    if (event.target.id === "paper-translator-pane") {
      document.removeEventListener("load", onPaneLoad, true);
      PaperTranslatorPrefs.init();
    }
  },
  true
);
