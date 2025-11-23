export interface ResearchResult {
  markdown: string;
  sources: Array<{
    title: string;
    uri: string;
  }>;
}

export interface CodeSnippet {
  language: string;
  code: string;
  explanation: string;
}

export enum AppState {
  IDLE = 'IDLE',
  RESEARCHING = 'RESEARCHING',
  GENERATING_CODE = 'GENERATING_CODE',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface MockTranscript {
  id: string;
  caller: string;
  duration: string;
  status: string;
  timestamp: string;
  transcript: string;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
}