import { TableClient } from '@azure/data-tables';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';

function getTableClient(tableName: string): TableClient {
  return TableClient.fromConnectionString(connectionString, tableName);
}

export async function initializeTables(): Promise<void> {
  const tableNames = ['games', 'players', 'statements', 'votes', 'gamekeepers'];
  for (const tableName of tableNames) {
    const client = getTableClient(tableName);
    try {
      await client.createTable();
    } catch (error: any) {
      if (error.statusCode !== 409) {
        throw error;
      }
    }
  }
}

export const gamesTable = getTableClient('games');
export const playersTable = getTableClient('players');
export const statementsTable = getTableClient('statements');
export const votesTable = getTableClient('votes');
export const gamekeepersTable = getTableClient('gamekeepers');
