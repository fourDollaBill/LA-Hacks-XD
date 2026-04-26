"""
llm/ollama_client.py
"""
from ollama import chat

MODEL_NAME = "qwen3:latest"


def run_llm(prompt: str, model: str = MODEL_NAME, system: str | None = None) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = chat(
        model=model,
        messages=messages,
        options={
            "temperature": 0.2,
        },
    )

    return response["message"]["content"]


def get_explanation(prompt: str) -> str:
    return run_llm(prompt)


def build_prompt(*parts: str) -> str:
    return "\n\n".join(p for p in parts if p)
