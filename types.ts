
export enum GradeLevel {
  HIGH_SCHOOL = 'High School',
  COLLEGE = 'College'
}

export enum AppMode {
  NORMAL = 'Normal',
  CONCEPT_EXPLAINER = '3-Level Explain',
  ERROR_CHECKER = 'Error Checker',
  ESSAY_DRAFT = 'Essay Draft'
}

export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  image?: string;
  visualAids?: string[];
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  gradeLevel: GradeLevel;
  messages: Message[];
  lastUpdated: Date;
}

export interface AppState {
  gradeLevel: GradeLevel;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  currentSessionId: string | null;
  isPro: boolean;
  dailyUsageCount: number;
  lastUsageDate: string;
  currentMode: AppMode;
}
