import type { AIProvider, SynthesisResult } from './provider.js';

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private apiKey = process.env.AMNESHIA_OPENAI_API_KEY;
  private model = process.env.AMNESHIA_OPENAI_MODEL || 'gpt-4o-mini';

  private async call(messages: { role: string; content: string }[]): Promise<string> {
    if (!this.apiKey) return '';
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, messages }),
      });
      if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0].message.content;
    } catch (e) {
      return '';
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
