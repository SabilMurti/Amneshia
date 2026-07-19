import type { AIProvider, SynthesisResult } from './provider.js';

export class NineRouterProvider implements AIProvider {
  name = '9router';
  private baseUrl = (process.env.AMNESHIA_NINEROUTER_BASE_URL || process.env.NINEROUTER_BASE_URL || 'http://localhost:20128/v1').replace(/\/$/, '');
  private apiKey = process.env.AMNESHIA_NINEROUTER_API_KEY || process.env.NINEROUTER_API_KEY || 'sk-9router';
  public model: string;

  constructor(model?: string) {
    this.model = model || process.env.AMNESHIA_NINEROUTER_MODEL || process.env.NINEROUTER_MODEL || '9router/ag/gemini-3-flash';
  }

  private async call(messages: { role: string; content: string }[]): Promise<string> {
    try {
      const url = `${this.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, messages }),
      });
      if (!response.ok) {
        throw new Error(`9router API error: ${response.statusText} (${response.status})`);
      }
      const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices?.[0]?.message?.content || '';
    } catch (e) {
      console.warn(`[9router Provider] Request failed: ${e instanceof Error ? e.message : String(e)}`);
      return '';
    }
  }

  async synthesize(newContent: string, contextObservations?: string[]): Promise<SynthesisResult> {
    const prompt = contextObservations
      ? `Context:\n${contextObservations.join('\n')}\n\nNew Content: ${newContent}\n\nSynthesize into a clear, concise memory statement.`
      : newContent;
    const response = await this.call([{ role: 'user', content: prompt }]);
    return response ? { content: response, tags: [] } : { content: newContent, tags: [] };
  }

  async summarize(observations: string[]): Promise<string> {
    const response = await this.call([{ role: 'user', content: `Summarize the following memory observations concisely:\n${observations.join('\n')}` }]);
    return response || observations.join('\n');
  }

  async deduplicate(observations: string[]): Promise<string[]> {
    const response = await this.call([{ role: 'user', content: `Deduplicate the following lines, keeping unique memory statements:\n${observations.join('\n')}` }]);
    return response ? response.split('\n').map(s => s.trim()).filter(Boolean) : Array.from(new Set(observations));
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    return this.call(messages);
  }
}
