import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { PendingImport } from "../hooks/useReferenceImport";

export interface ImportConfigDialogProps {
  pendingImportFiles: PendingImport | null;
  onConfirm: (titleOrBatchCat: string, singleCat?: string) => void;
  onCancel: () => void;
}

export function ImportConfigDialog({
  pendingImportFiles,
  onConfirm,
  onCancel,
}: ImportConfigDialogProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");

  const isBatch = pendingImportFiles?.isBatch ?? false;
  const fileName = pendingImportFiles && !isBatch ? pendingImportFiles.files[0]!.name : "";
  const type = pendingImportFiles?.type ?? "txt";

  useEffect(() => {
    if (pendingImportFiles) {
      if (!pendingImportFiles.isBatch) {
        setTitle(fileName.replace(new RegExp(`\\.${type}$`, "i"), "").trim() || "未命名");
      } else {
        setTitle("");
      }
      setCategory("");
    }
  }, [pendingImportFiles, fileName, type]);

  const handleConfirm = () => {
    if (isBatch) {
      onConfirm(category); // For batch, titleOrBatchCat is used as the category
    } else {
      if (!title.trim()) return;
      onConfirm(title, category);
    }
  };

  return (
    <Dialog open={pendingImportFiles !== null} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isBatch ? "批量导入藏经" : "导入藏经"}</DialogTitle>
          <DialogDescription>
            {isBatch 
              ? `将导入 ${pendingImportFiles?.files.length} 个文件，可设置统一的默认分类。`
              : `即将导入文件：${fileName}`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {!isBatch && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="import-title" className="text-right">
                藏经标题
              </Label>
              <Input
                id="import-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="col-span-3"
                autoFocus
                placeholder="必填，如：三体"
              />
            </div>
          )}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="import-category" className="text-right">
              {isBatch ? "默认分类" : "分类"}
            </Label>
            <Input
              id="import-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="col-span-3"
              placeholder={isBatch ? "可空；留空则仅按书名管理" : "可空，如：科幻设定"}
              autoFocus={isBatch}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!isBatch && !title.trim()}>
            开始导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
