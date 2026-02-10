const statCards = [
  { label: "Datasets", value: "0" },
  { label: "Avg Quality", value: "--" },
  { label: "Issues Found", value: "--" }
];

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">AI Data Quality Engineer</p>
            <h1 className="mt-3 text-4xl font-semibold">Production-grade data quality intelligence</h1>
            <p className="mt-3 max-w-xl text-slate-300">
              Upload datasets, detect quality issues, and generate safe cleaning plans backed by GenAI reasoning.
            </p>
          </div>
          <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm text-emerald-200">
            API Ready
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16">
        <section className="grid gap-4 md:grid-cols-3">
          {statCards.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-xs uppercase tracking-widest text-slate-400">{stat.label}</p>
              <p className="mt-4 text-3xl font-semibold text-emerald-200">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
            <h2 className="text-xl font-semibold">Upload a Dataset</h2>
            <p className="mt-2 text-sm text-slate-400">
              CSV only. Large files will be queued and processed asynchronously.
            </p>
            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 px-6 py-10 text-center">
              <p className="text-sm text-slate-400">Drag and drop CSV files here</p>
              <button className="mx-auto mt-2 w-fit rounded-full bg-emerald-400/20 px-4 py-2 text-xs uppercase tracking-widest text-emerald-200">
                Choose file
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
            <h2 className="text-xl font-semibold">Latest Reports</h2>
            <p className="mt-2 text-sm text-slate-400">
              Connect the backend to see real dataset health metrics.
            </p>
            <ul className="mt-6 space-y-4">
              <li className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-sm text-slate-300">No reports yet</p>
                <p className="mt-1 text-xs text-slate-500">Run validation to populate this panel.</p>
              </li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
