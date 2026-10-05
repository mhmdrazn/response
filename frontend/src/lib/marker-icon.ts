import L from "leaflet";

/** Extra room around the glyph for the selection halo. */
const HALO_PAD = 22;

/**
 * Map icon for a depot, outlet or clinic. Selection reads as a soft halo in the
 * marker's own colour, never an outline, so it matches the flood markers.
 */
export function selectableIcon(glyphHtml: string, size: number, color: string, selected: boolean) {
  const box = size + HALO_PAD * 2;
  const halo = selected
    ? `<div class="soft-pop" style="
        position:absolute; inset:${HALO_PAD - 8}px;
        border-radius:50%;
        background:color-mix(in srgb, ${color} 30%, transparent);
        pointer-events:none;
      "></div>`
    : "";
  return L.divIcon({
    html: `
      <div style="position:relative; width:${box}px; height:${box}px; display:flex; align-items:center; justify-content:center;">
        ${halo}
        <div style="position:relative;">${glyphHtml}</div>
      </div>
    `,
    className: "",
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
  });
}
