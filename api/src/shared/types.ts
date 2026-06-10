export interface GameEntity {
  partitionKey: string;
  rowKey: string;
  createdBy: string;
  createdAt: Date;
  status: 'lobby' | 'grouping' | 'statements' | 'voting' | 'results';
  groupSize: number;
  currentVotingGroup?: string;
  votedGroups?: string; // JSON array
}

export interface PlayerEntity {
  partitionKey: string; // gameId
  rowKey: string; // playerId
  displayName: string;
  groupLetter?: string;
  joinedAt: Date;
  score: number;
}

export interface StatementEntity {
  partitionKey: string; // gameId
  rowKey: string; // `${groupLetter}_${statementNumber}`
  groupLetter: string;
  statementNumber: number;
  text: string;
  isLie: boolean;
  enteredBy: string;
  updatedAt: Date;
}

export interface VoteEntity {
  partitionKey: string; // gameId
  rowKey: string; // `${playerId}_${groupLetter}`
  playerId: string;
  groupLetter: string;
  chosenStatement: number;
  votedAt: Date;
  isCorrect?: boolean;
  pointsAwarded?: number;
}

export interface GameKeeperEntity {
  partitionKey: string;
  rowKey: string; // email
  displayName: string;
  addedBy: string;
  addedAt: Date;
}
