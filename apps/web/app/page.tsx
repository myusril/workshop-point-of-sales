export default function HomePage() {
  return (
    <main className="skeleton">
      <div className="skeleton__sheet">
        <h1 className="skeleton__title">Workshop POS</h1>
        <p className="skeleton__lead">
          Kerangka aplikasi untuk bengkel: satu transaksi mencampur spare part dan jasa,
          dengan riwayat kendaraan per nomor polisi.
        </p>
        <dl className="skeleton__facts">
          <div className="skeleton__fact">
            <dt>Web</dt>
            <dd>Next.js App Router</dd>
          </div>
          <div className="skeleton__fact">
            <dt>Data</dt>
            <dd>PostgreSQL</dd>
          </div>
          <div className="skeleton__fact">
            <dt>Infrastruktur</dt>
            <dd>Docker Compose</dd>
          </div>
        </dl>
        <a className="skeleton__link" href="/api/v1/health">
          Periksa status sistem
        </a>
      </div>
    </main>
  );
}
