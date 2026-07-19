import type { AIProvider, SynthesisResult } from './provider.js';

export class OllamaProvider implements AIProvider {
  name = 'ollama';
  private url = process.env.AMNESHIA_OLLAMA_URL || 'http://localhost:11434/api/chat';
  private model = process.env.AMNESHIA_OLLAMA_MODEL || 'llama3.2';

  private async call(messages: { role: string; content: string }[]): Promise<string> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, messages, stream: false }),
      });
      if (!response.ok) throw new Error(`Ollama API error: ${response.statusText}`);
      const data = await response.json() as { message: { content: string } };
      return data.message.content;
    } catch (e) {
      return ''; // Fallback to empty string for graceful failure
    }
  }

  async synthesize(newContent: string, contextObservations?: string[]): Promise<SynthesisResult> {
    const prompt = contextObservations
      ? `Context: ${contextObservations.join('\n')}\n\nNew Content: ${newContent}\n\nSynthesize and provide tags.`
      : newContent;
    const response = await this.call([{ role: 'user', content: prompt }]);
    return response ? { content: response, tags: [] } : { content: newContent, tags: [] };
  }

  async summarize(observations: string[]): Promise<string> {
    const response = await this.call([{ role: 'user', content: `Summarize:\n${observations.join('\n')}` }]);
    return response || observations.join('\n');
  }

  async deduplicate(observations: string[]): Promise<string[]> {
    const response = await this.call([{ role: 'user', content: `Deduplicate:\n${observations.join('\n')}` }]);
    return response ? response.split('\n') : Array.from(new Set(observations));
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    return this.call(messages);
  }
}
