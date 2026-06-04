const { AsyncLocalStorage } = require("node:async_hooks");
const { createClient } = require("@libsql/client");

function createDatabase(config) {
  const client = createClient(config);
  const storage = new AsyncLocalStorage();

  function activeClient() {
    const store = storage.getStore();
    return store && store.tx ? store.tx : client;
  }

  async function execute(sql, args = []) {
    const result = await activeClient().execute({ sql, args });
    return normalizeResult(result);
  }

  return {
    prepare(sql) {
      return {
        async get(...args) {
          const result = await execute(sql, args);
          return result.rows[0];
        },
        async all(...args) {
          const result = await execute(sql, args);
          return result.rows;
        },
        async run(...args) {
          return execute(sql, args);
        }
      };
    },

    async exec(sql) {
      const statement = sql.trim().replace(/;$/, "");
      const normalized = statement.toUpperCase();

      if (normalized.startsWith("BEGIN")) {
        const store = storage.getStore();
        if (store && store.tx) throw new Error("A database transaction is already active.");
        const tx = await client.transaction("write");
        storage.enterWith({ tx });
        return;
      }

      if (normalized === "COMMIT") {
        const store = storage.getStore();
        if (!store || !store.tx) return;
        await store.tx.commit();
        store.tx.close();
        store.tx = null;
        return;
      }

      if (normalized === "ROLLBACK") {
        const store = storage.getStore();
        if (!store || !store.tx) return;
        await store.tx.rollback();
        store.tx.close();
        store.tx = null;
        return;
      }

      if (statement.includes(";")) {
        await activeClient().executeMultiple(sql);
        return;
      }

      await execute(statement);
    },

    async transaction(callback) {
      const tx = await client.transaction("write");
      return storage.run({ tx }, async () => {
        try {
          const result = await callback();
          await tx.commit();
          return result;
        } catch (error) {
          await tx.rollback();
          throw error;
        } finally {
          tx.close();
        }
      });
    },

    async close() {
      client.close();
    }
  };
}

function normalizeResult(result) {
  return {
    ...result,
    rows: result.rows || [],
    changes: Number(result.rowsAffected || 0),
    lastInsertRowid: result.lastInsertRowid
  };
}

module.exports = { createDatabase };
