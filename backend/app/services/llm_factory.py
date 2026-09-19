import os
import json
import logging
import httpx
from typing import Optional, Dict, Any, List, Union, AsyncGenerator
from app.config import settings

logger = logging.getLogger("ai_research_os.llm_factory")

# Persistent shared HTTP client with connection pooling & keep-alive
_http_client: Optional[httpx.AsyncClient] = None

def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=10.0),
            limits=httpx.Limits(max_keepalive_connections=25, max_connections=50)
        )
    return _http_client


class LLMFactory:
    """
    Workload-Aware LLM Provider Router with Connection Pooling & Real-Time Token Streaming.
    - Interactive tasks -> Groq Cloud API (qwen/qwen3.8-27b or openai/gpt-oss-120b)
    - Bulk/Background tasks -> Local Ollama (qwen2.5:7b)
    - Stream support -> stream_llm() yields progressive tokens directly from provider
    """

    @staticmethod
    async def invoke_llm(
        prompt: str,
        system_prompt: Optional[str] = None,
        workload_type: str = "interactive", # "interactive" | "bulk"
        response_format: Optional[str] = None, # "json_object" | None
        temperature: float = 0.2
    ) -> str:
        """
        Executes LLM call with workload-based routing and automatic rate-limit failover.
        """
        groq_api_key = settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")

        # Guard against 413 Payload Too Large by truncating excessively long prompts
        safe_prompt = prompt
        if len(safe_prompt) > 12000:
            logger.warning(f"Prompt length ({len(safe_prompt)} chars) exceeds safe threshold for Groq TPM. Truncating context.")
            safe_prompt = safe_prompt[:6000] + "\n\n...[Context truncated to fit token limits]...\n\n" + safe_prompt[-4000:]

        # Decide primary target based on workload type and key availability
        if workload_type == "interactive" and groq_api_key:
            groq_models = [settings.GROQ_PRIMARY_MODEL]
            for alt in ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]:
                if alt not in groq_models:
                    groq_models.append(alt)

            last_groq_error = None
            for model_name in groq_models:
                try:
                    logger.info(f"Routing interactive workload to Groq ({model_name})...")
                    return await LLMFactory._call_groq(
                        prompt=safe_prompt,
                        system_prompt=system_prompt,
                        api_key=groq_api_key,
                        model=model_name,
                        response_format=response_format,
                        temperature=temperature
                    )
                except Exception as e:
                    last_groq_error = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
                    logger.warning(f"Groq ({model_name}) call failed ({last_groq_error}). Trying next option...")

            logger.warning(f"All Groq models failed. Last error: {last_groq_error}. Falling back to local Ollama...")

        # Default or Fallback: Call local Ollama
        try:
            logger.info(f"Routing workload ({workload_type}) to local Ollama ({settings.OLLAMA_FALLBACK_MODEL})...")
            return await LLMFactory._call_ollama(
                prompt=safe_prompt,
                system_prompt=system_prompt,
                model=settings.OLLAMA_FALLBACK_MODEL,
                response_format=response_format,
                temperature=temperature
            )
        except Exception as e:
            err_msg = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
            logger.error(f"Local Ollama call failed ({err_msg}).")
            if workload_type == "bulk" and groq_api_key:
                for alt_m in [settings.GROQ_PRIMARY_MODEL, "openai/gpt-oss-120b"]:
                    try:
                        logger.info(f"Attempting secondary fallback to Groq ({alt_m})...")
                        return await LLMFactory._call_groq(
                            prompt=safe_prompt,
                            system_prompt=system_prompt,
                            api_key=groq_api_key,
                            model=alt_m,
                            response_format=response_format,
                            temperature=temperature
                        )
                    except Exception:
                        pass
            
            raise RuntimeError(f"LLM execution failed: Ollama unreachable ({err_msg}). Please check that GROQ_API_KEY is valid or Ollama is running at {settings.OLLAMA_BASE_URL}.")

    @staticmethod
    async def stream_llm(
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2
    ) -> AsyncGenerator[str, None]:
        """
        Asynchronously streams tokens directly from Groq Cloud (or local Ollama fallback).
        Yields individual text delta tokens as they are generated.
        """
        groq_api_key = settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")

        safe_prompt = prompt
        if len(safe_prompt) > 12000:
            logger.warning(f"Prompt length ({len(safe_prompt)} chars) exceeds safe threshold for Groq TPM. Truncating context.")
            safe_prompt = safe_prompt[:6000] + "\n\n...[Context truncated to fit token limits]...\n\n" + safe_prompt[-4000:]

        if groq_api_key:
            groq_models = [settings.GROQ_PRIMARY_MODEL, "openai/gpt-oss-120b", "openai/gpt-oss-20b"]
            for model_name in groq_models:
                try:
                    logger.info(f"Streaming interactive workload from Groq ({model_name})...")
                    async for token in LLMFactory._stream_groq(
                        prompt=safe_prompt,
                        system_prompt=system_prompt,
                        api_key=groq_api_key,
                        model=model_name,
                        temperature=temperature
                    ):
                        yield token
                    return
                except Exception as e:
                    logger.warning(f"Groq streaming ({model_name}) failed ({e}). Trying next model or fallback...")

        # Fallback to streaming from Ollama
        try:
            logger.info(f"Streaming fallback from local Ollama ({settings.OLLAMA_FALLBACK_MODEL})...")
            async for token in LLMFactory._stream_ollama(
                prompt=safe_prompt,
                system_prompt=system_prompt,
                model=settings.OLLAMA_FALLBACK_MODEL,
                temperature=temperature
            ):
                yield token
        except Exception as e:
            logger.error(f"Local Ollama streaming failed ({e}).")
            yield f"\n\n[Error: Both Groq Cloud and local Ollama were unreachable: {e}]"

    @staticmethod
    async def _call_groq(
        prompt: str,
        system_prompt: Optional[str],
        api_key: str,
        model: str,
        response_format: Optional[str],
        temperature: float
    ) -> str:
        client = get_http_client()
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature
        }
        if response_format == "json_object":
            payload["response_format"] = {"type": "json_object"}

        res = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        if res.status_code == 429:
            raise Exception("Groq 429 Rate Limit Exceeded")
        res.raise_for_status()
        data = res.json()
        return data["choices"][0]["message"]["content"]

    @staticmethod
    async def _stream_groq(
        prompt: str,
        system_prompt: Optional[str],
        api_key: str,
        model: str,
        temperature: float
    ) -> AsyncGenerator[str, None]:
        client = get_http_client()
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": True
        }

        async with client.stream("POST", "https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload) as res:
            if res.status_code == 429:
                raise Exception("Groq 429 Rate Limit Exceeded")
            res.raise_for_status()
            async for line in res.aiter_lines():
                line = line.strip()
                if not line or line == "data: [DONE]":
                    continue
                if line.startswith("data: "):
                    raw = line[6:]
                    try:
                        chunk = json.loads(raw)
                        delta = chunk["choices"][0].get("delta", {})
                        content = delta.get("content")
                        if content:
                            yield content
                    except Exception:
                        continue

    @staticmethod
    async def _call_ollama(
        prompt: str,
        system_prompt: Optional[str],
        model: str,
        response_format: Optional[str],
        temperature: float
    ) -> str:
        client = get_http_client()
        url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature}
        }
        if response_format == "json_object":
            payload["format"] = "json"

        res = await client.post(url, json=payload)
        res.raise_for_status()
        data = res.json()
        return data["message"]["content"]

    @staticmethod
    async def _stream_ollama(
        prompt: str,
        system_prompt: Optional[str],
        model: str,
        temperature: float
    ) -> AsyncGenerator[str, None]:
        client = get_http_client()
        url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "options": {"temperature": temperature}
        }

        async with client.stream("POST", url, json=payload) as res:
            res.raise_for_status()
            async for line in res.aiter_lines():
                line = line.strip()
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                    content = chunk.get("message", {}).get("content")
                    if content:
                        yield content
                except Exception:
                    continue
