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
    - Interactive tasks -> Groq API (llama-3.3-70b-versatile) for high speed & reasoning.
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

        # Decide primary target based on workload type and key availability
        if workload_type == "interactive" and groq_api_key:
            try:
                logger.info(f"Routing interactive workload to Groq ({settings.GROQ_PRIMARY_MODEL})...")
                return await LLMFactory._call_groq(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    api_key=groq_api_key,
                    model=settings.GROQ_PRIMARY_MODEL,
                    response_format=response_format,
                    temperature=temperature
                )
            except Exception as e:
                logger.warning(f"Groq API call failed ({e}). Falling back to local Ollama...")
                # Fallthrough to Ollama

        # Default or Fallback: Call local Ollama
        try:
            logger.info(f"Routing workload ({workload_type}) to local Ollama ({settings.OLLAMA_FALLBACK_MODEL})...")
            return await LLMFactory._call_ollama(
                prompt=prompt,
                system_prompt=system_prompt,
                model=settings.OLLAMA_FALLBACK_MODEL,
                response_format=response_format,
                temperature=temperature
            )
        except Exception as e:
            logger.error(f"Local Ollama call failed ({e}).")
            # If Groq is available as secondary fallback for bulk, try it
            if workload_type == "bulk" and groq_api_key:
                try:
                    logger.info("Attempting secondary fallback to Groq...")
                    return await LLMFactory._call_groq(
                        prompt=prompt,
                        system_prompt=system_prompt,
                        api_key=groq_api_key,
                        model=settings.GROQ_PRIMARY_MODEL,
                        response_format=response_format,
                        temperature=temperature
                    )
                except Exception as groq_err:
                    raise RuntimeError(f"Both Ollama and Groq LLM calls failed: Ollama ({e}), Groq ({groq_err})")
            
            raise RuntimeError(f"LLM execution failed: {e}. Ensure Ollama is running at {settings.OLLAMA_BASE_URL} or supply a valid GROQ_API_KEY.")

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

        async with httpx.AsyncClient(timeout=60.0) as client:
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

        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(url, json=payload)
            res.raise_for_status()
            data = res.json()
            return data["message"]["content"]
