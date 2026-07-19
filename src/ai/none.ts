import type { AIProvider, SynthesisResult } from './provider.js';

export class NoOpProvider implements AIProvider {
  name = 'none';

  async synthesize(newContent: string): Promise<SynthesisResult> {
    return { content: newContent, tags: [] };
  }

  async summarize(observations: string[]): Promise<string> {
    return observations.join('\n');
  }

  async deduplicate(observations: string[]): Promise<string[]> {
    return Array.from(new Set(observations));
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    return '';
  }
}
