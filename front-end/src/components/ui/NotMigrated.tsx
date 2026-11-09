import { Page, Empty } from "./Blocks";
/** Shown for modules that are inventoried but not yet migrated. Tracked in docs/guides/CHECKLIST.md. */
export function NotMigrated({ mod, phase }: { mod: string; phase: string }) {
  return (
    <Page mod={mod}>
      <Empty icon="clock" title="Not migrated yet">This screen is scheduled for {phase} of the migration. See docs/guides/CHECKLIST.md.</Empty>
    </Page>
  );
}
