import { Link } from "react-router-dom";
import { shouldOfferSettingsLinkForAiError } from "../util/ai-error-routing";

export function AiInlineErrorNotice(props: { message: string; className?: string }) {
  const cn = props.className ?? "muted small ai-panel-error";
  return (
    <p className={cn}>
      {props.message}
      {shouldOfferSettingsLinkForAiError(props.message) ? (
        <>
          {" "}
          <Link to="/settings">打开设置</Link>
        </>
      ) : null}
    </p>
  );
}
