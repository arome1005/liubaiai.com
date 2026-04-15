import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import { LiuBaiModule } from "../v0-modules/liubai-module"
import { TuiYanModule } from "../v0-modules/tuiyan-module"
import { LiuguangModule } from "../v0-modules/liuguang-module"
import { WenCeModule } from "../v0-modules/wence-module"
import { LuoBiModule } from "../v0-modules/luobi-module"
import { ShengHuiModule } from "../v0-modules/shenghui-module"
import { CangJingModule } from "../v0-modules/cangjing-module"
import { SettingsModule } from "../v0-modules/settings-module"

function V0TestPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="border-b border-border/40 bg-card/30 px-6 py-3">
        <h1 className="text-xl font-semibold text-foreground">v0 UI 设计参考</h1>
        <p className="text-sm text-muted-foreground">所有模块一比一展示</p>
      </div>
      
      <Tabs defaultValue="liubai" className="flex-1 flex flex-col">
        <div className="border-b border-border/40 px-6 py-2">
          <TabsList className="w-full max-w-4xl">
            <TabsTrigger value="liubai">留白</TabsTrigger>
            <TabsTrigger value="tuiyan">推演</TabsTrigger>
            <TabsTrigger value="liuguang">流光</TabsTrigger>
            <TabsTrigger value="wence">问策</TabsTrigger>
            <TabsTrigger value="luobi">落笔</TabsTrigger>
            <TabsTrigger value="shenghui">生辉</TabsTrigger>
            <TabsTrigger value="cangjing">藏经</TabsTrigger>
            <TabsTrigger value="settings">设置</TabsTrigger>
          </TabsList>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <TabsContent value="liubai" className="h-full m-0 p-0">
            <LiuBaiModule />
          </TabsContent>
          <TabsContent value="tuiyan" className="h-full m-0 p-0">
            <TuiYanModule />
          </TabsContent>
          <TabsContent value="liuguang" className="h-full m-0 p-0">
            <LiuguangModule />
          </TabsContent>
          <TabsContent value="wence" className="h-full m-0 p-0">
            <WenCeModule />
          </TabsContent>
          <TabsContent value="luobi" className="h-full m-0 p-0">
            <LuoBiModule />
          </TabsContent>
          <TabsContent value="shenghui" className="h-full m-0 p-0">
            <ShengHuiModule />
          </TabsContent>
          <TabsContent value="cangjing" className="h-full m-0 p-0">
            <CangJingModule />
          </TabsContent>
          <TabsContent value="settings" className="h-full m-0 p-0">
            <SettingsModule />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

export default V0TestPage
