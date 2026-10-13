interface GoogleMapsIconProps {
  size?: number;
}

/**
 * The Google Maps pin, for links that open a route in Google Maps. Its brand
 * colours are part of the mark, so they sit outside the design tokens.
 */
export function GoogleMapsIcon({ size = 14 }: GoogleMapsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <defs>
        <clipPath id="gmaps-pin">
          <path d="M12 1.5c-4.4 0-8 3.5-8 7.9 0 5.9 8 13.1 8 13.1s8-7.2 8-13.1C20 5 16.4 1.5 12 1.5z" />
        </clipPath>
      </defs>
      <g clipPath="url(#gmaps-pin)">
        <rect x="0" y="0" width="12" height="9.4" fill="#1A73E8" />
        <rect x="12" y="0" width="12" height="9.4" fill="#EA4335" />
        <rect x="0" y="9.4" width="12" height="15" fill="#FBBC04" />
        <rect x="12" y="9.4" width="12" height="15" fill="#34A853" />
      </g>
      <circle cx="12" cy="9.4" r="3" fill="#FFFFFF" />
    </svg>
  );
}
