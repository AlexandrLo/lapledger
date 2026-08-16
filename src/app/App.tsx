import { ChartStack } from '@app/panels/ChartStack';
import { DeltaChart } from '@app/panels/DeltaChart';
import { FileDrop, useFileDrop } from '@app/panels/FileDrop';
import { LapTable } from '@app/panels/LapTable';

export default function App() {
  const fileDrop = useFileDrop();

  return (
    <div
      className="layout"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        fileDrop.load([...event.dataTransfer.files]);
      }}
    >
      <header className="titlebar">
        <span className="product">LapLedger</span>
        <FileDrop busy={fileDrop.busy} error={fileDrop.error} load={fileDrop.load} />
      </header>
      <aside className="panel area-laps">
        <h2>Laps</h2>
        <LapTable />
      </aside>
      <section className="panel area-delta">
        <h2>Delta</h2>
        <DeltaChart />
      </section>
      <section className="panel area-channels">
        <h2>Channels</h2>
        <ChartStack />
      </section>
    </div>
  );
}
