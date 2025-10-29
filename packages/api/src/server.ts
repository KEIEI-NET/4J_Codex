import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import neo4j, { type Driver } from "neo4j-driver";
import { Client as OpenSearchClient } from "@opensearch-project/opensearch";

const PORT = Number(process.env.PORT ?? "4000");

type GraphEdge = {
  from: string;
  to: string;
  type: string;
  properties: Record<string, unknown>;
};

type GraphNode = {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
};

let neo4jDriver: Driver | null = null;
let openSearchClient: OpenSearchClient | null = null;

function initNeo4jDriver(): Driver | null {
  if (neo4jDriver) {
    return neo4jDriver;
  }
  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD;
  if (!uri || !user || !password) {
    return null;
  }
  neo4jDriver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  return neo4jDriver;
}

function initOpenSearchClient(): OpenSearchClient | null {
  if (openSearchClient) {
    return openSearchClient;
  }
  const endpoint = process.env.OPENSEARCH_ENDPOINT;
  if (!endpoint) {
    return null;
  }
  const username = process.env.OPENSEARCH_USERNAME;
  const password = process.env.OPENSEARCH_PASSWORD;
  openSearchClient = new OpenSearchClient({
    node: endpoint,
    auth: username && password ? { username, password } : undefined
  });
  return openSearchClient;
}

interface GraphQueryResult {
  node: GraphNode | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: { source: "neo4j" | "stub"; reason?: string };
}

interface SearchResult {
  items: Array<{ id: string; name: string }>;
  meta: { source: "opensearch" | "stub"; reason?: string };
}

interface RuleHit {
  id: string;
  ruleId: string;
  severity: string;
  symbolId?: string;
  message?: string;
}

async function querySymbolById(id: string, depth: number): Promise<GraphQueryResult> {
  const driver = initNeo4jDriver();
  if (!driver) {
    return stubGraph(id, "neo4j connection not configured");
  }

  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    const boundedDepth = Number.isFinite(depth) && depth >= 1 ? Math.floor(depth) : 1;
    const query = `
      MATCH (s:Entity {id: $id})
      OPTIONAL MATCH p=(s)-[rels*1..${boundedDepth}]-(t:Entity)
      WITH s, collect(distinct nodes(p)) AS nodeGroups, collect(distinct relationships(p)) AS relGroups
      RETURN s, nodeGroups, relGroups
    `;
    const result = await session.run(query, { id });
    if (result.records.length === 0) {
      return { node: null, nodes: [], edges: [], meta: { source: "neo4j" } };
    }

    const record = result.records[0];
    const sourceNode = record.get("s");
    const nodeGroups = record.get("nodeGroups") as neo4j.Node[][];
    const relGroups = record.get("relGroups") as neo4j.Relationship[][];

    const nodeSet = new Map<string, GraphNode>();
    const addNode = (node: neo4j.Node) => {
      const nodeId = node.properties.id as string;
      const entry: GraphNode = {
        id: nodeId ?? node.identity.toString(),
        labels: node.labels,
        properties: sanitizeProperties(node.properties)
      };
      nodeSet.set(entry.id, entry);
    };

    addNode(sourceNode);
    for (const group of nodeGroups ?? []) {
      for (const node of group ?? []) {
        addNode(node);
      }
    }

    const edges: GraphEdge[] = [];
    const relSet = new Set<string>();
    const addRel = (rel: neo4j.Relationship) => {
      const key = `${rel.startNode.toString()}|${rel.endNode.toString()}|${rel.type}`;
      if (relSet.has(key)) {
        return;
      }
      relSet.add(key);
      edges.push({
        from: rel.startNodeElementId ?? rel.startNode.toString(),
        to: rel.endNodeElementId ?? rel.endNode.toString(),
        type: rel.type,
        properties: sanitizeProperties(rel.properties)
      });
    };
    for (const group of relGroups ?? []) {
      for (const rel of group ?? []) {
        addRel(rel);
      }
    }

    return {
      node: nodeSet.get(sourceNode.properties.id as string) ?? null,
      nodes: Array.from(nodeSet.values()),
      edges,
      meta: { source: "neo4j" }
    };
  } catch (error) {
    console.error("[api] neo4j query failed", error);
    return stubGraph(id, "neo4j query failed");
  } finally {
    await session.close();
  }
}

async function searchSymbols(query: string, limit: number): Promise<SearchResult> {
  const client = initOpenSearchClient();
  if (!client || !query) {
    return stubSearch(query, limit, client ? undefined : "opensearch connection not configured");
  }
  const index = process.env.OPENSEARCH_SYMBOL_INDEX ?? "codex-symbol";
  try {
    const response = await client.search({
      index,
      size: limit,
      body: {
        query: {
          multi_match: {
            query,
            fields: ["name^3", "id", "file"],
            fuzziness: "AUTO"
          }
        }
      }
    });

    const hits = (response.body as any)?.hits?.hits ?? [];
    return {
      items: hits.map((hit: any) => ({
        id: hit._source?.id ?? hit._id,
        name: hit._source?.name ?? hit._source?.id ?? "unknown"
      })),
      meta: { source: "opensearch" }
    };
  } catch (error) {
    console.error("[api] opensearch query failed", error);
    return stubSearch(query, limit, "opensearch query failed");
  }
}

function sanitizeProperties(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (neo4j.isInt(value)) {
      result[key] = (value as neo4j.Integer).toNumber();
    } else {
      result[key] = value;
    }
  }
  return result;
}

function stubGraph(id: string, reason?: string): GraphQueryResult {
  const node: GraphNode = {
    id,
    labels: ["Entity", "Symbol"],
    properties: { name: id.split("#").pop(), file: "src/example.ts" }
  };
  return { node, nodes: [node], edges: [], meta: { source: "stub", reason } };
}

function stubSearch(query: string, limit: number, reason?: string): SearchResult {
  if (!query) {
    return { items: [], meta: { source: "stub", reason } };
  }
  const items = [
    { id: "sym:App#main", name: "App.main" },
    { id: "sym:Service#do", name: "Service.do" }
  ].slice(0, limit);
  return { items, meta: { source: "stub", reason } };
}

async function searchRuleHits(symbolId?: string, limit?: number) {
  const client = initOpenSearchClient();
  if (!client) {
    return {
      items: stubRuleHits(symbolId, limit),
      meta: { source: "stub", reason: "opensearch connection not configured" }
    };
  }
  const index = process.env.OPENSEARCH_RULEHIT_INDEX ?? "codex-rulehit";
  const query: Record<string, unknown> = symbolId
    ? {
        bool: {
          must: [{ term: { symbolId } }]
        }
      }
    : { match_all: {} };
  try {
    const response = await client.search({
      index,
      size: limit ?? 20,
      body: { query }
    });
    const hits = (response.body as any)?.hits?.hits ?? [];
    return {
      items: hits.map((hit: any) => ({
        id: hit._id,
        ruleId: hit._source?.ruleId,
        severity: hit._source?.severity,
        symbolId: hit._source?.symbolId,
        message: hit._source?.message
      })),
      meta: { source: "opensearch" }
    };
  } catch (error) {
    console.error("[api] opensearch rulehits failed", error);
    return {
      items: stubRuleHits(symbolId, limit),
      meta: { source: "stub", reason: "opensearch rulehits query failed" }
    };
  }
}

function stubRuleHits(symbolId?: string, limit?: number): RuleHit[] {
  const hits: RuleHit[] = [
    {
      id: "rulehit-1",
      ruleId: "ALLOW_FILTERING",
      severity: "critical",
      symbolId: symbolId ?? "sym:App#main",
      message: "ALLOW FILTERING on events without partition predicates"
    }
  ];
  return hits.slice(0, limit ?? hits.length);
}

export async function createServer() {
  const fastify = Fastify({ logger: true });
  await fastify.register(fastifyCors, { origin: true });

  const sharedSecret = process.env.API_SHARED_SECRET;
  if (sharedSecret) {
    fastify.addHook("onRequest", async (request, reply) => {
      const routeUrl = request.routeOptions?.url;
      if (routeUrl === "/healthz") {
        return;
      }
      const authHeader = request.headers.authorization;
      const apiKeyHeader = request.headers["x-api-key"] as string | undefined;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
      if (token === sharedSecret || apiKeyHeader === sharedSecret) {
        return;
      }
      reply.code(401);
      return { error: "Unauthorized" };
    });
  }

  fastify.get("/healthz", async () => ({ status: "ok" }));
  fastify.get("/api/ping", async () => ({ message: "pong" }));

  fastify.get("/api/symbol", async (request) => {
    const { q, limit } = request.query as { q?: string; limit?: string };
    const search = await searchSymbols(q ?? "", Number(limit ?? "10"));
    return { symbols: search.items, meta: search.meta };
  });

  fastify.get("/api/symbol/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await querySymbolById(id, 1);
    if (!result.node && result.meta.source !== "stub") {
      reply.code(404);
      return { error: "Symbol not found" };
    }
    return { symbol: result.node, meta: result.meta };
  });

  fastify.get("/api/graph/symbol/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { depth } = request.query as { depth?: string };
    const parsedDepth = Number.parseInt(depth ?? "2", 10);
    const safeDepth = Number.isFinite(parsedDepth) ? Math.min(Math.max(parsedDepth, 1), 4) : 2;
    const result = await querySymbolById(id, safeDepth);
    if (!result.node && result.meta.source !== "stub") {
      reply.code(404);
      return { error: "Symbol not found" };
    }
    return {
      node: result.node,
      nodes: result.nodes,
      edges: result.edges,
      meta: result.meta
    };
  });

  fastify.get("/api/rulehits", async (request) => {
    const { symbolId, limit } = request.query as { symbolId?: string; limit?: string };
    const ruleHits = await searchRuleHits(symbolId, Number(limit ?? "20"));
    return { ruleHits: ruleHits.items, meta: ruleHits.meta };
  });

  return fastify;
}

async function start() {
  const server = await createServer();
  try {
    await server.listen(PORT, "0.0.0.0");
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  await neo4jDriver?.close();
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
