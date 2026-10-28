var PaperTranslator;

function install() {}

async function startup({ id, version, rootURI }) {
  Services.scriptloader.loadSubScript(rootURI + "content/paper-translator.js");
  PaperTranslator.init({ id, version, rootURI });
  await PaperTranslator.startup();
}

function onMainWindowLoad({ window }) {
  PaperTranslator.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  PaperTranslator.removeFromWindow(window);
}

function shutdown() {
  PaperTranslator.shutdown();
  PaperTranslator = undefined;
}

function uninstall() {}
