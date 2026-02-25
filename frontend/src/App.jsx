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

function formatDate(value) {
  if (!value) return "--";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function statusBadge(status) {
  const styles = {
    uploaded: "bg-slate-900/50 text-slate-200 border-slate-700",
    processing: "bg-amber-400/10 text-amber-200 border-amber-300/30",
    done: "bg-emerald-400/10 text-emerald-200 border-emerald-300/30",
    failed: "bg-rose-400/10 text-rose-200 border-rose-300/30"
  };
  return styles[status] || "bg-slate-900/50 text-slate-200 border-slate-700";
}

export default function App() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [datasets, setDatasets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState(null);
  const [compareId, setCompareId] = useState("");
  const [compareReport, setCompareReport] = useState(null);
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [cleaningJob, setCleaningJob] = useState(null);
  const [me, setMe] = useState(null);
  const [profileForm, setProfileForm] = useState({ full_name: "", organization: "" });
  const [status, setStatus] = useState("");
  const [file, setFile] = useState(null);
  const [uploadAsync, setUploadAsync] = useState(false);
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

  const issueCounts = useMemo(() => {
    const issues = report?.issues_json || [];
    const counts = {};
    issues.forEach((issue) => {
      const key = issue.type || "issue";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [report]);

  const topNulls = useMemo(() => {
    const nullPct = report?.profile_json?.null_pct || {};
    return Object.entries(nullPct)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [report]);

  const columnCards = useMemo(() => {
    const dtypes = report?.profile_json?.dtypes || {};
    const nullPct = report?.profile_json?.null_pct || {};
    return Object.keys(dtypes)
      .map((col) => ({
        col,
        dtype: dtypes[col],
        nulls: Math.round((nullPct[col] || 0) * 100)
      }))
      .sort((a, b) => b.nulls - a.nulls)
      .slice(0, 8);
  }, [report]);

  const planSteps = useMemo(() => {
    const plan = report?.cleaning_plan_json;
    if (!plan) return [];
    if (Array.isArray(plan.steps)) return plan.steps;
    return [];
  }, [report]);

  const scoreDelta = useMemo(() => {
    if (history.length < 2) return null;
    return history[history.length - 1].quality_score - history[history.length - 2].quality_score;
  }, [history]);

  const issueDelta = useMemo(() => {
    if (history.length < 2) return null;
    return history[history.length - 1].issues_count - history[history.length - 2].issues_count;
  }, [history]);

  useEffect(() => {
    if (!token) return;
    loadDatasets();
    loadMe();
  }, [token]);

  useEffect(() => {
    if (!token || !selectedId) return;
    fetchReport(selectedId);
    fetchCleaningJob(selectedId);
    fetchPreview(selectedId);
    fetchHistory(selectedId);
  }, [token, selectedId]);

  useEffect(() => {
    if (!datasets.length) {
      setCompareId("");
      return;
    }
    if (!compareId || compareId === selectedId) {
      const candidate = datasets.find((item) => item.id !== selectedId);
      setCompareId(candidate?.id || "");
    }
  }, [datasets, selectedId, compareId]);

  useEffect(() => {
    if (!token || !compareId) {
      setCompareReport(null);
      return;
    }
    fetchCompareReport(compareId);
  }, [token, compareId]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      loadDatasets();
      if (selectedId) {
        fetchReport(selectedId);
        fetchCleaningJob(selectedId);
        fetchHistory(selectedId);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [token, selectedId]);

  async function loadDatasets() {
    try {
      const data = await apiRequest("/datasets/", { token });
      setDatasets(data);
      if (data.length && !selectedId) {
        setSelectedId(data[0].id);
      }
      if (selectedId && !data.find((item) => item.id === selectedId)) {
        setSelectedId(data[0]?.id || "");
      }
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function loadMe() {
    try {
      const data = await apiRequest("/users/me", { token });
      setMe(data);
      setProfileForm({
        full_name: data.full_name || "",
        organization: data.organization || ""
      });
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
    setPreview(null);
    setHistory([]);
    setMe(null);
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const data = await apiRequest("/users/me", {
        method: "PUT",
        token,
        body: profileForm
      });
      setMe(data);
      setStatus("Profile updated.");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const query = `/datasets/upload?process=true&async_process=${uploadAsync ? "true" : "false"}`;
      await apiRequest(query, {
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
    try {
      const data = await apiRequest(`/datasets/${datasetId}/report`, { token });
      setReport(data);
    } catch {
      setReport(null);
    }
  }

  async function fetchCompareReport(datasetId) {
    if (!datasetId) return;
    try {
      const data = await apiRequest(`/datasets/${datasetId}/report`, { token });
      setCompareReport(data);
    } catch {
      setCompareReport(null);
    }
  }

  async function fetchPreview(datasetId) {
    if (!datasetId) return;
    try {
      const data = await apiRequest(`/datasets/${datasetId}/preview?limit=6`, { token });
      setPreview(data);
    } catch {
      setPreview(null);
    }
  }

  async function fetchHistory(datasetId) {
    if (!datasetId) return;
    try {
      const data = await apiRequest(`/datasets/${datasetId}/history?limit=8`, { token });
      setHistory(data);
    } catch {
      setHistory([]);
    }
  }

  async function fetchCleaningJob(datasetId) {
    if (!datasetId) return;
    try {
      const data = await apiRequest(`/datasets/${datasetId}/cleaning-latest`, { token });
      setCleaningJob(data);
    } catch {
      setCleaningJob(null);
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
      await apiRequest(`/datasets/${datasetId}/clean-async`, {
        method: "POST",
        token
      });
      await fetchCleaningJob(datasetId);
      setStatus("Cleaning queued.");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadBlob(path, filename) {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Download failed");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async function downloadCleaned(datasetId) {
    setBusy(true);
    setStatus("");
    try {
      await downloadBlob(`/datasets/${datasetId}/cleaned-file`, `cleaned-${datasetId}.csv`);
      setStatus("Downloaded cleaned file.");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadReport(datasetId, format) {
    setBusy(true);
    setStatus("");
    try {
      await downloadBlob(`/datasets/${datasetId}/report.${format}`, `report-${datasetId}.${format}`);
      setStatus(`Downloaded report (${format}).`);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  function renderNullChart() {
    if (!topNulls.length) {
      return <p className="text-sm text-slate-400">No profiling data available yet.</p>;
    }

    return (
      <div className="space-y-3">
        {topNulls.map(([col, value]) => {
          const pct = Math.round(value * 100);
          return (
            <div key={col} className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>{col}</span>
                <span>{pct}% nulls</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800">
                <div
                  className="h-2 rounded-full bg-emerald-400/70"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderTrendBars(items, key, maxValue = 100) {
    if (!items.length) {
      return <p className="text-sm text-slate-400">No trend data yet.</p>;
    }
    const normalizedMax = Math.max(maxValue, ...items.map((item) => item[key]));
    return (
      <div className="flex items-end gap-2">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col items-center gap-1">
            <div className="h-24 w-3 rounded-full bg-slate-800">
              <div
                className="w-3 rounded-full bg-emerald-400/70"
                style={{ height: `${Math.max(10, (item[key] / normalizedMax) * 96)}px` }}
              />
            </div>
            <span className="text-[10px] text-slate-400">{item[key]}</span>
          </div>
        ))}
      </div>
    );
  }

  const qualityScore = report?.quality_score ?? null;
  const scoreTone = qualityScore === null
    ? "text-slate-400"
    : qualityScore >= 85
      ? "text-emerald-200"
      : qualityScore >= 70
        ? "text-amber-200"
        : "text-rose-200";

  return (
    <div className="min-h-screen bg-grid text-slate-100">
      <header className="mx-auto max-w-7xl px-6 pt-10">
        <div className="relative overflow-hidden rounded-[36px] border border-slate-800 bg-slate-900/60 p-10">
          <div className="absolute -top-10 right-0 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl animate-float" />
          <div className="absolute -bottom-16 left-6 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl animate-float-slow" />
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">AI Data Quality Engineer</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-5xl">
            Data quality control room for revenue-critical pipelines
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-300">
            Ingest CSVs, profile quality risks, and orchestrate safe cleaning steps with Gemini-powered reasoning and automated guardrails.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <span className={`rounded-full border px-4 py-2 ${token ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "border-slate-700 bg-slate-950/40 text-slate-300"}`}>
              {token ? "Connected" : "Offline"}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-950/40 px-4 py-2 text-slate-300">
              API: {API_URL}
            </span>
            {selectedDataset && (
              <span className={`rounded-full border px-4 py-2 ${statusBadge(selectedDataset.status)}`}>
                {selectedDataset.status}
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-4 px-6 py-8 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 animate-rise">
          <p className="text-xs uppercase tracking-widest text-slate-400">Datasets</p>
          <p className="mt-3 text-3xl font-semibold text-emerald-200">{stats.total}</p>
          <p className="mt-1 text-xs text-slate-400">Tracked in your workspace</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 animate-rise">
          <p className="text-xs uppercase tracking-widest text-slate-400">Processing</p>
          <p className="mt-3 text-3xl font-semibold text-amber-200">{stats.processing}</p>
          <p className="mt-1 text-xs text-slate-400">Async jobs running</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 animate-rise">
          <p className="text-xs uppercase tracking-widest text-slate-400">Failed</p>
          <p className="mt-3 text-3xl font-semibold text-rose-200">{stats.failed}</p>
          <p className="mt-1 text-xs text-slate-400">Needs attention</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 animate-rise">
          <p className="text-xs uppercase tracking-widest text-slate-400">Latest Score</p>
          <p className={`mt-3 text-3xl font-semibold ${scoreTone}`}>{stats.latestScore}</p>
          <p className="mt-1 text-xs text-slate-400">Quality index</p>
        </div>
      </section>

      <main className="mx-auto grid max-w-7xl gap-8 px-6 pb-16 xl:grid-cols-[1fr,1.5fr]">
        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Operator Access</h2>
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
              <p className="mt-4 text-sm text-emerald-200">Authenticated. Your workspace is live.</p>
            )}
          </div>

          {token && (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
              <h2 className="text-lg font-semibold">Profile</h2>
              <form onSubmit={handleProfileSave} className="mt-4 space-y-3">
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm"
                  placeholder="Full name"
                  value={profileForm.full_name}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, full_name: event.target.value }))
                  }
                />
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm"
                  placeholder="Organization"
                  value={profileForm.organization}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, organization: event.target.value }))
                  }
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-2xl bg-slate-800 py-2 text-xs uppercase tracking-widest text-slate-200"
                >
                  Save Profile
                </button>
              </form>
              {me && (
                <p className="mt-3 text-xs text-slate-400">Logged in as {me.email}</p>
              )}
            </div>
          )}

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
            <h2 className="text-lg font-semibold">Ingest Dataset</h2>
            <p className="mt-2 text-sm text-slate-400">CSV only. Run validation now or queue async.</p>
            <form onSubmit={handleUpload} className="mt-4 space-y-4">
              <input
                type="file"
                accept=".csv"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="w-full rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 px-4 py-3 text-sm"
              />
              <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs uppercase tracking-widest">
                <span>Async processing</span>
                <input
                  type="checkbox"
                  checked={uploadAsync}
                  onChange={(event) => setUploadAsync(event.target.checked)}
                />
              </label>
              <button
                type="submit"
                disabled={!token || busy || !file}
                className="w-full rounded-2xl bg-emerald-400/20 py-2 text-xs uppercase tracking-widest text-emerald-200"
              >
                Upload + Validate
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
            <h2 className="text-lg font-semibold">Operational Runbook</h2>
            <p className="mt-2 text-sm text-slate-400">
              Recommended flow for a complete quality cycle.
            </p>
            <ol className="mt-4 space-y-2 text-sm text-slate-300">
              <li>1. Upload a CSV and run validation.</li>
              <li>2. Generate an LLM summary + cleaning plan.</li>
              <li>3. Queue cleaning and download the output.</li>
              <li>4. Share the JSON/CSV report with stakeholders.</li>
            </ol>
          </div>

          {status && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
              {status}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Dataset Control</h2>
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
                  className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left text-sm ${
                    selectedId === dataset.id
                      ? "border-emerald-400/50 bg-emerald-400/10"
                      : "border-slate-800 bg-slate-950/40"
                  }`}
                >
                  <span>{dataset.filename}</span>
                  <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest ${statusBadge(dataset.status)}`}>
                    {dataset.status}
                  </span>
                </button>
              ))}
            </div>
            {selectedDataset && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  className="rounded-full border border-slate-700 px-3 py-2 text-xs uppercase tracking-widest"
                  onClick={() => enqueueProcessing(selectedDataset.id)}
                  disabled={busy}
                >
                  Queue Validation
                </button>
                <button
                  className="rounded-full border border-slate-700 px-3 py-2 text-xs uppercase tracking-widest"
                  onClick={() => runExplain(selectedDataset.id)}
                  disabled={busy}
                >
                  Generate Explainability
                </button>
                <button
                  className="rounded-full border border-slate-700 px-3 py-2 text-xs uppercase tracking-widest"
                  onClick={() => runCleaning(selectedDataset.id)}
                  disabled={busy}
                >
                  Queue Cleaning
                </button>
                <button
                  className="rounded-full border border-slate-700 px-3 py-2 text-xs uppercase tracking-widest"
                  onClick={() => downloadCleaned(selectedDataset.id)}
                  disabled={busy}
                >
                  Download Cleaned
                </button>
              </div>
            )}
            {cleaningJob && (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-300">
                <p className="uppercase tracking-widest text-slate-400">Cleaning job</p>
                <p className="mt-2">Status: {cleaningJob.status}</p>
                <p>Queued: {formatDate(cleaningJob.created_at)}</p>
                <p>Completed: {formatDate(cleaningJob.completed_at)}</p>
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
              <h2 className="text-lg font-semibold">Score Trend</h2>
              <p className="mt-2 text-xs uppercase tracking-widest text-slate-400">Last validations</p>
              <div className="mt-4">{renderTrendBars(history, "quality_score", 100)}</div>
              <p className="mt-3 text-xs text-slate-400">
                Delta: {scoreDelta === null ? "--" : scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
              </p>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
              <h2 className="text-lg font-semibold">Issue Volume</h2>
              <p className="mt-2 text-xs uppercase tracking-widest text-slate-400">Last validations</p>
              <div className="mt-4">{renderTrendBars(history, "issues_count", 12)}</div>
              <p className="mt-3 text-xs text-slate-400">
                Delta: {issueDelta === null ? "--" : issueDelta > 0 ? `+${issueDelta}` : issueDelta}
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Quality Report</h2>
              {selectedDataset && (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-widest"
                    onClick={() => downloadReport(selectedDataset.id, "json")}
                    disabled={busy}
                  >
                    Export JSON
                  </button>
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-widest"
                    onClick={() => downloadReport(selectedDataset.id, "csv")}
                    disabled={busy}
                  >
                    Export CSV
                  </button>
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-widest"
                    onClick={() => downloadReport(selectedDataset.id, "pdf")}
                    disabled={busy}
                  >
                    Export PDF
                  </button>
                </div>
              )}
            </div>
            {!report && <p className="mt-3 text-sm text-slate-400">Select a dataset to view its report.</p>}
            {report && (
              <div className="mt-4 space-y-6 text-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                    <p className="text-xs uppercase tracking-widest text-slate-400">Quality Score</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`text-3xl font-semibold ${scoreTone}`}>{report.quality_score}</span>
                      <span className="text-xs text-slate-400">Issue count: {report.issues_json.length}</span>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-slate-800">
                      <div
                        className="h-2 rounded-full bg-emerald-400/70"
                        style={{ width: `${report.quality_score}%` }}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                    <p className="text-xs uppercase tracking-widest text-slate-400">Dataset Profile</p>
                    <div className="mt-2 space-y-1 text-sm text-slate-200">
                      <p>Rows: {report.profile_json?.rows ?? "--"}</p>
                      <p>Columns: {report.profile_json?.columns?.length ?? "--"}</p>
                      <p>Duplicates: {report.profile_json?.duplicates ?? "--"}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Issue Breakdown</p>
                  {issueCounts.length === 0 && (
                    <p className="mt-3 text-sm text-slate-400">No issues detected.</p>
                  )}
                  {issueCounts.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {issueCounts.map(([type, count]) => (
                        <span
                          key={type}
                          className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs uppercase tracking-widest text-slate-200"
                        >
                          {type} · {count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                    <p className="text-xs uppercase tracking-widest text-slate-400">Explainability</p>
                    <p className="mt-3 text-sm text-slate-200">
                      {report.llm_summary || "Generate a summary to explain the risks and recommended fixes."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                    <p className="text-xs uppercase tracking-widest text-slate-400">Cleaning Plan</p>
                    {planSteps.length === 0 && (
                      <p className="mt-3 text-sm text-slate-400">No plan yet. Generate explainability to create one.</p>
                    )}
                    {planSteps.length > 0 && (
                      <div className="mt-3 space-y-2 text-sm text-slate-200">
                        {planSteps.map((step, idx) => (
                          <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
                            <p className="font-medium">{step.action}</p>
                            <p className="text-xs text-slate-400">{step.details}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Dataset Comparison</h2>
              {datasets.length > 1 && (
                <select
                  value={compareId}
                  onChange={(event) => setCompareId(event.target.value)}
                  className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs uppercase tracking-widest text-slate-200"
                >
                  {datasets
                    .filter((item) => item.id !== selectedId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.filename}
                      </option>
                    ))}
                </select>
              )}
            </div>
            {datasets.length <= 1 && (
              <p className="mt-3 text-sm text-slate-400">Upload at least two datasets to compare.</p>
            )}
            {datasets.length > 1 && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Primary</p>
                  <p className="mt-2 text-sm text-slate-200">{selectedDataset?.filename || "--"}</p>
                  <div className="mt-3 space-y-1 text-xs text-slate-300">
                    <p>Score: {report?.quality_score ?? "--"}</p>
                    <p>Issues: {report?.issues_json?.length ?? "--"}</p>
                    <p>Rows: {report?.profile_json?.rows ?? "--"}</p>
                    <p>Duplicates: {report?.profile_json?.duplicates ?? "--"}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Comparison</p>
                  <p className="mt-2 text-sm text-slate-200">{datasets.find((item) => item.id === compareId)?.filename || "--"}</p>
                  <div className="mt-3 space-y-1 text-xs text-slate-300">
                    <p>Score: {compareReport?.quality_score ?? "--"}</p>
                    <p>Issues: {compareReport?.issues_json?.length ?? "--"}</p>
                    <p>Rows: {compareReport?.profile_json?.rows ?? "--"}</p>
                    <p>Duplicates: {compareReport?.profile_json?.duplicates ?? "--"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
            <h2 className="text-lg font-semibold">Column Health</h2>
            {columnCards.length === 0 && (
              <p className="mt-3 text-sm text-slate-400">No column profile available yet.</p>
            )}
            {columnCards.length > 0 && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {columnCards.map((card) => (
                  <div key={card.col} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
                    <p className="text-sm font-medium text-slate-200">{card.col}</p>
                    <p className="text-xs text-slate-400">Type: {card.dtype}</p>
                    <p className="text-xs text-slate-400">Nulls: {card.nulls}%</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
              <h2 className="text-lg font-semibold">Null Distribution</h2>
              <div className="mt-4">{renderNullChart()}</div>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 animate-rise">
              <h2 className="text-lg font-semibold">Dataset Preview</h2>
              {!preview && <p className="mt-3 text-sm text-slate-400">Upload and select a dataset to preview rows.</p>}
              {preview && (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/40">
                  <table className="w-full text-xs text-slate-200">
                    <thead className="bg-slate-900/60 text-[11px] uppercase tracking-widest text-slate-400">
                      <tr>
                        {preview.columns.map((col) => (
                          <th key={col} className="px-3 py-2 text-left">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, idx) => (
                        <tr key={idx} className="border-t border-slate-800">
                          {preview.columns.map((col) => (
                            <td key={col} className="px-3 py-2">
                              {row[col] ?? "--"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
