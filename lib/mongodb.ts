// lib/mongodb.ts
import { MongoClient, Db } from "mongodb";
declare global {
  // Prevent multiple instances across hot reloads
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _mongoClient: MongoClient | undefined;
  var _lastStatsLog: number | undefined;
  var __mongoCleanupHandlersRegistered: boolean | undefined;
}

let uri: string | undefined;

function getMongoUri(): string {
  if (!uri) {
    uri = process.env.MONGODB_URI as string;
    if (!uri) {
      throw new Error("Please define the MONGODB_URI environment variable");
    }
  }
  return uri;
}

function createClient(): MongoClient {
  // Configure connection pool to limit concurrent connections
  // Default maxPoolSize is 10, you can reduce if needed via env var
  const maxPoolSize = process.env.MONGODB_MAX_POOL_SIZE
    ? parseInt(process.env.MONGODB_MAX_POOL_SIZE, 10)
    : 10;

  return new MongoClient(getMongoUri(), {
    maxPoolSize,
    // Keep connections alive to avoid reconnection overhead
    minPoolSize: 1,
  });
}

// Log connection pool statistics in dev mode
function logConnectionStats(client: MongoClient): void {
  if (process.env.NODE_ENV !== "development") return;

  try {
    const topology = (client as any).topology;
    if (!topology) return;

    const servers = topology.s?.servers || new Map();
    let totalConnections = 0;
    let totalAvailable = 0;
    let totalInUse = 0;
    let totalPending = 0;

    servers.forEach((server: any) => {
      const pool = server.s?.pool;
      if (pool) {
        const size = pool.totalConnectionCount || 0;
        const available = pool.availableConnectionCount || 0;
        const inUse = pool.inUseConnections || 0;
        const pending = pool.waitingCount || 0;

        totalConnections += size;
        totalAvailable += available;
        totalInUse += inUse;
        totalPending += pending;
      }
    });

    console.info("📊 MongoDB Connection Pool Stats:", {
      totalConnections,
      available: totalAvailable,
      inUse: totalInUse,
      pending: totalPending,
      servers: servers.size,
    });
  } catch {
    // Silently fail if stats aren't available
  }
}

function getClientPromise(): Promise<MongoClient> {
  // Reuse client in both dev and prod - MongoDB clients are designed to be long-lived
  // and handle connection pooling internally
  if (!global._mongoClientPromise) {
    global._mongoClient = createClient();
    global._mongoClientPromise = global._mongoClient
      .connect()
      .then((client) => {
        // Log stats after connection in dev mode
        if (process.env.NODE_ENV === "development") {
          console.info("✅ MongoDB client connected");
          // Log stats after a short delay to allow pool to initialize
          setTimeout(() => logConnectionStats(client), 1000);
        }
        return client;
      })
      .catch((error) => {
        console.error("❌ MongoDB client connection error:", error);
        // Reset the promise on error so we can retry
        global._mongoClientPromise = undefined;
        global._mongoClient = undefined;
        throw error;
      });
  }
  return global._mongoClientPromise;
}

// Cleanup function for graceful shutdown
export async function closeMongoClient(): Promise<void> {
  if (global._mongoClient) {
    await global._mongoClient.close();
    global._mongoClient = undefined;
    global._mongoClientPromise = undefined;
  }
}

// ✅ Register cleanup handlers only once
if (
  typeof process !== "undefined" &&
  !global.__mongoCleanupHandlersRegistered
) {
  global.__mongoCleanupHandlersRegistered = true;

  const cleanup = async () => {
    try {
      await closeMongoClient();
    } catch {
      // keep silent: shutdown paths shouldn't crash
    }
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Optionnel: tu peux le garder, mais c'est souvent la source du warning
  process.on("beforeExit", cleanup);
}
export async function getMongoClient(): Promise<MongoClient> {
  const client = await getClientPromise();
  // Log connection stats in dev mode (throttled to avoid spam)
  if (process.env.NODE_ENV === "development") {
    const now = Date.now();
    if (!global._lastStatsLog || now - global._lastStatsLog > 5000) {
      global._lastStatsLog = now;
      logConnectionStats(client);
    }
  }

  return client;
}

export async function getDb(dbName: string): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}
