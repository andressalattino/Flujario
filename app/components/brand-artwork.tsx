// El viewBox recorta el margen transparente sin alterar ni ampliar el archivo.
// Las dos variantes conservan el dorado; un filtro invert también lo cambiaría.
export function BrandArtwork() {
  return (
    <span className="brand-artwork" aria-hidden="true">
      <svg className="brand-artwork-light" viewBox="216 111 1732 524" width="200" height="61">
        <image href="/images/flujario-wordmark-light.png" width="2172" height="724" />
      </svg>
      <svg className="brand-artwork-dark" viewBox="190 90 1804 552" width="200" height="61">
        <image href="/images/flujario-wordmark-dark.png" width="2172" height="724" />
      </svg>
    </span>
  );
}
