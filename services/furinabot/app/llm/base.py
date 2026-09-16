from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class LLMProvider(ABC):
    @abstractmethod
    def stream(self, message: str, system_prompt: str) -> AsyncIterator[str]:
        """逐段返回模型的可见文本。具体 SDK 细节只存在于实现类中。"""
