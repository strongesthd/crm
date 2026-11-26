const session = require('express-session');

class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.getStatement = db.prepare(
      'SELECT sess FROM sessions WHERE sid = ? AND expires > ?',
    );
    this.setStatement = db.prepare(
      `INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`,
    );
    this.destroyStatement = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStatement = db.prepare(
      'UPDATE sessions SET expires = ? WHERE sid = ?',
    );
    this.cleanupStatement = db.prepare(
      'DELETE FROM sessions WHERE expires <= ?',
    );
    this.lastCleanupAt = 0;
  }

  get(sessionId, callback) {
    try {
      const row = this.getStatement.get(sessionId, Date.now());

      callback(null, row ? JSON.parse(row.sess) : null);
    } catch (error) {
      callback(error);
    }
  }

  set(sessionId, sessionData, callback = () => {}) {
    try {
      const expiresAt = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + 24 * 60 * 60 * 1000;

      this.setStatement.run(sessionId, JSON.stringify(sessionData), expiresAt);
      this.cleanupExpiredSessions();
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sessionId, callback = () => {}) {
    try {
      this.destroyStatement.run(sessionId);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sessionId, sessionData, callback = () => {}) {
    try {
      const expiresAt = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + 24 * 60 * 60 * 1000;

      this.touchStatement.run(expiresAt, sessionId);
      this.cleanupExpiredSessions();
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  cleanupExpiredSessions() {
    const now = Date.now();

    if (now - this.lastCleanupAt < 60_000) {
      return;
    }

    this.cleanupStatement.run(now);
    this.lastCleanupAt = now;
  }
}

module.exports = SQLiteSessionStore;
