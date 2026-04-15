"use client"

import { useState } from "react"
import { AppShell } from "@/components/app-shell"
import { CangJingModule } from "@/components/modules/cangjing-module"
import { ShengHuiModule } from "@/components/modules/shenghui-module"
import { LuoBiModule } from "@/components/modules/luobi-module"
import { TuiYanModule } from "@/components/modules/tuiyan-module"
import { LiuBaiModule } from "@/components/modules/liubai-module"
import { LiuguangModule } from "@/components/modules/liuguang-module"
import { WenCeModule } from "@/components/modules/wence-module"
import { SettingsModule } from "@/components/modules/settings-module"
import { EmptyModule } from "@/components/modules/empty-module"
import { ImmersiveEditor } from "@/components/immersive-editor"

// 当前编辑的作品信息
interface EditingWork {
  id: string
  title: string
}

export default function Home() {
  const [activeModule, setActiveModule] = useState("liubai")
  const [editingWork, setEditingWork] = useState<EditingWork | null>(null)

  // 如果正在编辑作品（从留白作品卡片点击进入），显示沉浸式写作页面
  if (editingWork) {
    return (
      <ImmersiveEditor
        workTitle={editingWork.title}
        onExit={() => setEditingWork(null)}
      />
    )
  }

  const renderModule = () => {
    switch (activeModule) {
      case "liubai":
        return <LiuBaiModule onOpenWork={(workId, workTitle) => setEditingWork({ id: workId, title: workTitle })} />
      case "tuiyan":
        return <TuiYanModule />
      case "liuguang":
        return <LiuguangModule />
      case "wence":
        return <WenCeModule />
      case "luobi":
        return <LuoBiModule />
      case "shenghui":
        return <ShengHuiModule />
      case "cangjing":
        return <CangJingModule />
      case "settings":
        return <SettingsModule />
      default:
        return <EmptyModule moduleId={activeModule} />
    }
  }

  return (
    <AppShell activeModule={activeModule} onModuleChange={setActiveModule}>
      {renderModule()}
    </AppShell>
  )
}
