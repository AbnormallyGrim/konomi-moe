/** Entry point of the dev page (index.html). */
import { devHost } from "./dev-host.ts";
import { mount } from "./index.tsx";

mount(devHost(), document.getElementById("app") ?? document.body);
