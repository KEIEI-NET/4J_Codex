import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";

type SymbolSummary = {
  id: string;
  name: string;
};

type GraphNode = {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
};

type GraphEdge = {
  from: string;
  to: string;
  type: string;
  properties: Record<string, unknown>;
};

type GraphMeta = {
  source: string;
  reason?: string;
};

type GraphResponse = {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta?: GraphMeta;
};

export default function App() {
  const [query, setQuery] = useState("app");
  const [results, setResults] = useState<SymbolSummary[]>([]);
  const [searchMeta, setSearchMeta] = useState<GraphMeta | null>(null);
  const [selectedId, setSelectedId] = useState<string>("sym:App#main");
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [graphStatus, setGraphStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    if (!cyRef.current) {
      cyRef.current = cytoscape({
        container: containerRef.current,
        style: [
          {
            selector: "node",
            style: {
              label: "data(label)",
              "text-valign": "center",
              "text-halign": "center",
              "background-color": "#4285f4",
              color: "#fff",
              "font-size": 12,
              width: "mapData(weight, 0, 10, 40, 80)",
              height: "mapData(weight, 0, 10, 40, 80)"
            }
          },
          {
            selector: "edge",
            style: {
              width: 2,
              "line-color": "#9aa0a6",
              "target-arrow-color": "#9aa0a6",
              "target-arrow-shape": "triangle",
              label: "data(label)",
              "curve-style": "bezier",
              "font-size": 10,
              color: "#5f6368"
            }
          }
        ]
      });
    }
  }, []);

  useEffect(() => {
    if (!graph || !cyRef.current) {
      return;
    }

    const elements = buildElements(graph);
    cyRef.current.json({ elements });
    cyRef.current.layout({ name: "cose", animate: false }).run();
  }, [graph]);

  useEffect(() => {
    handleSearch(query);
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadGraph(selectedId);
    }
  }, [selectedId]);

  async function handleSearch(keyword: string) {
    if (!keyword) {
      setResults([]);
      return;
    }
    setStatus("loading");
    try {
      const response = await fetch(`/api/symbol?q=${encodeURIComponent(keyword)}&limit=10`);
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const json = await response.json();
      setResults(json.symbols ?? []);
      setSearchMeta(json.meta ?? null);
      setStatus("ready");
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  }

  async function loadGraph(id: string) {
    setGraphStatus("loading");
    try {
      const response = await fetch(`/api/graph/symbol/${encodeURIComponent(id)}?depth=2`);
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const json = (await response.json()) as GraphResponse;
      setGraph(json);
      setGraphStatus("ready");
    } catch (error) {
      console.error(error);
      setGraphStatus("error");
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleSearch(query);
  }

  const selected = useMemo(() => results.find((item) => item.id === selectedId), [results, selectedId]);

  const sourceBadge = (meta?: GraphMeta | null) => {
    if (!meta) {
      return null;
    }
    const color = meta.source === "neo4j" || meta.source === "opensearch" ? "#34a853" : "#fbbc05";
    return (
      <span style={{ marginLeft: 8, fontSize: 12, color }}>
        ({meta.source}
        {meta.reason ? `: ${meta.reason}` : ""})
      </span>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", height: "100vh", fontFamily: "system-ui" }}>
      <aside style={{ borderRight: "1px solid #dadce0", padding: "16px", overflowY: "auto" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Codex Explorer</h1>
        <p style={{ color: "#5f6368" }}>Symbol を検索してグラフを可視化します。</p>

        <form onSubmit={onSubmit} style={{ marginTop: 24 }}>
          <label htmlFor="query" style={{ display: "block", marginBottom: 4 }}>
            キーワード
          </label>
          <input
            id="query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #dadce0" }}
            placeholder="sym:App#main"
          />
          <button type="submit" style={{ marginTop: 8, width: "100%", padding: 8 }}>
            検索
          </button>
        </form>

        <section style={{ marginTop: 24 }}>
          <header style={{ fontWeight: 600, marginBottom: 8 }}>
            検索結果
            {sourceBadge(searchMeta)}
          </header>
          {status === "loading" && <p>検索中…</p>}
          {status === "error" && <p style={{ color: "red" }}>検索に失敗しました。</p>}
          {status === "ready" && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {results.map((item) => (
                <li key={item.id} style={{ marginBottom: 6 }}>
                  <button
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: 8,
                      borderRadius: 6,
                      border: item.id === selectedId ? "2px solid #1a73e8" : "1px solid #dadce0",
                      background: item.id === selectedId ? "#e8f0fe" : "#fff",
                      cursor: "pointer"
                    }}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <small style={{ color: "#5f6368" }}>{item.id}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
      <main style={{ padding: "16px", display: "flex", flexDirection: "column" }}>
        <header style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 18 }}>
            Symbol グラフ
            {sourceBadge(graph?.meta ?? null)}
          </h2>
          {selected && <p style={{ color: "#5f6368" }}>{selected.name}</p>}
        </header>
        <div
          ref={containerRef}
          style={{ flex: 1, border: "1px solid #dadce0", borderRadius: 8, minHeight: 0 }}
        />
        <footer style={{ marginTop: 12, color: "#5f6368" }}>
          {graphStatus === "loading" && <span>グラフ読み込み中…</span>}
          {graphStatus === "error" && <span style={{ color: "red" }}>グラフ取得に失敗しました。</span>}
          {graphStatus === "ready" && graph && (
            <span>
              ノード {graph.nodes.length} 件 / リレーション {graph.edges.length} 件
            </span>
          )}
        </footer>
      </main>
    </div>
  );
}

function buildElements(graph: GraphResponse) {
  const nodes = graph.nodes.map((node) => ({
    data: {
      id: node.id,
      label: String(node.properties.name ?? node.id),
      weight: Number(node.properties.weight ?? 1)
    }
  }));

  const edges = graph.edges.map((edge) => ({
    data: {
      id: `${edge.from}|${edge.type}|${edge.to}`,
      source: edge.from,
      target: edge.to,
      label: edge.type
    }
  }));

  return { nodes, edges };
}
