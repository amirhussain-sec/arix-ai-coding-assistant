export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  preferredLanguage: string;
  avatarColor: string;
  onboarded: boolean;
  authProvider: string;
  createdAt: string;
}

export interface UserSettings {
  theme: 'dark' | 'light';
  editorFontSize: number;
  voiceName: string;
  voiceRate: number;
  voicePitch: number;
  voicePreset: string;
  autoReadReplies: boolean;
  autoSendSpeech: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  primaryLanguage: string;
  isAgentProject: boolean;
  fileCount: number;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEntry {
  id: string;
  type: 'ai' | 'run' | 'project';
  title: string;
  detail: string;
  language: string;
  createdAt: string;
}

export interface DailyUsagePoint {
  date: string;
  label: string;
  count: number;
}

export interface DashboardData {
  stats: {
    totalProjects: number;
    codeExecutions: number;
    aiRequests: number;
    historyEntries: number;
  };
  recentProjects: ProjectSummary[];
  recentActivity: ActivityEntry[];
  usageChart: DailyUsagePoint[];
}
