"""Bridge between the Zotero plugin and BabelDOC.

Usage:
    python runner.py check      print versions and exit
    python runner.py warmup     download BabelDOC models, fonts and cmaps
    python runner.py ping       read a JSON job from stdin and test the API settings
    python runner.py translate  read a JSON job from stdin and translate it

Every message meant for the plugin is one line on stdout prefixed with
PROTOCOL_PREFIX and followed by a JSON object. Anything else on stdout or
stderr is log output, which the plugin keeps for error reports.
"""

import asyncio
import json
import multiprocessing as mp
import os
import sys
import threading
import time
import traceback

PROTOCOL_PREFIX = "@@PT "

# Libraries print to stdout freely; keep a private handle to the real stdout
# for protocol messages and send everything else to stderr.
_protocol_out = os.fdopen(os.dup(1), "w", buffering=1, encoding="utf-8")
os.dup2(2, 1)
sys.stdout = sys.stderr


def emit(message_type, **fields):
    _protocol_out.write(
        PROTOCOL_PREFIX + json.dumps({"type": message_type, **fields}, ensure_ascii=False) + "\n"
    )
    _protocol_out.flush()


def check():
    import babeldoc

    emit("check", python=sys.version.split()[0], babeldoc=babeldoc.__version__)


def warmup():
    import babeldoc.assets.assets
    import babeldoc.format.pdf.high_level

    babeldoc.format.pdf.high_level.init()
    babeldoc.assets.assets.warmup()
    emit("done")


class ApiCheckError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def ping(job):
    """Send one tiny request with the job's settings.

    BabelDOC swallows API errors and silently keeps the source text, so a bad
    key or model has to be caught before the translation starts.
    """
    import openai

    client = openai.OpenAI(base_url=job["base_url"], api_key=job["api_key"], timeout=60)
    extra_body = {"reasoning": {"effort": job["reasoning"]}} if job.get("reasoning") else None
    try:
        client.chat.completions.create(
            model=job["model"],
            messages=[{"role": "user", "content": "Translate to Chinese: Hello"}],
            extra_body=extra_body,
        )
    except openai.AuthenticationError as e:
        raise ApiCheckError("auth", str(e)) from e
    except openai.NotFoundError as e:
        raise ApiCheckError("not_found", str(e)) from e
    except openai.APIConnectionError as e:
        raise ApiCheckError("connection", str(e)) from e
    except openai.APIStatusError as e:
        raise ApiCheckError("api", str(e)) from e


async def translate(job):
    ping(job)

    import babeldoc.format.pdf.high_level
    from babeldoc.docvision.doclayout import DocLayoutModel
    from babeldoc.format.pdf.translation_config import TranslationConfig
    from babeldoc.format.pdf.translation_config import WatermarkOutputMode
    from babeldoc.translator.translator import OpenAITranslator
    from babeldoc.translator.translator import set_translate_rate_limiter

    babeldoc.format.pdf.high_level.init()

    class CountingTranslator(OpenAITranslator):
        """Counts calls that succeed (cache hits included) and calls that fail.

        BabelDOC keeps the source text when a call fails, so these counts are
        the only way to tell a translated document from an untouched one.
        """

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.lock = threading.Lock()
            self.succeeded = 0
            self.failed = 0

        def _count(self, call, *args, **kwargs):
            try:
                result = call(*args, **kwargs)
            except Exception:
                with self.lock:
                    self.failed += 1
                raise
            with self.lock:
                self.succeeded += 1
            return result

        def translate(self, *args, **kwargs):
            return self._count(super().translate, *args, **kwargs)

        def llm_translate(self, *args, **kwargs):
            return self._count(super().llm_translate, *args, **kwargs)

    translator_kwargs = {}
    if job.get("reasoning"):
        translator_kwargs["reasoning"] = job["reasoning"]
    translator = CountingTranslator(
        lang_in=job.get("lang_in", "en"),
        lang_out=job.get("lang_out", "zh"),
        model=job["model"],
        base_url=job["base_url"],
        api_key=job["api_key"],
        ignore_cache=False,
        **translator_kwargs,
    )
    qps = int(job.get("qps") or 4)
    set_translate_rate_limiter(qps)

    output = job.get("output", "mono")
    doc_layout_model = DocLayoutModel.load_onnx()
    config = TranslationConfig(
        input_file=job["input"],
        output_dir=job["output_dir"],
        translator=translator,
        term_extraction_translator=translator,
        lang_in=job.get("lang_in", "en"),
        lang_out=job.get("lang_out", "zh"),
        pages=job.get("pages") or None,
        qps=qps,
        doc_layout_model=doc_layout_model,
        no_mono=output == "dual",
        no_dual=output == "mono",
        watermark_output_mode=WatermarkOutputMode.NoWatermark,
        custom_system_prompt=job.get("custom_prompt") or None,
        auto_extract_glossary=job.get("auto_extract_glossary", True),
    )
    getattr(doc_layout_model, "init_font_mapper", lambda _config: None)(config)

    last_sent = 0.0
    last_stage = None
    async for event in babeldoc.format.pdf.high_level.async_translate(config):
        event_type = event["type"]
        if event_type in ("progress_start", "progress_update", "progress_end"):
            stage = event.get("stage")
            now = time.monotonic()
            # Throttle updates; always report stage changes
            if stage != last_stage or now - last_sent >= 0.5:
                emit(
                    "progress",
                    stage=stage,
                    stage_current=event.get("stage_current"),
                    stage_total=event.get("stage_total"),
                    overall=round(event.get("overall_progress") or 0, 1),
                )
                last_sent, last_stage = now, stage
        elif event_type == "error":
            emit("error", message=str(event.get("error")))
            return 1
        elif event_type == "finish":
            result = event["translate_result"]
            if translator.succeeded == 0:
                emit(
                    "error",
                    code="nothing_translated",
                    message=f"all {translator.failed} translation requests failed",
                )
                return 1
            emit(
                "done",
                mono=str(result.mono_pdf_path) if result.mono_pdf_path else None,
                dual=str(result.dual_pdf_path) if result.dual_pdf_path else None,
                tokens=translator.token_count.value,
                failed_requests=translator.failed,
            )
            return 0
    emit("error", message="BabelDOC finished without a result")
    return 1


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if command == "check":
            check()
        elif command == "warmup":
            warmup()
        elif command == "ping":
            ping(json.loads(sys.stdin.read()))
            emit("done")
        elif command == "translate":
            job = json.loads(sys.stdin.read())
            return asyncio.run(translate(job))
        else:
            emit("error", message=f"unknown command: {command!r}")
            return 2
    except ApiCheckError as e:
        emit("error", code=e.code, message=str(e))
        return 1
    except Exception as e:
        traceback.print_exc()
        emit("error", message=f"{type(e).__name__}: {e}")
        return 1
    return 0


if __name__ == "__main__":
    mp.set_start_method("spawn" if sys.platform in ("darwin", "win32") else "forkserver")
    sys.exit(main())
