export default function Loading() {
  return (
    <main className="loading-screen" aria-busy="true" aria-label="Caricamento del tabellone">
      <div className="loading-mark">IQ</div>
      <div><p className="eyebrow">IQstatS</p><h1>Sto preparando il tabellone.</h1><p>I dati vengono verificati lato server.</p></div>
      <div className="loading-bars" aria-hidden="true"><i /><i /><i /></div>
    </main>
  );
}
