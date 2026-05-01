import { Button } from "../ui/button";

export function WritingSettingsAnchorNav(props: { onCollapseAll: () => void; onExpandAll: () => void }) {
  return (
    <div className="ws-settings-head sticky top-0 z-10 -mx-0.5 mb-1 flex border-b border-border/45 bg-background/90 pb-1 pt-0 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="flex w-full justify-end gap-0.5">
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={props.onCollapseAll}>
          全部收起
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={props.onExpandAll}>
          全部展开
        </Button>
      </div>
    </div>
  );
}
