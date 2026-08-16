import { FileDrop } from '@app/panels/FileDrop';
import { LapTable } from '@app/panels/LapTable';

export default function App() {
  return (
    <div className="layout">
      <header className="titlebar">
        <span className="product">LapLedger</span>
        <FileDrop />
      </header>
      <aside className="panel area-laps">
        <h2>Laps</h2>
        <LapTable />
      </aside>
      <section className="panel area-delta">
        <h2>Delta</h2>
      </section>
      <section className="panel area-channels">
        <h2>Channels</h2>
      </section>
    </div>
  );
}
