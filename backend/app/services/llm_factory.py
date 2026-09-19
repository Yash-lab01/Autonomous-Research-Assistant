import os
import json
import logging
import httpx
from typing import Optional, Dict, Any, List, Union
from app.config import settings

logger = logging.getLogger("ai_research_os.llm_factory")

class LLMFactory:
    """
    Workload-Aware LLM Provider Router.
    - Interactive tasks -> Groq API (qwen/qwen3.8-27b or openai/gpt-oss-120b) for high speed & reasoning.
    - Bulk/Background tasks -> Local Ollama (qwen2.5:7b) to save cloud API quota.
    - Gracefully handles HTTP 429 rate limits, timeouts, and missing API keys by falling back to Ollama.
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
            # Try primary model, then failover to other supported Groq models
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
            # If Groq is available as secondary fallback for bulk, try it
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
                    except Exception as groq_err:
                        pass
            
            raise RuntimeError(f"LLM execution failed: Ollama unreachable ({err_msg}). Please check that GROQ_API_KEY is valid or Ollama is running at {settings.OLLAMA_BASE_URL}.")

    @staticmethod
    async def _call_groq(
        prompt: str,
        system_prompt: Optional[str],
        api_key: str,
        model: str,
        response_format: Optional[str],
        temperature: float
    ) -> str:
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

        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
            if res.status_code == 429:
                raise Exception("Groq 429 Rate Limit Exceeded")
            res.raise_for_status()
            data = res.json()
            return data["choices"][0]["message"]["content"]

    @staticmethod
    async def _call_ollama(
        prompt: str,
        system_prompt: Optional[str],
        model: str,
        response_format: Optional[str],
        temperature: float
    ) -> str:
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

        async with httpx.AsyncClient(timeout=300.0) as client:
            res = await client.post(url, json=payload)
            res.raise_for_status()
            data = res.json()
            return data["message"]["content"]
