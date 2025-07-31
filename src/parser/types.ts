export interface Contact {
  name: string;
  unlocked: boolean;
  playerInitiated: boolean;
  rounds: Record<number, Round>;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface Round {
  passage: string;
  choices: Choice[];
  actions: Action[];
  conditions?: string;
}

export interface Choice {
  text: string;
  targetPassage: string;
  displayText?: string;
}

export interface Action {
  type: string;
  parameters: Record<string, string | number | boolean>;
}

export interface GameData {
  contacts: Record<string, Contact>;
  variables: Record<string, any>;
  gameFlow: {
    startingPassages: string[];
    conditions: Record<string, string>;
  };
  metadata: {
    title: string;
    format: string;
    formatVersion: string;
    startPassage: string;
  };
}

export interface ParsedPassage {
  title: string;
  tags: string[];
  content: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface VariableAssignment {
  variableName: string;
  value: any;
  lineNumber: number;
}

export interface ActionDefinition {
  actionType: string;
  parameters: Record<string, string | number | boolean>;
  lineNumber: number;
}

export interface ParserError {
  type: 'syntax' | 'missing_file' | 'invalid_action' | 'circular_reference' | 'dead_end';
  message: string;
  lineNumber?: number;
  passage?: string;
}

export interface ParserResult {
  gameData: GameData;
  errors: ParserError[];
  warnings: ParserError[];
} 