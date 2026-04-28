import { useState } from "react";
import type { AiProviderId } from "../../ai/types";
import { providerLogoFallbackText, providerLogoImgSrc } from "./provider-ui";

/** 单一视觉：PNG 或一字回退，避免与侧栏列表双行文字错位 */
export function AiProviderLogo(props: { provider: AiProviderId }) {
  const p = props.provider;
  const imgSrc = providerLogoImgSrc(p);
  const text = providerLogoFallbackText(p);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = Boolean(imgSrc) && !imgFailed;

  return (
    <span aria-hidden className="provider-logo" data-provider={p} title={p}>
      {showImg ? (
        <img
          src={imgSrc!}
          alt=""
          className="provider-logo-img"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="provider-logo-fallback">{text || "·"}</span>
      )}
    </span>
  );
}
