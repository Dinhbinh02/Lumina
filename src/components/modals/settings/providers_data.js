export function getDefaultProviders() {
  return [
    { id: 'gemini-default', name: 'Gemini', type: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', apiKey: '', apiKeyUrl: 'https://aistudio.google.com/app/apikey' },
    { id: 'openai-default', name: 'OpenAI', type: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: '', apiKeyUrl: 'https://platform.openai.com/api-keys' },
    { id: 'anthropic-default', name: 'Anthropic (Claude)', type: 'openai', endpoint: 'https://api.anthropic.com/v1', apiKey: '', apiKeyUrl: 'https://console.anthropic.com/settings/keys' },
    { id: 'deepseek-default', name: 'DeepSeek', type: 'openai', endpoint: 'https://api.deepseek.com/v1', apiKey: '', apiKeyUrl: 'https://platform.deepseek.com/api_keys' },
    { id: 'grok-default', name: 'xAI (Grok)', type: 'openai', endpoint: 'https://api.x.ai/v1', apiKey: '', apiKeyUrl: 'https://console.x.ai/' },
    { id: 'perplexity-default', name: 'Perplexity AI', type: 'openai', endpoint: 'https://api.perplexity.ai', apiKey: '', apiKeyUrl: 'https://www.perplexity.ai/settings/api' },
    { id: 'openrouter-default', name: 'OpenRouter', type: 'openai', endpoint: 'https://openrouter.ai/api/v1', apiKey: '', apiKeyUrl: 'https://openrouter.ai/keys' },
    { id: 'groq-default', name: 'Groq', type: 'openai', endpoint: 'https://api.groq.com/openai/v1', apiKey: '', apiKeyUrl: 'https://console.groq.com/keys' },
    { id: 'mistral-default', name: 'Mistral AI', type: 'openai', endpoint: 'https://api.mistral.ai/v1', apiKey: '', apiKeyUrl: 'https://console.mistral.ai/api-keys/' },
    { id: 'cohere-default', name: 'Cohere', type: 'openai', endpoint: 'https://api.cohere.com/v1', apiKey: '', apiKeyUrl: 'https://dashboard.cohere.com/api-keys' },
    { id: 'together-default', name: 'Together AI', type: 'openai', endpoint: 'https://api.together.xyz/v1', apiKey: '', apiKeyUrl: 'https://api.together.ai/settings/api-keys' },
    { id: 'replicate-default', name: 'Replicate', type: 'openai', endpoint: 'https://api.replicate.com/v1', apiKey: '', apiKeyUrl: 'https://replicate.com/account/api-tokens' },
    { id: 'fireworks-default', name: 'Fireworks AI', type: 'openai', endpoint: 'https://api.fireworks.ai/inference/v1', apiKey: '', apiKeyUrl: 'https://fireworks.ai/account/api-keys' },
    { id: 'deepinfra-default', name: 'DeepInfra', type: 'openai', endpoint: 'https://api.deepinfra.com/v1/openai', apiKey: '', apiKeyUrl: 'https://deepinfra.com/dash/api_keys' },
    { id: 'novita-default', name: 'Novita AI', type: 'openai', endpoint: 'https://api.novita.ai/v3/openai', apiKey: '', apiKeyUrl: 'https://novita.ai/dashboard/key-management' },
    { id: 'huggingface-default', name: 'Hugging Face', type: 'openai', endpoint: 'https://api-inference.huggingface.co/v1', apiKey: '', apiKeyUrl: 'https://huggingface.co/settings/tokens' },
    { id: 'cerebras-default', name: 'Cerebras', type: 'openai', endpoint: 'https://api.cerebras.ai/v1', apiKey: '', apiKeyUrl: 'https://cloud.cerebras.ai/' },
    { id: 'alibaba-default', name: 'Alibaba Qwen', type: 'openai', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', apiKeyUrl: 'https://dashscope.console.aliyun.com/' },
    { id: 'moonshot-default', name: 'Moonshot AI (Kimi)', type: 'openai', endpoint: 'https://api.moonshot.cn/v1', apiKey: '', apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys' },
    { id: 'minimax-default', name: 'MiniMax', type: 'openai', endpoint: 'https://api.minimax.chat/v1', apiKey: '', apiKeyUrl: 'https://platform.minimaxi.com/' },
    { id: 'zhipu-default', name: 'Zhipu AI (GLM)', type: 'openai', endpoint: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
    { id: 'ollama-default', name: 'Ollama (Local)', type: 'openai', endpoint: 'http://localhost:11434/v1', apiKey: '', apiKeyUrl: 'https://ollama.com/' },
    { id: 'lmstudio-default', name: 'LM Studio (Local)', type: 'openai', endpoint: 'http://localhost:1234/v1', apiKey: '', apiKeyUrl: 'https://lmstudio.ai/' },
    { id: 'vllm-default', name: 'vLLM (Local)', type: 'openai', endpoint: 'http://localhost:8000/v1', apiKey: '', apiKeyUrl: 'https://github.com/vllm-project/vllm' },
    { id: 'localai-default', name: 'LocalAI (Local)', type: 'openai', endpoint: 'http://localhost:8080/v1', apiKey: '', apiKeyUrl: 'https://localai.io/' }
  ];
}
