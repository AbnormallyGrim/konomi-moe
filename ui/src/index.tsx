/** Public API of the shared UI: mount it with a host. */

import { render } from "preact";
import { App } from "./app.tsx";
import type { Host } from "./host.ts";
import "./styles.css";

export type { Host, HostList, HostUser } from "./host.ts";
export { Session } from "./session.ts";

/** Render the app into `element` (the whole page, normally `document.body`). */
export function mount(host: Host, element: HTMLElement = document.body): void {
  render(<App host={host} />, element);
}
