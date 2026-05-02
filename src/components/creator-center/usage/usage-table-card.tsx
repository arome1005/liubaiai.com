"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight, FileText, Inbox } from "lucide-react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { cn } from "../../../lib/utils";
import type { AiProviderId, UsageRecord } from "../../../util/usage-types";
import { providerLabels } from "../../../util/usage-mock-data";

interface UsageTableCardProps {
  records: UsageRecord[];
}

type SortKey = "timestamp" | "inputTokens" | "outputTokens" | "reasoningTokens" | "totalTokens";
type SortOrder = "asc" | "desc";

const PAGE_SIZE = 5;

function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function UsageTableSortHeader(props: {
  column: SortKey;
  label: string;
  activeColumn: SortKey;
  onSort: (column: SortKey) => void;
}) {
  const { column, label, activeColumn, onSort } = props;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-3 h-7 gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={() => onSort(column)}
    >
      {label}
      <ArrowUpDown
        className={cn("size-3 transition-colors", activeColumn === column ? "text-foreground" : "text-muted-foreground/50")}
      />
    </Button>
  );
}

export function UsageTableCard({ records }: UsageTableCardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterProvider, setFilterProvider] = useState<AiProviderId | "all">("all");
  const [page, setPage] = useState(0);

  const filteredAndSorted = useMemo(() => {
    let result = [...records];
    if (filterProvider !== "all") {
      result = result.filter((r) => r.provider === filterProvider);
    }
    result.sort((a, b) => {
      let aVal: number = 0;
      let bVal: number = 0;
      if (sortKey === "timestamp") {
        aVal = new Date(a.timestamp).getTime();
        bVal = new Date(b.timestamp).getTime();
      } else if (sortKey === "reasoningTokens") {
        aVal = a.reasoningTokens ?? 0;
        bVal = b.reasoningTokens ?? 0;
      } else {
        aVal = a[sortKey];
        bVal = b[sortKey];
      }
      if (sortOrder === "asc") {
        return aVal < bVal ? -1 : 1;
      }
      return aVal > bVal ? -1 : 1;
    });
    return result;
  }, [records, sortKey, sortOrder, filterProvider]);

  const totalPages = Math.ceil(filteredAndSorted.length / PAGE_SIZE) || 1;
  const paginatedRecords = filteredAndSorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
    setPage(0);
  };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-tight">
            <FileText className="size-4 text-chart-4" />
            调用明细
          </CardTitle>
          <Select
            value={filterProvider}
            onValueChange={(v) => {
              setFilterProvider(v as AiProviderId | "all");
              setPage(0);
            }}
          >
            <SelectTrigger className="h-8 w-[130px] border-border/50 bg-transparent text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部提供方</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="local">本地</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filteredAndSorted.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-lg border border-border/50 bg-muted/20 [-webkit-overflow-scrolling:touch]">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="w-[70px]">
                      <UsageTableSortHeader column="timestamp" label="时间" activeColumn={sortKey} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">任务</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">模型</TableHead>
                    <TableHead className="text-right">
                      <UsageTableSortHeader column="inputTokens" label="In" activeColumn={sortKey} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-right">
                      <UsageTableSortHeader column="outputTokens" label="Out" activeColumn={sortKey} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-right" title="思考/推理 token：思考模型计费但不可见的部分（已计入 Total）">
                      <UsageTableSortHeader column="reasoningTokens" label="思考" activeColumn={sortKey} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-right">
                      <UsageTableSortHeader column="totalTokens" label="Total" activeColumn={sortKey} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="w-[60px] text-xs font-medium text-muted-foreground">口径</TableHead>
                    <TableHead className="w-[50px] text-xs font-medium text-muted-foreground">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRecords.map((record, idx) => (
                    <TableRow
                      key={record.id}
                      className={cn(
                        "border-border/30 transition-colors hover:bg-muted/30",
                        idx === paginatedRecords.length - 1 && "border-b-0",
                      )}
                    >
                      <TableCell className="number-display text-xs text-muted-foreground">
                        {formatTime(new Date(record.timestamp))}
                      </TableCell>
                      <TableCell className="text-sm">{record.task}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{record.model}</span>
                          <span className="text-[10px] text-muted-foreground">{providerLabels[record.provider]}</span>
                        </div>
                      </TableCell>
                      <TableCell className="number-display text-right text-sm">{formatNumber(record.inputTokens)}</TableCell>
                      <TableCell className="number-display text-right text-sm">{formatNumber(record.outputTokens)}</TableCell>
                      <TableCell
                        className="number-display text-right text-sm text-muted-foreground"
                        title={
                          record.reasoningTokens != null
                            ? `厂商披露的思考/推理 token（已计入 Total）`
                            : `本次调用未披露思考 token（非思考模型或厂商未返回该字段）`
                        }
                      >
                        {record.reasoningTokens != null ? formatNumber(record.reasoningTokens) : "—"}
                      </TableCell>
                      <TableCell className="number-display text-right text-sm font-medium">{formatNumber(record.totalTokens)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] font-normal",
                            record.source === "api" ? "bg-chart-1/10 text-chart-1" : "bg-chart-3/10 text-chart-3",
                          )}
                        >
                          {record.source === "api" ? "API" : "粗估"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div
                          className={cn("size-2 rounded-full", record.status === "success" ? "bg-chart-2" : "bg-destructive")}
                          title={record.status === "success" ? "成功" : "失败"}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  共 <span className="number-display">{filteredAndSorted.length}</span> 条
                </p>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="size-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="size-4" />
                    <span className="sr-only">上一页</span>
                  </Button>
                  <span className="number-display min-w-[50px] text-center text-xs text-muted-foreground">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight className="size-4" />
                    <span className="sr-only">下一页</span>
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted/50 p-4">
              <Inbox className="size-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">暂无明细记录</p>
            <p className="mt-1 text-xs text-muted-foreground/70">开启用量日志后显示</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
