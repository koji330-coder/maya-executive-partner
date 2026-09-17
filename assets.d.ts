/** Metro turns an image import into an opaque asset id. */
declare module '*.webp' {
  const asset: number;
  export default asset;
}
declare module '*.png' {
  const asset: number;
  export default asset;
}
