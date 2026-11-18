/** Entry point of the page Seanime shows in its frame. */
import { mount } from "@konomi/ui";
import { type Bridge, seanimeHost } from "./frame.ts";

const bridge = (window as unknown as { webview?: Bridge }).webview;
if (bridge) mount(seanimeHost(bridge), document.getElementById("app") ?? document.body);
else document.body.textContent = "This page only works inside Seanime.";
