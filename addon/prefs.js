pref("extensions.paper-translator.baseURL", "https://api.openai.com/v1");
pref("extensions.paper-translator.apiKey", "");
pref("extensions.paper-translator.model", "");
pref("extensions.paper-translator.langOut", "zh");
// Gemini and other thinking models burn BabelDOC's 2048-token output limit
// on reasoning unless the effort is turned down
pref("extensions.paper-translator.reasoning", "minimal");
pref("extensions.paper-translator.qps", "8");
pref("extensions.paper-translator.output", "mono");
pref("extensions.paper-translator.customPrompt", "You are a professional translator of academic papers. Translate into fluent, accurate text using the standard terminology of the field. Never translate person names, author lists, citations (e.g. 'Xu et al., 2019'), URLs, email addresses, code identifiers or dataset/model names; keep them exactly as in the source.");
pref("extensions.paper-translator.openWhenDone", true);
pref("extensions.paper-translator.uvPath", "");
// Hidden: BabelDOC page selection such as "1-3,5"; empty translates everything
pref("extensions.paper-translator.pages", "");
