/** Deliberate preview-only render failure, caught by the real Shell boundary.
 * Contains no member data, bridge calls, I/O, logging or external requests. */
export default function PreviewRenderFailure(): never {
  throw new Error("SYNTHETIC_PREVIEW_RENDER_FAILURE");
}
