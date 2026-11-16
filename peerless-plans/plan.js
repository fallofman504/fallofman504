// Shared sample floor plan drawing (hero graphic and order preview).
// Geometry is illustrative only; it is not a client drawing.
(function () {
  function offices() {
    let s = "";
    for (let i = 0; i < 4; i++) {
      const x = 40 + i * 100;
      if (i > 0) s += `<path pathLength="1" class="draw wall" d="M${x} 40V140"/>`;
      s += `<path pathLength="1" class="draw wall" d="M${x} 140H${x + 60}M${x + 90} 140H${x + 100}"/>`;
      s += `<path pathLength="1" class="draw thin" d="M${x + 60} 140V170M${x + 60} 170A30 30 0 0 0 ${x + 90} 140"/>`;
      s += `<text class="lbl" x="${x + 50}" y="94">OFFICE</text><text class="lbl dim" x="${x + 50}" y="108">10${i + 1}</text>`;
    }
    return s;
  }
  function stations() {
    let s = "";
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 5; c++)
        s += `<rect pathLength="1" class="draw thin" x="${212 + c * 40}" y="${192 + r * 52}" width="34" height="34"/>`;
    return s;
  }
  function mullions() {
    let s = "";
    for (let x = 65; x < 560; x += 25) s += `<path class="thin tick" d="M${x} 36V44"/>`;
    return s;
  }
  window.peerlessPlanSVG = function (opts) {
    opts = opts || {};
    const vb = opts.viewBox || "0 0 620 400";
    const wm = opts.watermark
      ? `<defs><pattern id="wm" width="230" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
           <text class="wm" x="0" y="24">PEERLESS PLANS · UNCHECKED DRAFT</text>
           <text class="wm" x="90" y="56">PREVIEW ONLY · NOT FOR USE</text>
         </pattern></defs>`
      : "";
    const wmRect = opts.watermark ? `<rect x="-100" y="-100" width="900" height="700" fill="url(#wm)"/>` : "";
    return `<svg class="plan${opts.animate ? " animate" : ""}" viewBox="${vb}" role="img" aria-label="${opts.label || "Sample office test fit drawing"}" preserveAspectRatio="xMidYMid meet">
      ${wm}
      <rect pathLength="1" class="draw ext" x="40" y="40" width="520" height="300"/>
      ${mullions()}
      ${offices()}
      <path pathLength="1" class="draw wall" d="M440 40V150M440 180H560"/>
      <path pathLength="1" class="draw thin" d="M440 150H410M410 150A30 30 0 0 0 440 180"/>
      <text class="lbl" x="500" y="104">CONFERENCE</text><text class="lbl dim" x="500" y="118">12 × 18</text>
      <path pathLength="1" class="draw wall" d="M40 240H180V300"/>
      <text class="lbl" x="110" y="286">RECEPTION</text>
      <path pathLength="1" class="draw thin" d="M100 340V300M100 300A40 40 0 0 1 140 340"/>
      <path pathLength="1" class="draw wall" d="M560 240H440V310"/>
      <text class="lbl" x="500" y="286">BREAK</text>
      ${stations()}
      <text class="lbl dim" x="310" y="240">OPEN OFFICE · 10 SEATS</text>
      <rect class="col" x="186" y="186" width="8" height="8"/><rect class="col" x="424" y="186" width="8" height="8"/>
      <path class="thin tick" d="M40 366H560M40 360V372M560 360V372"/>
      <text class="lbl dim" x="300" y="384">104'-0"</text>
      <path class="thin tick" d="M584 40V340M578 40H590M578 340H590"/>
      <text class="lbl dim" x="600" y="194" transform="rotate(90 600 194)">60'-0"</text>
      ${wmRect}
    </svg>`;
  };
})();
