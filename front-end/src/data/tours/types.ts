/* A module's guided tour: short steps, each pointing at one part of the page. */
export interface TourStep {
  /** CSS selector of the element the bubble points at. A step whose element is not on the page (another role, an empty list) is skipped;
   *  no selector: the bubble is centred (an introduction or a closing note). Prefer `[data-tour="…"]` hooks in the module's markup. */
  target?: string;
  title: string;
  body: string;
}
/** `version`: raise it whenever the steps change in a way people should see again ("Again after updates"). */
export interface ModuleTour { version: number; title: string; steps: TourStep[] }
export type Tours = Record<string, ModuleTour>;
