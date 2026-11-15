import type { LayerApi } from "./LayerProvider";

const KEYS: [string, string][] = [
  ["⌘ K", "Jump to any module"],
  ["⌘ J", "Open the AI Assistant"],
  ["⌘ B", "Collapse or expand the sidebar"],
  ["⌘ /", "Show these shortcuts"],
  ["Esc", "Close the open panel, dialog or menu"],
  ["Tab", "Move between controls; Enter or Space activates"],
];

/** Keyboard shortcut reference (Ctrl instead of ⌘ on Windows and Linux). */
export function openShortcuts(L: LayerApi) {
  L.openModal("Keyboard shortcuts", (
    <>
    <dl className="sc-list">
      {KEYS.map(([k, d]) => (
        <div key={k} className="sc-row"><dt>{k.split(" ").map((x) => <kbd key={x} className="sc-key">{x}</kbd>)}</dt><dd>{d}</dd></div>
      ))}
    </dl>
    <p className="field help" style={{ margin: "10px 0 0" }}>On Windows and Linux use Ctrl in place of ⌘.</p>
    </>
  ));
}
