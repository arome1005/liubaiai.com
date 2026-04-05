"use client"

import { useState } from "react"
import { AppShell } from "@/components/app-shell"
import { CangJingModule } from "@/components/modules/cangjing-module"
import { ShengHuiModule } from "@/components/modules/shenghui-module"
import { LuoBiModule } from "@/components/modules/luobi-module"
import { TuiYanModule } from "@/components/modules/tuiyan-module"
import { EmptyModule } from "@/components/modules/empty-module"

export default function Home() {
  const [activeModule, setActiveModule] = useState("tuiyan")

  const renderModule = () => {
    switch (activeModule) {
      case "cangjing":
        return <CangJingModule />
      case "shenghui":
        return <ShengHuiModule />
      case "luobi":
        return <LuoBiModule />
      case "tuiyan":
        return <TuiYanModule />
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
