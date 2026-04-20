"use client";

const PS5Icon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M8.985 2.596v17.548l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.181.76.814.76 1.505v5.609c2.205 1.017 3.855-.136 3.855-3.24 0-3.19-1.108-4.695-4.342-5.775-1.168-.39-3.143-.913-4.982-1.2zm8.82 14.644c-1.863.67-3.773.182-4.296-.182v-2.373c.898.538 2.55 1.047 3.734.608 1.184-.442 1.229-1.627.044-2.235-.943-.477-1.942-.67-2.685-.9v-2.073c.743.15 1.942.332 2.685.628 2.384.955 3.024 3.148 1.517 4.527zm-12.2 3.01l3.955 1.354V19.25l-3.955-1.354v2.354z"/>
  </svg>
);

const XboxIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 1.86 7.484 8.796 6.44 11.34C23.086 15.96 24 14.083 24 12c0-3.328-1.7-6.26-4.281-7.984-1.186-.767-4.875 2.099-4.457 2.611zm-6.522 0c.418-.512-3.271-3.378-4.457-2.61C1.699 5.738 0 8.67 0 11.998c0 2.083.914 3.96 2.298 5.967-1.044-2.544 3.94-9.48 6.442-11.338zM12 1.077c-1.275 0-2.497.22-3.633.613C7.748 1.99 7.418 3.072 7.418 3.072S9.01 1.898 12 1.898c2.99 0 4.582 1.174 4.582 1.174s-.33-1.082-.949-1.382A10.935 10.935 0 0 0 12 1.077z"/>
  </svg>
);

const PCIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M0 0l10.956 15.418L0 24h2.48l9.397-8.143L19.58 24H24L12.573 7.985 22.516 0h-2.48l-8.397 7.267L4.42 0zm4.34 1.745h2.02l13.31 20.51h-2.02z"/>
  </svg>
);

interface Props { size?: "sm" | "md"; showLabel?: boolean; }

export default function ConsoleBadges({ size = "md", showLabel = true }: Props) {
  const pad = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
  const platforms = [
    { key: "PS5",  Icon: PS5Icon,  label: "PS5",  color: "text-blue-400"  },
    { key: "XBOX", Icon: XboxIcon, label: "Xbox", color: "text-green-400" },
    { key: "PC",   Icon: PCIcon,   label: "PC",   color: "text-gray-300"  },
  ];
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {platforms.map(({ key, Icon, label, color }) => (
        <div key={key}
          className={`flex items-center gap-1 ${pad} rounded-lg bg-gray-800 border border-gray-700 ${color} font-medium`}
          title={`${label} — CROSSPLAY habilitado`}
        >
          <Icon />
          {showLabel && <span>{label}</span>}
        </div>
      ))}
      <span className="ml-1 text-xs text-green-400 font-bold border border-green-500/30 bg-green-500/10 px-2 py-0.5 rounded-full">
        ✓ CROSSPLAY
      </span>
    </div>
  );
}
