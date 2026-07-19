export interface SynthesisResult {
  content: string;
  tags: string[];
}

export interface AIProvider {
  name: string;
  synthesize(newContent: string, contextObservations?: string[]): Promise<SynthesisResult>;
  summarize(observations: string[]): Promise<string>;
  deduplicate(observations: string[]): Promise<string[]>;
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
}
