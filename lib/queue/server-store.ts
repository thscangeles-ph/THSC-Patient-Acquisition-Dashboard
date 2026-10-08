import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { QueueState } from "./types";

type Stored = { state: QueueState | null; version: number };
type Backend = { name: "redis" | "file"; load(): Promise<Stored>; save(state: QueueState, expectedVersion: number): Promise<boolean> };

const STATE_KEY = "thsc:queue:state";
const VERSION_KEY = "thsc:queue:version";
// Compare-and-set so two staff screens acting at the same moment never overwrite each other.
const CAS_SCRIPT = `local v = tonumber(redis.call('GET', KEYS[2]) or '0')
if v ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], v + 1)
return 1`;

function redisBackend(url: string, token: string): Backend {
  const command = async (args: (string | number)[]) => {
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args), cache: "no-store" });
    const body = (await response.json()) as { result?: unknown; error?: string };
    if (!response.ok || body.error) throw new Error(`Redis error: ${body.error ?? response.status}`);
    return body.result;
  };
  return {
    name: "redis",
    async load() {
      const [state, version] = ((await command(["MGET", STATE_KEY, VERSION_KEY])) as (string | null)[]) ?? [];
      return { state: state ? (JSON.parse(state) as QueueState) : null, version: Number(version ?? 0) };
    },
    async save(state, expectedVersion) {
      return Number(await command(["EVAL", CAS_SCRIPT, 2, STATE_KEY, VERSION_KEY, expectedVersion, JSON.stringify(state)])) === 1;
    },
  };
}

function fileBackend(file: string): Backend {
  let lock: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<Stored> => {
    try {
      return JSON.parse(await readFile(file, "utf8")) as Stored;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: null, version: 0 };
      throw error;
    }
  };
  return {
    name: "file",
    load: read,
    save(state, expectedVersion) {
      const task = lock.then(async () => {
        const current = await read();
        if (current.version !== expectedVersion) return false;
        await mkdir(path.dirname(file), { recursive: true });
        const temp = `${file}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify({ state, version: expectedVersion + 1 }));
        await rename(temp, file);
        return true;
      });
      lock = task.catch(() => undefined);
      return task;
    },
  };
}

let cached: Backend | null | undefined;

/** Shared mode is on when Upstash/Vercel KV credentials are present, or QUEUE_STORE=file on a self-hosted server. */
export function getBackend(): Backend | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) cached = redisBackend(url, token);
  else if (process.env.QUEUE_STORE === "file") cached = fileBackend(process.env.QUEUE_DATA_FILE ? path.resolve(/*turbopackIgnore: true*/ process.env.QUEUE_DATA_FILE) : path.join(process.cwd(), ".queue-data", "queue.json"));
  else cached = null;
  return cached;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

export function staffPinConfigured() {
  return Boolean(process.env.QUEUE_STAFF_PIN);
}

export function isStaff(request: Request) {
  const pin = process.env.QUEUE_STAFF_PIN;
  const given = request.headers.get("x-queue-pin");
  return Boolean(pin && given && timingSafeEqual(digest(pin), digest(given)));
}
