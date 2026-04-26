"""
ollama_client.py (root level)
Convenience re-export so you can import from root or from llm/.
"""
from llm.ollama_client import get_explanation, build_prompt

__all__ = ["get_explanation", "build_prompt"]
