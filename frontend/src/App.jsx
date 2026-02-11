import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function apiRequest(path, { method = "GET", token, body, isForm } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

export default function App() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [datasets, setDatasets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const selectedDataset = useMemo(
    () => datasets.find((item) => item.id === selectedId),
    [datasets, selectedId]
  );

  useEffect(() => {
    if (!token) return;
    loadDatasets();
  }, [token]);

  async function loadDatasets() {
    try {
      const data = await apiRequest("/datasets", { token });
      setDatasets(data);
      if (data.length && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function handleAuth(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      if (mode === "register") {
        await apiRequest("/auth/register", {
          method: "POST",
          body: { email, password }
        });
      }

      const body = new URLSearchParams();
      body.append("username", email);
      body.append("password", password);

      const loginResp = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });

      if (!loginResp.ok) {
        const text = await loginResp.text();
        throw new Error(text || "Login failed");
      }

      const tokenData = await loginResp.json();
      localStorage.setItem("token", tokenData.access_token);
      setToken(tokenData.access_token);
      setStatus("Authenticated.");
      setEmail("");
      setPassword("");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setToken("");
    setDatasets([]);
    setSelectedId("");
    setReport(null);
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiRequest("/datasets/upload?process=true", {
        method: "POST",
        token,
        body: formData,
        isForm: true
      });
      setFile(null);
      await loadDatasets();
      setStatus("Upload complete.");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function fetchReport(datasetId) {
    if (!datasetId) return;
    setBusy(true);
    setStatus("");
    try {
      const data = await apiRequest(`/datasets/${datasetId}/report`, { token });
      setReport(data);
    } catch (err) {
      setReport(null);
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function enqueueProcessing(datasetId) {
    setBusy(true);
    setStatus("");
    try {
      await apiRequest(`/datasets/${datasetId}/process-async`, {
        method: "POST",
        token
      });
      await loadDatasets();
      setStatus("Queued for async processing.");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runExplain(datasetId) {
    setBusy(true);
    setStatus("");
    try {
      const data = await apiRequest(`/datasets/${datasetId}/explain`, {
        method: "POST",
        token
      });
      setReport(data);
      setStatus("Generated LLM summary and cleaning plan.");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen text-slate-100">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">AI Data Quality Engineer</p>
          <h1 className="mt-3 text-4xl font-semibold">Production-grade data quality intelligence</h1>
          <p className="mt-3 max-w-xl text-slate-300">
            Profile datasets, surface issues, and generate safe cleaning plans with Gemini-powered reasoning.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-xs uppercase tracking-widest text-emerald-200">
          {token ? "Connected" : "Offline"}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 pb-16 lg:grid-cols-[0.9fr,1.1fr]">
        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Authentication</h2>
              {token && (
                <button
                  className="rounded-full border border-slate-700 px-4 py-1 text-xs uppercase tracking-widest"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              )}
            </div>
            {!token && (
              <form onSubmit={handleAuth} className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`rounded-full px-4 py-1 text-xs uppercase tracking-widest ${
                      mode === "login" ? "bg-emerald-400/20 text-emerald-200" : "border border-slate-700"
                    }`}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className={`rounded-full px-4 py-1 text-xs uppercase tracking-widest ${
                      mode === "register" ? "bg-emerald-400/20 text-emerald-200" : "border border-slate-700"
                    }`}
                  >
                    Register
                  </button>
                </div>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm"
                  placeholder="Email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm"
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-2xl bg-emerald-400/20 py-2 text-xs uppercase tracking-widest text-emerald-200"
                >
                  {mode === "login" ? "Sign in" : "Create account"}
                </button>
              </form>
            )}
            {token && (
              <p className="mt-4 text-sm text-emerald-200">Authenticated. Ready to upload datasets.</p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold">Upload Dataset</h2>
            <p className="mt-2 text-sm text-slate-400">CSV only. Sync validation runs immediately.</p>
            <form onSubmit={handleUpload} className="mt-4 space-y-3">
              <input
                type="file"
                accept=".csv"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="w-full rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 px-4 py-3 text-sm"
              />
              <button
                type="submit"
                disabled={!token || busy || !file}
                className="w-full rounded-2xl bg-emerald-400/20 py-2 text-xs uppercase tracking-widest text-emerald-200"
              >
                Upload + Validate
              </button>
            </form>
          </div>

          {status && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
              {status}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Datasets</h2>
              <button
                className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-widest"
                onClick={loadDatasets}
                disabled={!token || busy}
              >
                Refresh
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {datasets.length === 0 && (
                <p className="text-sm text-slate-400">No datasets yet. Upload one to begin.</p>
              )}
              {datasets.map((dataset) => (
                <button
                  key={dataset.id}
                  onClick={() => {
                    setSelectedId(dataset.id);
                    fetchReport(dataset.id);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm ${
                    selectedId === dataset.id
                      ? "border-emerald-400/50 bg-emerald-400/10"
                      : "border-slate-800 bg-slate-950/40"
                  }`}
                >
                  <span>{dataset.filename}</span>
                  <span className="text-xs uppercase tracking-widest text-slate-400">{dataset.status}</span>
                </button>
              ))}
            </div>
            {selectedDataset && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-widest"
                  onClick={() => enqueueProcessing(selectedDataset.id)}
                  disabled={busy}
                >
                  Run Async
                </button>
                <button
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-widest"
                  onClick={() => fetchReport(selectedDataset.id)}
                  disabled={busy}
                >
                  Refresh Report
                </button>
                <button
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-widest"
                  onClick={() => runExplain(selectedDataset.id)}
                  disabled={busy}
                >
                  Generate LLM Summary
                </button>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold">Latest Report</h2>
            {!report && <p className="mt-3 text-sm text-slate-400">Select a dataset to view its report.</p>}
            {report && (
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Quality Score</span>
                  <span className="text-2xl font-semibold text-emerald-200">{report.quality_score}</span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-400">Issues</p>
                  <ul className="mt-2 space-y-2">
                    {report.issues_json.map((issue, index) => (
                      <li key={index} className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
                        <p className="font-medium text-slate-200">{issue.type}</p>
                        <p className="text-xs text-slate-400">{issue.message}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                {report.llm_summary && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-400">LLM Summary</p>
                    <p className="mt-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-slate-200">
                      {report.llm_summary}
                    </p>
                  </div>
                )}
                {report.cleaning_plan_json && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-400">Cleaning Plan</p>
                    <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-200">
                      {JSON.stringify(report.cleaning_plan_json, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
