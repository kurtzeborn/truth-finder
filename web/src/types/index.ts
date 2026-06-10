export interface Game {
  id: string;
  createdBy: string;
  createdAt: string;
  status: 'lobby' | 'grouping' | 'statements' | 'voting' | 'results';
  groupSize: number;
  currentVotingGroup?: string;
  votedGroups: string[];
}

export interface Player {
  id: string;
  gameId: string;
  displayName: string;
  groupLetter?: string;
  joinedAt: string;
  score: number;
}

export interface Statement {
  gameId: string;
  groupLetter: string;
  statementNumber: number;
  text: string;
  isLie: boolean;
  enteredBy: string;
  updatedAt: string;
}

export interface Vote {
  gameId: string;
  playerId: string;
  groupLetter: string;
  chosenStatement: number;
  votedAt: string;
  isCorrect?: boolean;
  pointsAwarded?: number;
}

export interface PlayerSession {
  gameId: string;
  playerId: string;
  displayName: string;
  groupLetter?: string;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  user?: {
    userId: string;
    userDetails: string;
    identityProvider: string;
    userRoles: string[];
  };
  isGameKeeper: boolean;
}

export interface GameKeeper {
  email: string;
  displayName: string;
  addedBy: string;
  addedAt: string;
}

// Unified game state returned by the polling endpoint
export interface GameState {
  game: Game;
  player?: Player;
  players?: Player[];
  groupMembers?: Player[];
  statements?: Statement[];
  currentVotingStatements?: Array<{ statementNumber: number; text: string; isLie?: boolean }>;
  hasVoted?: boolean;
  voteCount?: number;
  votingClosed?: boolean;
  playerVoteResult?: { chosenStatement: number; isCorrect: boolean; pointsAwarded: number };
  scores?: Array<{ id: string; displayName: string; score: number }>;
}
