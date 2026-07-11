export function formatMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

export function formatDuration(s: number): string {
  if (s < 60) return `${Math.round(s)} dtk`;
  const totalMin = Math.floor(s / 60);
  const sec = Math.round(s - totalMin * 60);
  if (totalMin < 60) return sec ? `${totalMin} mnt ${sec} dtk` : `${totalMin} mnt`;
  const h = Math.floor(totalMin / 60);
  const min = totalMin - h * 60;
  return min ? `${h} jam ${min} mnt` : `${h} jam`;
}

export function formatNumber(n: number, digits: number = 0): string {
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatLiters(l: number): string {
  if (l >= 1000) return `${(l / 1000).toFixed(1)} kL`;
  return `${Math.round(l)} L`;
}
