from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class BaseAIProvider(ABC):
    """Abstract base class for all VCS AI assistant providers."""

    @abstractmethod
    def generate_chat_response(
        self,
        messages: List[Dict[str, str]],
        system_instruction: str,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_results: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 800,
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        """
        Generate response from LLM.

        Returns:
            dict with:
                - content (str): Assistant text reply
                - tool_calls (list of dict): e.g. [{"name": str, "arguments": dict}]
                - usage (dict): {"prompt_tokens": int, "completion_tokens": int}
                - model (str): identifier of model used
        """
        raise NotImplementedError
