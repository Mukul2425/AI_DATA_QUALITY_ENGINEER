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

  if (response.status === 204) return null;
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

  const stats = useMemo(() => {
    const total = datasets.length;
    const processing = datasets.filter((item) => item.status === "processing").length;
    const failed = datasets.filter((item) => item.status === "failed").length;
    const latestScore = report?.quality_score ?? "--";
    return { total, processing, failed, latestScore };
  }, [datasets, report]);

  useEffect(() => {
    if (!token) return;
    loadDatasets();
  }, [token]);

  async function loadDatasets() {
    try {
      const data = await apiRequest("/datasets/", { token });
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
      setStatus("Generated summary + cleaning plan.");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runCleaning(datasetId) {
    setBusy(true);
    setStatus("");
    try {
      await apiRequest(`/datasets/${datasetId}/clean`, {
        method: "POST",
        token
      });
      await fetchReport(datasetId);
      setStatus("Cleaning completed.");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadCleaned(datasetId) {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(`${API_URL}/datasets/${datasetId}/cleaned-file`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No cleaned file available");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cleaned-${datasetId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setStatus("Downloaded cleaned file.");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-grid text-slate-100">
      <header className="mx-auto max-w-6xl px-6 pt-12">
        <div className="relative overflow-hidden rounded-[36px] border border-slate-800 bg-slate-900/60 p-10">
          <div className="absolute -top-12 right-6 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">AI Data Quality Engineer</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-5xl">
            GenAI data quality control room
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-300">
            Profile datasets, surface anomalies, and execute safe cleaning workflows backed by Gemini reasoning.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-emerald-200">
              {token ? "Connected" : "Offline"}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-950/40 px-4 py-2 text-slate-300">
              API: {API_URL}
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400">Datasets</p>
          <p className="mt-3 text-3xl font-semibold text-emerald-200">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400">Processing</p>
          <p className="mt-3 text-3xl font-semibold text-amber-200">{stats.processing}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400">Failed</p>
          <p className="mt-3 text-3xl font-semibold text-rose-200">{stats.failed}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400">Latest Score</p>
          <p className="mt-3 text-3xl font-semibold text-blue-200">{stats.latestScore}</p>
        </div>
      </section>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 pb-16 lg:grid-cols-[1.1fr,1.3fr]">
        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Access</h2>
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
            <h2 className="text-lg font-semibold">Ingest</h2>
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

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold">Pipeline</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-300">
              <li>1. Upload dataset</li>
              <li>2. Run validation and profiling</li>
              <li>3. Generate LLM explanation + plan</li>
              <li>4. Execute cleaning</li>
              <li>5. Download cleaned CSV</li>
            </ol>
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
                <button
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-widest"
                  onClick={() => runCleaning(selectedDataset.id)}
                  disabled={busy}
                >
                  Run Cleaning
                </button>
                <button
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-widest"
                  onClick={() => downloadCleaned(selectedDataset.id)}
                  disabled={busy}
                >
                  Download Cleaned
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
