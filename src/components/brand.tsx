import { Music2 } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-lockup" aria-label="Cardápio Musical">
      <span className="brand-mark" aria-hidden="true">
        <Music2 size={20} strokeWidth={2.4} />
      </span>
      <span>
        <span className="brand-name">Cardápio Musical</span>
        {!compact && <span className="brand-caption">Seu repertório no ritmo do show</span>}
      </span>
    </span>
  );
}
