import type { AIProvider } from './provider.js';
import { NoOpProvider } from './none.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';

let activeProvider: AIProvider = new NoOpProvider();

export function setAIProvider(providerName: string): AIProvider {
  switch (providerName.toLowerCase()) {
    case 'ollama':
      activeProvider = new OllamaProvider();
      break;
    case 'openai':
      activeProvider = new OpenAIProvider();
      break;
    default:
      activeProvider = new NoOpProvider();
      break;
  }
  return activeProvider;
}

export function getAIProvider(): AIProvider {
  const envProvider = process.env.AMNESHIA_AI_PROVIDER;
  if (envProvider && activeProvider.name === 'none') {
    setAIProvider(envProvider);
  }
  return activeProvider;
}

export async function synthesizeObservations(observations: string[]): Promise<string> {
  const provider = getAIProvider();
  if (provider.name === 'none') {
    return observations.join('\n');
  }
  return provider.summarize(observations);
}
