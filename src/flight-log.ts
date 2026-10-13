import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DispatchKind } from "./core.ts";

export type DispatchState = "landed" | "grounded";

/** One Dispatch as `fly log` reports it. */
export interface DispatchRecord {
  id: string;
  kind: DispatchKind;
  /** The agent the Session ran in (e.g. `claude-code`), when there is a Session. */
  host: string | null;
  sessionId: string | null;
  /** The host's stable reference to the source Reply, for a Reply Dispatch. */
  replyRef: string | null;
  /** The root of the git repo the Dispatch was sent from, or the working directory outside a repo. */
  projectPath: string;
  gitRemote: string | null;
  sessionTitle: string | null;
  /** The document's name in the Hangar. */
  name: string;
  /** ISO 8601. */
  writtenAt: string;
  /** ISO 8601. */
  sentAt: string;
  state: DispatchState;
  /** Where the PDF is kept locally, for a Grounded Dispatch. */
  pdfPath: string | null;
}

export interface LogFilter {
  /** Only this project's Dispatches. */
  projectPath?: string;
  /** Only this Session's Dispatches. */
  sessionId?: string;
}

// How long a writer waits for another `fly` process to release the database before failing.
const BUSY_TIMEOUT_MS = 10_000;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    host TEXT NOT NULL,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    PRIMARY KEY (host, session_id)
  );
  CREATE TABLE IF NOT EXISTS dispatches (
    seq INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    host TEXT,
    session_id TEXT,
    reply_ref TEXT,
    session_title TEXT,
    project_path TEXT NOT NULL,
    git_remote TEXT,
    name TEXT NOT NULL,
    written_at TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    state TEXT NOT NULL,
    pdf_path TEXT
  );
  CREATE INDEX IF NOT EXISTS dispatches_by_project ON dispatches (project_path);
  CREATE INDEX IF NOT EXISTS dispatches_by_session ON dispatches (session_id);
`;

/**
 * The record of every Dispatch, in one SQLite database for the whole user account (ADR 0003).
 * Concurrent `fly` processes rely on SQLite's own locking.
 */
export class FlightLog {
  private constructor(private readonly db: Database) {}

  static open(dataDir: string): FlightLog {
    mkdirSync(dataDir, { recursive: true });
    const db = new Database(join(dataDir, "flight-log.sqlite"), { create: true, strict: true });
    // The default rollback journal, not WAL: switching a new database to WAL can fail with
    // SQLITE_BUSY while another process opens it, without waiting on the busy timeout.
    db.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    db.transaction(() => db.run(SCHEMA)).immediate();
    return new FlightLog(db);
  }

  close(): void {
    this.db.close();
  }

  /**
   * Records a Dispatch. For a Dispatch from a Session, `sessionTitle` is also fixed as the
   * Session's title unless an earlier Dispatch already fixed one.
   */
  record(dispatch: DispatchRecord): void {
    this.db
      .transaction(() => {
        if (dispatch.host !== null && dispatch.sessionId !== null && dispatch.sessionTitle !== null) {
          this.db
            .query("INSERT OR IGNORE INTO sessions (host, session_id, title) VALUES (?, ?, ?)")
            .run(dispatch.host, dispatch.sessionId, dispatch.sessionTitle);
        }
        this.db
          .query(
            `INSERT INTO dispatches
              (id, kind, host, session_id, reply_ref, session_title, project_path, git_remote, name,
               written_at, sent_at, state, pdf_path)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            dispatch.id,
            dispatch.kind,
            dispatch.host,
            dispatch.sessionId,
            dispatch.replyRef,
            dispatch.sessionTitle,
            dispatch.projectPath,
            dispatch.gitRemote,
            dispatch.name,
            dispatch.writtenAt,
            dispatch.sentAt,
            dispatch.state,
            dispatch.pdfPath,
          );
      })
      .immediate();
  }

  /** Dispatches matching every field of `filter`, oldest first. */
  dispatches(filter: LogFilter): DispatchRecord[] {
    const where: string[] = [];
    const params: string[] = [];
    if (filter.projectPath !== undefined) {
      where.push("project_path = ?");
      params.push(filter.projectPath);
    }
    if (filter.sessionId !== undefined) {
      where.push("session_id = ?");
      params.push(filter.sessionId);
    }
    return this.db
      .query<DispatchRecord, string[]>(
        `SELECT id, kind, host, session_id AS sessionId, reply_ref AS replyRef,
                project_path AS projectPath, git_remote AS gitRemote, session_title AS sessionTitle,
                name, written_at AS writtenAt, sent_at AS sentAt, state, pdf_path AS pdfPath
         FROM dispatches
         ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY sent_at, seq`,
      )
      .all(...params);
  }
}
