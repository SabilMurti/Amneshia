"""
brain.py — Amneshia Super Mini LLM (In-Process)

Loads a local GGUF model via llama-cpp-python and uses it to:
  1. Synthesize new memory with existing context (dedup/summarize)
  2. Auto-tag raw memory before storing
  3. Generate structured export content

This module is OPTIONAL. If the model fails to load (missing file, low mem, etc.),
Amneshia falls back to plain-text storage without LLM intervention.
"""
import os
import json
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

class MemoryBrain:
    """
    In-process mini LLM that enhances Amneshia's memory pipeline.
    Designed to work with Qwen2.5-0.5B-Instruct-GGUF or similar small models.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.llm = None
        self.model_path = model_path
        self._ready = False

    def load(self, model_path: Optional[str] = None) -> bool:
        """
        Load a GGUF model. If no path given, tries the default location
        or auto-downloads from Hugging Face.
        """
        from huggingface_hub import hf_hub_download

        path = model_path or self.model_path
        if not path:
            # Auto-download Qwen2.5-0.5B-Instruct GGUF from Hugging Face
            try:
                path = hf_hub_download(
                    repo_id="Qwen/Qwen2.5-0.5B-Instruct-GGUF",
                    filename="qwen2.5-0.5b-instruct-q4_k_m.gguf"
                )
            except Exception as e:
                logger.error(f"Failed to auto-download model: {e}")
                return False

        try:
            from llama_cpp import Llama
            self.llm = Llama(
                model_path=path,
                n_ctx=2048,
                n_threads=4,
                n_gpu_layers=0,
                verbose=False
            )
            self.model_path = path
            self._ready = True
            logger.info(f"Amneshia Brain loaded: {path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self.llm = None
            return False

    @property
    def ready(self) -> bool:
        return self._ready and self.llm is not None

    def synthesize_memory(
        self,
        new_content: str,
        existing_memories: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Takes raw user input and existing similar memories (from RAG),
        returns a dict with:
          - content: improved/synthesized text
          - tags: auto-generated tags list
          - action: 'merge' | 'append' | 'replace'
        If LLM is not ready, returns the original content unchanged.
        """
        if not self.ready:
            return {"content": new_content, "tags": [], "action": "append"}

        # Build prompt
        prompt = f"""You are Amneshia's memory synthesis engine.
You refine and connect new memories with existing context.

Current related memory context:
{json.dumps(existing_memories or [], indent=2)}

New raw input:
{new_content}

Respond in JSON only:
{{
  "content": "the synthesized/enhanced version",
  "tags": ["comma", "separated", "tags"],
  "action": "append" | "merge"
}}
"""

        try:
            response = self.llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": "You are a precise memory curator. Output ONLY valid JSON, no markdown."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=512,
                response_format={"type": "json_object"}
            )

            raw = response["choices"][0]["message"]["content"]
            result = json.loads(raw)
            return {
                "content": result.get("content", new_content),
                "tags": result.get("tags", []),
                "action": result.get("action", "append")
            }
        except Exception as e:
            logger.warning(f"Brain synthesis failed, using raw: {e}")
            return {"content": new_content, "tags": [], "action": "append"}

# Global singleton (lazy-loaded)
_brain: Optional[MemoryBrain] = None

def get_brain() -> MemoryBrain:
    global _brain
    if _brain is None:
        _brain = MemoryBrain()
    return _brain

def ensure_brain_loaded():
    """Call at startup to optionally load the brain."""
    brain = get_brain()
    if not brain.ready:
        brain.load()
