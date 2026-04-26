import { useState } from "react";

const SLOGANS = [
  { main: "留白创作，意在笔先", sub: "灵感落笔，此处有深意。" },
  { main: "留白处，见天地", sub: "去掉冗余，留下纯粹。" },
  { main: "不著一字，尽得风流", sub: "笔墨至简，意境无穷。" },
  { main: "笔尽而意不尽", sub: "给思想留一线天。" },
  { main: "方寸之地", sub: "亦显天地之宽。" },
] as const;

export function AppSplash({ fading }: { fading: boolean }) {
  const [slogan] = useState(() => SLOGANS[Math.floor(Math.random() * SLOGANS.length)]);
  return (
    <div className={`login-splash${fading ? " login-splash--fading" : ""}`} aria-hidden="true">
      <div className="login-splash__inner">
        <p className="login-splash__main">{slogan.main}</p>
        <p className="login-splash__sub">{slogan.sub}</p>
      </div>
      <span className="login-splash__brand">留白写作</span>
    </div>
  );
}
