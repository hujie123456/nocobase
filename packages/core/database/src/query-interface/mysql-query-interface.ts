import QueryInterface from './query-interface';
import { Collection } from '../collection';
import { Transactionable } from 'sequelize';
import sqlParser from '../sql-parser';

export default class MysqlQueryInterface extends QueryInterface {
  constructor(db) {
    super(db);
  }

  async collectionTableExists(collection: Collection, options?: Transactionable) {
    const transaction = options?.transaction;

    const tableName = collection.model.tableName;
    const databaseName = this.db.options.database;
    const sql = `SELECT TABLE_NAME
                 FROM INFORMATION_SCHEMA.TABLES
                 WHERE TABLE_SCHEMA = '${databaseName}'
                   AND TABLE_NAME = '${tableName}'`;

    const results = await this.db.sequelize.query(sql, { type: 'SELECT', transaction });
    return results.length > 0;
  }

  async listViews() {
    const sql = `SELECT TABLE_NAME as name, VIEW_DEFINITION as definition
                 FROM information_schema.views
                 WHERE TABLE_SCHEMA = DATABASE()
                 ORDER BY TABLE_NAME;`;

    return await this.db.sequelize.query(sql, { type: 'SELECT' });
  }

  async viewColumnUsage(options: { viewName: string; schema?: string }): Promise<{
    [view_column_name: string]: {
      column_name: string;
      table_name: string;
      table_schema?: string;
    };
  }> {
    try {
      const viewDefinition = await this.db.sequelize.query(`SHOW CREATE VIEW ${options.viewName}`, { type: 'SELECT' });
      const createView = viewDefinition[0]['Create View'];
      const regex = /(?<=AS\s)([\s\S]*)/i;
      const match = createView.match(regex);
      const sql = match[0];

      const { ast } = sqlParser.parse(sql);

      const columns = ast.columns;

      const results = [];
      for (const column of columns) {
        if (column.expr.type === 'column_ref') {
          results.push([
            column.as || column.expr.column,
            {
              column_name: column.expr.column,
              table_name: column.expr.table,
            },
          ]);
        }
      }

      return Object.fromEntries(results);
    } catch (e) {
      this.db.logger.warn(e);

      return {};
    }
  }
}
