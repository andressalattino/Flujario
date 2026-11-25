import { Link } from "react-router";
import { BrandArtwork } from "./brand-artwork";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="Flujario, inicio"
      className={`wordmark ${compact ? "wordmark-small" : ""}`}
    >
      <BrandArtwork />
    </Link>
  );
}
