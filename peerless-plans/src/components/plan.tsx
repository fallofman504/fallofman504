// Sample floor plan drawing for the home page. The geometry is illustrative; it is not a client drawing.
export function SamplePlan() {
  const offices = [0, 1, 2, 3].map((i) => 40 + i * 100);
  const stations = [0, 1].flatMap((r) => [0, 1, 2, 3, 4].map((c) => [212 + c * 40, 192 + r * 52]));
  const mullions = Array.from({ length: 20 }, (_, i) => 65 + i * 25);
  return (
    <svg className="plan animate" viewBox="0 0 620 400" role="img" aria-label="Sample office test fit drawing">
      <rect pathLength={1} className="draw ext" x="40" y="40" width="520" height="300" />
      {mullions.map((x) => <path key={x} className="thin tick" d={`M${x} 36V44`} />)}
      {offices.map((x, i) => (
        <g key={x}>
          {i > 0 && <path pathLength={1} className="draw wall" d={`M${x} 40V140`} />}
          <path pathLength={1} className="draw wall" d={`M${x} 140H${x + 60}M${x + 90} 140H${x + 100}`} />
          <path pathLength={1} className="draw thin" d={`M${x + 60} 140V170M${x + 60} 170A30 30 0 0 0 ${x + 90} 140`} />
          <text className="lbl" x={x + 50} y="94">OFFICE</text>
          <text className="lbl dim" x={x + 50} y="108">{101 + i}</text>
        </g>
      ))}
      <path pathLength={1} className="draw wall" d="M440 40V150M440 180H560" />
      <path pathLength={1} className="draw thin" d="M440 150H410M410 150A30 30 0 0 0 440 180" />
      <text className="lbl" x="500" y="104">CONFERENCE</text>
      <text className="lbl dim" x="500" y="118">12 × 18</text>
      <path pathLength={1} className="draw wall" d="M40 240H180V300" />
      <text className="lbl" x="110" y="286">RECEPTION</text>
      <path pathLength={1} className="draw thin" d="M100 340V300M100 300A40 40 0 0 1 140 340" />
      <path pathLength={1} className="draw wall" d="M560 240H440V310" />
      <text className="lbl" x="500" y="286">BREAK</text>
      {stations.map(([x, y]) => <rect key={`${x}-${y}`} pathLength={1} className="draw thin" x={x} y={y} width="34" height="34" />)}
      <text className="lbl dim" x="310" y="240">OPEN OFFICE · 10 SEATS</text>
      <rect className="col" x="186" y="186" width="8" height="8" />
      <rect className="col" x="424" y="186" width="8" height="8" />
      <path className="thin tick" d="M40 366H560M40 360V372M560 360V372" />
      <text className="lbl dim" x="300" y="384">104&apos;-0&quot;</text>
      <path className="thin tick" d="M584 40V340M578 40H590M578 340H590" />
      <text className="lbl dim" x="600" y="194" transform="rotate(90 600 194)">60&apos;-0&quot;</text>
    </svg>
  );
}
