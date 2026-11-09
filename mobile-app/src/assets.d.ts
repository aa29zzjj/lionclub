// esbuild embeds these PNGs as data URLs in the native bundle.
declare module "*.png" {
  const url: string;
  export default url;
}
