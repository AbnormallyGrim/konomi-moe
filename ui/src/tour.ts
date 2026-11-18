/**
 * The first-run walkthrough: a short, high-level look at the three pages (For you, Stats,
 * Settings), built on Driver.js. Each step names the page it belongs to, and the tour switches
 * to that page before highlighting, so Back and Next work in either direction.
 */

import { type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";

export type TourView = "foryou" | "stats" | "settings";

interface TourStep {
  view: TourView;
  /** What to highlight; none shows the popover in the middle of the page. */
  target?: () => Element;
  title: string;
  description: string;
}

/**
 * The page's nav item. The sidebar shows in the browser, the page tabs inside Seanime, and
 * neither on narrow screens, so it picks whichever is visible, or the page itself.
 */
const nav = (view: TourView) => (): Element => {
  const visible = [...document.querySelectorAll(`[data-tour="nav-${view}"]`)].find(
    (el) => el.getClientRects().length > 0,
  );
  return visible ?? document.querySelector("main") ?? document.body;
};

const filters = (): Element =>
  document.querySelector('[data-tour="filters"]') ??
  document.querySelector("main") ??
  document.body;

function steps(appName: string): TourStep[] {
  return [
    {
      view: "foryou",
      title: `Welcome to ${appName}`,
      description:
        "A quick look around: three pages, under a minute. Press Skip any time to leave the tour.",
    },
    {
      view: "foryou",
      target: nav("foryou"),
      title: "For you",
      description:
        "Your picks, ranked from what you've watched and how you scored it on AniList. Open a card for details, or mark it Not interested.",
    },
    {
      view: "foryou",
      target: filters,
      title: "Filters",
      description:
        "Narrow your picks by genre, format, year and more. Switch between anime and manga at the top of the page.",
    },
    {
      view: "stats",
      target: nav("stats"),
      title: "Stats",
      description:
        "What the recommendations learned from your lists: what you tend to enjoy and avoid.",
    },
    {
      view: "settings",
      target: nav("settings"),
      title: "Settings",
      description:
        "Title language, ratings, picks per page, and the titles and tags you've excluded.",
    },
    {
      view: "settings",
      title: "You're all set",
      description: "You can replay this tour any time from Settings.",
    },
  ];
}

/** Lets Preact render a page switch before the tour looks for its elements. */
const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

/**
 * Starts the tour. `setView` switches pages; `onEnd` runs once it closes, whether finished or
 * skipped.
 */
export function startTour(opts: {
  appName: string;
  setView: (view: TourView) => void;
  onEnd: () => void;
}): void {
  const tour = steps(opts.appName);
  const go = async (index: number) => {
    if (index < 0) return;
    if (index >= tour.length) {
      d.destroy();
      return;
    }
    opts.setView((tour[index] as TourStep).view);
    await nextFrame();
    d.moveTo(index);
  };

  const d = driver({
    steps: tour.map(
      (s): DriveStep => ({
        ...(s.target ? { element: s.target } : {}),
        popover: { title: s.title, description: s.description },
      }),
    ),
    popoverClass: "tour-popover",
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    // Skip replaces the close button; Esc still closes, but a stray click outside doesn't.
    showButtons: ["next", "previous"],
    overlayClickBehavior: "none",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    stageRadius: 10,
    onNextClick: (_el, _step, { index }) => void go((index ?? 0) + 1),
    onPrevClick: (_el, _step, { index }) => void go((index ?? 0) - 1),
    onPopoverRender: (popover, { index }) => {
      if (index === tour.length - 1) return;
      const skip = document.createElement("button");
      skip.type = "button";
      skip.className = "tour-skip";
      skip.textContent = "Skip";
      skip.addEventListener("click", () => d.destroy());
      popover.footer.insertBefore(skip, popover.footer.firstChild);
    },
    onDestroyed: () => opts.onEnd(),
  });

  opts.setView("foryou");
  void nextFrame().then(() => d.drive());
}
