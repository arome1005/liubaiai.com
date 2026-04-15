import { cn } from "../lib/utils"

/** Vite `public/` 下资源路径（尊重 `base` 子路径部署） */
export function modelLogoSrc(file: string): string {
  let base = import.meta.env.BASE_URL || "/"
  if (!base.endsWith("/")) base += "/"
  return `${base}${file.replace(/^\//, "")}`
}

/** 选择器左侧：圆形底 + 品牌 PNG（留白产品人设，非官方商标用途展示） */
export function ModelPersonaLogo(props: {
  src: string
  className?: string
  ringClassName?: string
}) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/40 ring-1 ring-border/50",
        props.ringClassName,
        props.className,
      )}
    >
      <img
        src={props.src}
        alt=""
        className="h-6 w-6 object-contain"
        draggable={false}
      />
    </div>
  )
}
